import hashlib
import logging
import math
import threading
import time
from collections import Counter, OrderedDict

import numpy as np

from core.model_manager import ModelManager
from core.model_runtime.entities.model_entities import ModelType
from core.rag.datasource.keyword.jieba.jieba_keyword_table_handler import JiebaKeywordTableHandler
from core.rag.embedding.cached_embedding import CacheEmbedding
from core.rag.models.document import Document
from core.rag.rerank.entity.weight import VectorSetting, Weights
from core.rag.rerank.rerank_base import BaseRerankRunner

logger = logging.getLogger(__name__)


class WeightRerankRunner(BaseRerankRunner):
    # ==================== Embedding Model Cache Configuration ====================
    # Cache TTL: 30 minutes
    _EMBEDDING_CACHE_TTL_SECONDS = 1800
    # Maximum cache size
    _EMBEDDING_CACHE_MAX_SIZE = 50
    
    # LRU cache for embedding model instances
    _embedding_model_cache: OrderedDict = OrderedDict()
    _embedding_model_lock = threading.Lock()
    
    # Monitoring metrics
    _cache_stats = {
        "embedding_hits": 0,
        "embedding_misses": 0,
        "embedding_evictions": 0,
        "embedding_expired": 0,
    }
    
    def __init__(self, tenant_id: str, weights: Weights):
        self.tenant_id = tenant_id
        self.weights = weights

    def run(
        self,
        query: str,
        documents: list[Document],
        score_threshold: float | None = None,
        top_n: int | None = None,
        user: str | None = None,
    ) -> list[Document]:
        """
        Run rerank model
        :param query: search query
        :param documents: documents for reranking (should be already deduplicated)
        :param score_threshold: score threshold
        :param top_n: top n
        :param user: unique user id if needed

        :return:
        """
        # Note: Deduplication is now handled by RetrievalService before reranking
        # This simplifies the logic and avoids duplicate deduplication
        
        query_scores = self._calculate_keyword_score(query, documents)
        query_vector_scores = self._calculate_cosine(self.tenant_id, query, documents, self.weights.vector_setting)

        rerank_documents = []
        for document, query_score, query_vector_score in zip(documents, query_scores, query_vector_scores):
            score = (
                self.weights.vector_setting.vector_weight * query_vector_score
                + self.weights.keyword_setting.keyword_weight * query_score
            )
            if score_threshold and score < score_threshold:
                continue
            if document.metadata is not None:
                document.metadata["score"] = score
                rerank_documents.append(document)

        rerank_documents.sort(key=lambda x: x.metadata["score"] if x.metadata else 0, reverse=True)
        return rerank_documents[:top_n] if top_n else rerank_documents

    # ==================== Cache Utility Methods ====================
    @classmethod
    def _generate_embedding_cache_key(cls, tenant_id: str, provider: str, model: str) -> str:
        """Generate cache key for embedding model"""
        key_str = f"{tenant_id}:{provider}:{model}"
        return hashlib.md5(key_str.encode()).hexdigest()
    
    @classmethod
    def get_cache_stats(cls) -> dict:
        """Get current cache statistics including hit rates"""
        stats = cls._cache_stats.copy()
        
        total = stats["embedding_hits"] + stats["embedding_misses"]
        stats["embedding_hit_rate"] = (
            stats["embedding_hits"] / total if total > 0 else 0
        )
        stats["embedding_cache_size"] = len(cls._embedding_model_cache)
        
        return stats
    
    @classmethod
    def _is_cache_expired(cls, cached_time: float) -> bool:
        """Check if cached item has exceeded TTL"""
        return (time.time() - cached_time) > cls._EMBEDDING_CACHE_TTL_SECONDS
    
    @classmethod
    def _evict_lru_embedding_model(cls):
        """Evict least recently used embedding model from cache"""
        if cls._embedding_model_cache:
            cls._embedding_model_cache.popitem(last=False)
            cls._cache_stats["embedding_evictions"] += 1
    
    @classmethod
    def _cleanup_expired_embeddings(cls):
        """Remove expired embedding models from cache"""
        current_time = time.time()
        expired_keys = [
            key for key, (_, cached_time) in cls._embedding_model_cache.items()
            if (current_time - cached_time) > cls._EMBEDDING_CACHE_TTL_SECONDS
        ]
        for key in expired_keys:
            del cls._embedding_model_cache[key]
            cls._cache_stats["embedding_expired"] += 1
    
    @classmethod
    def clear_cache(cls):
        """Clear all embedding model caches"""
        with cls._embedding_model_lock:
            cls._embedding_model_cache.clear()
        logger.info("Weight rerank embedding model cache cleared")
    
    @classmethod
    def clear_cache_stats(cls):
        """Reset cache statistics to zero"""
        for key in cls._cache_stats:
            cls._cache_stats[key] = 0
        logger.info("Weight rerank embedding cache statistics reset")

    def _calculate_keyword_score(self, query: str, documents: list[Document]) -> list[float]:
        """
        Calculate BM25 scores
        :param query: search query
        :param documents: documents for reranking

        :return:
        """
        keyword_table_handler = JiebaKeywordTableHandler()
        query_keywords = keyword_table_handler.extract_keywords(query, None)
        documents_keywords = []
        for document in documents:
            # get the document keywords
            document_keywords = keyword_table_handler.extract_keywords(document.page_content, None)
            if document.metadata is not None:
                document.metadata["keywords"] = document_keywords
                documents_keywords.append(document_keywords)

        # Counter query keywords(TF)
        query_keyword_counts = Counter(query_keywords)

        # total documents
        total_documents = len(documents)

        # calculate all documents' keywords IDF
        all_keywords = set()
        for document_keywords in documents_keywords:
            all_keywords.update(document_keywords)

        keyword_idf = {}
        for keyword in all_keywords:
            # calculate include query keywords' documents
            doc_count_containing_keyword = sum(1 for doc_keywords in documents_keywords if keyword in doc_keywords)
            # IDF
            keyword_idf[keyword] = math.log((1 + total_documents) / (1 + doc_count_containing_keyword)) + 1

        query_tfidf = {}

        for keyword, count in query_keyword_counts.items():
            tf = count
            idf = keyword_idf.get(keyword, 0)
            query_tfidf[keyword] = tf * idf

        # calculate all documents' TF-IDF
        documents_tfidf = []
        for document_keywords in documents_keywords:
            document_keyword_counts = Counter(document_keywords)
            document_tfidf = {}
            for keyword, count in document_keyword_counts.items():
                tf = count
                idf = keyword_idf.get(keyword, 0)
                document_tfidf[keyword] = tf * idf
            documents_tfidf.append(document_tfidf)

        def cosine_similarity(vec1, vec2):
            intersection = set(vec1.keys()) & set(vec2.keys())
            numerator = sum(vec1[x] * vec2[x] for x in intersection)

            sum1 = sum(vec1[x] ** 2 for x in vec1)
            sum2 = sum(vec2[x] ** 2 for x in vec2)
            denominator = math.sqrt(sum1) * math.sqrt(sum2)

            if not denominator:
                return 0.0
            else:
                return float(numerator) / denominator

        similarities = []
        for document_tfidf in documents_tfidf:
            similarity = cosine_similarity(query_tfidf, document_tfidf)
            similarities.append(similarity)

        return similarities

    def _calculate_cosine(
        self, tenant_id: str, query: str, documents: list[Document], vector_setting: VectorSetting
    ) -> list[float]:
        """
        Calculate Cosine scores with cached embedding model
        :param tenant_id: tenant id
        :param query: search query
        :param documents: documents for reranking
        :param vector_setting: vector settings

        :return:
        """
        query_vector_scores = []

        # Get embedding model with caching
        cache_embedding = self._get_cached_embedding_model(
            tenant_id,
            vector_setting.embedding_provider_name,
            vector_setting.embedding_model_name
        )
        
        query_vector = cache_embedding.embed_query(query)
        for document in documents:
            # calculate cosine similarity
            if document.metadata and "score" in document.metadata:
                query_vector_scores.append(document.metadata["score"])
            else:
                # transform to NumPy
                vec1 = np.array(query_vector)
                vec2 = np.array(document.vector)

                # calculate dot product
                dot_product = np.dot(vec1, vec2)

                # calculate norm
                norm_vec1 = np.linalg.norm(vec1)
                norm_vec2 = np.linalg.norm(vec2)

                # calculate cosine similarity
                cosine_sim = dot_product / (norm_vec1 * norm_vec2)
                query_vector_scores.append(cosine_sim)

        return query_vector_scores

    def _get_cached_embedding_model(self, tenant_id: str, provider: str, model: str) -> CacheEmbedding:
        """Get embedding model with enhanced caching and double-check locking"""
        # Generate cache key
        cache_key = self._generate_embedding_cache_key(tenant_id, provider, model)
        
        # First check: without lock (fast path for cache hits)
        if cache_key in self._embedding_model_cache:
            cached_embedding, cached_time = self._embedding_model_cache[cache_key]
            
            # Check TTL expiration
            if not self._is_cache_expired(cached_time):
                # Cache hit - move to end (mark as recently used)
                with self._embedding_model_lock:
                    self._embedding_model_cache.move_to_end(cache_key)
                    self._cache_stats["embedding_hits"] += 1
                
                logger.info(
                    f"Weight rerank embedding cache HIT for tenant_id={tenant_id}, "
                    f"provider={provider}, model={model}, age={time.time() - cached_time:.2f}s"
                )
                return cached_embedding
            else:
                # Expired - remove from cache
                with self._embedding_model_lock:
                    del self._embedding_model_cache[cache_key]
                    self._cache_stats["embedding_expired"] += 1
                logger.info(
                    f"Weight rerank embedding cache EXPIRED for tenant_id={tenant_id}, "
                    f"provider={provider}, model={model}"
                )
        
        # Cache miss - load new model
        with self._embedding_model_lock:
            # Double-check: another thread might have loaded it
            if cache_key in self._embedding_model_cache:
                cached_embedding, cached_time = self._embedding_model_cache[cache_key]
                if not self._is_cache_expired(cached_time):
                    self._embedding_model_cache.move_to_end(cache_key)
                    self._cache_stats["embedding_hits"] += 1
                    return cached_embedding
            
            # Record cache miss
            self._cache_stats["embedding_misses"] += 1
            logger.info(
                f"Weight rerank embedding cache MISS for tenant_id={tenant_id}, "
                f"provider={provider}, model={model}, loading..."
            )
            
            # Clean up expired entries
            self._cleanup_expired_embeddings()
            
            # Load new model
            load_start = time.perf_counter()
            model_manager = ModelManager()
            embedding_model = model_manager.get_model_instance(
                tenant_id=tenant_id,
                provider=provider,
                model_type=ModelType.TEXT_EMBEDDING,
                model=model,
            )
            cache_embedding = CacheEmbedding(embedding_model)
            load_duration = time.perf_counter() - load_start
            
            logger.info(
                f"Weight rerank embedding model loaded for tenant_id={tenant_id} in {load_duration:.2f}s"
            )
            
            # Evict LRU if cache is full
            if len(self._embedding_model_cache) >= self._EMBEDDING_CACHE_MAX_SIZE:
                logger.warning(
                    f"Weight rerank embedding cache full ({self._EMBEDDING_CACHE_MAX_SIZE}), evicting LRU entry"
                )
                self._evict_lru_embedding_model()
            
            # Store in cache with current timestamp
            self._embedding_model_cache[cache_key] = (cache_embedding, time.time())
            
            return cache_embedding
