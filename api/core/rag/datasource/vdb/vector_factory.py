import base64
import hashlib
import logging
import threading
import time
from abc import ABC, abstractmethod
from collections import OrderedDict
from typing import Any, override

from sqlalchemy import select

from configs import dify_config
from core.model_manager import ModelManager
from core.rag.datasource.vdb.vector_backend_registry import get_vector_factory_class
from core.rag.datasource.vdb.vector_base import BaseVector, VectorIndexStructDict
from core.rag.datasource.vdb.vector_type import VectorType
from core.rag.embedding.cached_embedding import CacheEmbedding
from core.rag.embedding.embedding_base import Embeddings
from core.rag.index_processor.constant.doc_type import DocType
from core.rag.models.document import Document
from extensions.ext_database import db
from extensions.ext_redis import redis_client
from extensions.ext_storage import storage
from extensions.otel import trace_span
from graphon.model_runtime.entities.model_entities import ModelType
from models.dataset import Dataset, Whitelist
from models.model import UploadFile

logger = logging.getLogger(__name__)


class AbstractVectorFactory(ABC):
    @abstractmethod
    def init_vector(self, dataset: Dataset, attributes: list, embeddings: Embeddings) -> BaseVector:
        raise NotImplementedError

    @staticmethod
    def gen_index_struct_dict(vector_type: VectorType, collection_name: str) -> VectorIndexStructDict:
        index_struct_dict: VectorIndexStructDict = {
            "type": vector_type,
            "vector_store": {"class_prefix": collection_name},
        }
        return index_struct_dict


class _LazyEmbeddings(Embeddings):
    """Lazy proxy that defers materializing the real embedding model.

    Constructing the real embeddings (via ``ModelManager.get_model_instance``)
    transitively calls ``FeatureService.get_features`` → ``BillingService``
    HTTP GETs (see ``provider_manager.py``). Cleanup paths
    (``delete_by_ids`` / ``delete`` / ``text_exists``) do not need embeddings
    at all, so deferring this until an ``embed_*`` method is actually invoked
    keeps cleanup tasks resilient to transient billing-API failures and avoids
    leaving stranded ``document_segments`` / ``child_chunks`` whenever billing
    hiccups.

    Existing callers that perform create / search operations are unaffected:
    the first ``embed_*`` call materializes the underlying model and the
    behavior is identical from that point on.
    """

    def __init__(self, dataset: Dataset, init_latencies: dict[str, float]):
        self._dataset = dataset
        self._init_latencies = init_latencies
        self._real: Embeddings | None = None

    def _ensure(self) -> Embeddings:
        if self._real is None:
            start = time.perf_counter()
            model_manager = ModelManager.for_tenant(tenant_id=self._dataset.tenant_id)
            embedding_model = model_manager.get_model_instance(
                tenant_id=self._dataset.tenant_id,
                provider=self._dataset.embedding_model_provider,
                model_type=ModelType.TEXT_EMBEDDING,
                model=self._dataset.embedding_model,
            )
            self._real = CacheEmbedding(embedding_model)
            self._init_latencies["embedding_model_init"] = time.perf_counter() - start
        return self._real

    @override
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._ensure().embed_documents(texts)

    @override
    def embed_multimodal_documents(self, multimodel_documents: list[dict[str, Any]]) -> list[list[float]]:
        return self._ensure().embed_multimodal_documents(multimodel_documents)

    @override
    def embed_query(self, text: str) -> list[float]:
        return self._ensure().embed_query(text)

    @override
    def embed_multimodal_query(self, multimodel_document: dict[str, Any]) -> list[float]:
        return self._ensure().embed_multimodal_query(multimodel_document)

    @override
    async def aembed_documents(self, texts: list[str]) -> list[list[float]]:
        return await self._ensure().aembed_documents(texts)

    @override
    async def aembed_query(self, text: str) -> list[float]:
        return await self._ensure().aembed_query(text)


class Vector:
    # ==================== Enhanced Cache Configuration ====================
    # Cache TTL: 30 minutes to prevent using stale configurations
    _CACHE_TTL_SECONDS = 1800
    # Maximum cache size: limit memory usage to ~100 instances
    _CACHE_MAX_SIZE = 100

    # LRU cache support using OrderedDict (maintains insertion order)
    _vector_processor_cache: OrderedDict = OrderedDict()
    # Thread locks for safe concurrent cache access
    _vector_processor_lock = threading.Lock()

    # Monitoring metrics for cache performance tracking
    _cache_stats = {
        "processor_hits": 0,
        "processor_misses": 0,
        "processor_evictions": 0,
        "processor_expired": 0,
    }

    def __init__(self, dataset: Dataset, attributes: list | None = None):
        if attributes is None:
            # `is_summary` and `original_chunk_id` are stored on summary vectors
            # by `SummaryIndexService` and read back by `RetrievalService` to
            # route summary hits through their original parent chunks. They
            # must be listed here so vector backends that use this list as an
            # explicit return-properties projection (notably Weaviate) actually
            # return those fields; without them, summary hits silently
            # collapse into `is_summary = False` branches and the summary
            # retrieval path is a no-op. See #34884.
            attributes = [
                "doc_id",
                "dataset_id",
                "document_id",
                "doc_hash",
                "doc_type",
                "is_summary",
                "original_chunk_id",
            ]
        self._dataset = dataset
        self.init_latencies = {}

        # Use a lazy proxy so cleanup paths (delete_by_ids / delete / text_exists)
        # never transitively trigger billing API calls during ``Vector(dataset)``
        # construction. The real embedding model is materialized only when an
        # ``embed_*`` method is actually invoked (i.e. create / search paths).
        self._embeddings: Embeddings = _LazyEmbeddings(dataset, self.init_latencies)
        self._attributes = attributes

        self._vector_processor = self._init_vector()

    # ==================== Cache Utility Methods ====================
    @classmethod
    def _generate_embedding_cache_key(cls, tenant_id: str, provider: str, model: str) -> str:
        """Generate cache key for embedding model based on tenant, provider, and model"""
        key_str = f"{tenant_id}:{provider}:{model}"
        return hashlib.md5(key_str.encode()).hexdigest()

    @classmethod
    def _generate_processor_cache_key(cls, dataset_id: str, vector_type: str) -> str:
        """Generate cache key for vector processor based on dataset and vector type"""
        key_str = f"{dataset_id}:{vector_type}"
        return hashlib.md5(key_str.encode()).hexdigest()

    @classmethod
    def get_cache_stats(cls) -> dict:
        """Get current cache statistics including hit rates"""
        stats = cls._cache_stats.copy()

        processor_total = stats["processor_hits"] + stats["processor_misses"]
        stats["processor_hit_rate"] = (
            stats["processor_hits"] / processor_total if processor_total > 0 else 0
        )
        stats["processor_cache_size"] = len(cls._vector_processor_cache)

        return stats

    @classmethod
    def _is_cache_expired(cls, cached_time: float) -> bool:
        """Check if cached item has exceeded TTL"""
        return (time.time() - cached_time) > cls._CACHE_TTL_SECONDS

    @classmethod
    def _evict_lru_processor(cls):
        """Evict least recently used vector processor from cache"""
        if cls._vector_processor_cache:
            cls._vector_processor_cache.popitem(last=False)
            cls._cache_stats["processor_evictions"] += 1

    @classmethod
    def _cleanup_expired_processors(cls):
        """Remove expired vector processors from cache"""
        current_time = time.time()
        expired_keys = [
            key for key, (_, cached_time) in cls._vector_processor_cache.items()
            if (current_time - cached_time) > cls._CACHE_TTL_SECONDS
        ]
        for key in expired_keys:
            del cls._vector_processor_cache[key]
            cls._cache_stats["processor_expired"] += 1

    @classmethod
    def clear_cache(cls):
        """Clear all caches (useful for testing or forced refresh)"""
        with cls._vector_processor_lock:
            cls._vector_processor_cache.clear()
        logger.info("All vector processor caches cleared")

    @classmethod
    def clear_cache_stats(cls):
        """Reset cache statistics to zero"""
        for key in cls._cache_stats:
            cls._cache_stats[key] = 0
        logger.info("Cache statistics reset")

    def _init_vector(self) -> BaseVector:
        """Initialize vector processor with enhanced caching and double-check locking"""
        vector_type = dify_config.VECTOR_STORE

        if self._dataset.index_struct_dict:
            vector_type = self._dataset.index_struct_dict["type"]
        else:
            if dify_config.VECTOR_STORE_WHITELIST_ENABLE:
                stmt = select(Whitelist).where(
                    Whitelist.tenant_id == self._dataset.tenant_id, Whitelist.category == "vector_db"
                )
                whitelist = db.session.scalars(stmt).one_or_none()
                if whitelist:
                    vector_type = VectorType.TIDB_ON_QDRANT

        if not vector_type:
            raise ValueError("Vector store must be specified.")

        # Generate cache key
        cache_key = self._generate_processor_cache_key(self._dataset.id, vector_type)

        # First check: without lock (fast path for cache hits)
        if cache_key in self._vector_processor_cache:
            cached_processor, cached_time = self._vector_processor_cache[cache_key]
            
            # Check TTL expiration
            if not self._is_cache_expired(cached_time):
                # Cache hit - move to end (mark as recently used)
                with self._vector_processor_lock:
                    self._vector_processor_cache.move_to_end(cache_key)
                    self._cache_stats["processor_hits"] += 1
                
                logger.info(
                    f"Vector processor cache HIT for dataset_id={self._dataset.id}, "
                    f"vector_type={vector_type}, age={time.time() - cached_time:.2f}s"
                )
                return cached_processor
            else:
                # Expired - remove from cache
                with self._vector_processor_lock:
                    del self._vector_processor_cache[cache_key]
                    self._cache_stats["processor_expired"] += 1
                logger.info(f"Vector processor cache EXPIRED for dataset_id={self._dataset.id}")

        # Cache miss - initialize new processor
        with self._vector_processor_lock:
            # Double-check: another thread might have initialized it
            if cache_key in self._vector_processor_cache:
                cached_processor, cached_time = self._vector_processor_cache[cache_key]
                if not self._is_cache_expired(cached_time):
                    self._vector_processor_cache.move_to_end(cache_key)
                    self._cache_stats["processor_hits"] += 1
                    return cached_processor

            # Record cache miss
            self._cache_stats["processor_misses"] += 1
            logger.info(f"Vector processor cache MISS for dataset_id={self._dataset.id}, initializing...")

            # Clean up expired entries
            self._cleanup_expired_processors()

            # Initialize new processor
            init_start = time.perf_counter()
            vector_factory_cls = self.get_vector_factory(vector_type)
            processor = vector_factory_cls().init_vector(self._dataset, self._attributes, self._embeddings)
            init_duration = time.perf_counter() - init_start

            logger.info(
                f"Vector processor initialized for dataset_id={self._dataset.id} in {init_duration:.2f}s"
            )

            # Evict LRU if cache is full
            if len(self._vector_processor_cache) >= self._CACHE_MAX_SIZE:
                logger.warning(
                    f"Vector processor cache full ({self._CACHE_MAX_SIZE}), evicting LRU entry"
                )
                self._evict_lru_processor()

            # Store in cache with current timestamp
            self._vector_processor_cache[cache_key] = (processor, time.time())

            return processor

    @staticmethod
    def get_vector_factory(vector_type: str) -> type[AbstractVectorFactory]:
        return get_vector_factory_class(vector_type)

    @staticmethod
    def _filter_empty_text_documents(documents: list[Document]) -> list[Document]:
        filtered_documents = [document for document in documents if document.page_content.strip()]
        skipped_count = len(documents) - len(filtered_documents)
        if skipped_count:
            logger.warning("skip %d empty documents before vector embedding", skipped_count)
        return filtered_documents

    def create(self, texts: list | None = None, **kwargs):
        if texts:
            texts = self._filter_empty_text_documents(texts)
            if not texts:
                return

            start = time.time()
            logger.info("start embedding %s texts %s", len(texts), start)
            batch_size = 1000
            total_batches = len(texts) + batch_size - 1
            for i in range(0, len(texts), batch_size):
                batch = texts[i : i + batch_size]
                batch_start = time.time()
                logger.info("Processing batch %s/%s (%s texts)", i // batch_size + 1, total_batches, len(batch))
                batch_embeddings = self._embeddings.embed_documents([document.page_content for document in batch])
                logger.info(
                    "Embedding batch %s/%s took %s s", i // batch_size + 1, total_batches, time.time() - batch_start
                )
                self._vector_processor.create(texts=batch, embeddings=batch_embeddings, **kwargs)
            logger.info("Embedding %s texts took %s s", len(texts), time.time() - start)

    def create_multimodal(self, file_documents: list | None = None, **kwargs):
        if file_documents:
            start = time.time()
            logger.info("start embedding %s files %s", len(file_documents), start)
            batch_size = 1000
            total_batches = len(file_documents) + batch_size - 1
            for i in range(0, len(file_documents), batch_size):
                batch = file_documents[i : i + batch_size]
                batch_start = time.time()
                logger.info("Processing batch %s/%s (%s files)", i // batch_size + 1, total_batches, len(batch))

                # Batch query all upload files to avoid N+1 queries
                attachment_ids = [doc.metadata["doc_id"] for doc in batch]
                stmt = select(UploadFile).where(UploadFile.id.in_(attachment_ids))
                upload_files = db.session.scalars(stmt).all()
                upload_file_map = {str(f.id): f for f in upload_files}

                file_base64_list = []
                real_batch = []
                for document in batch:
                    attachment_id = document.metadata["doc_id"]
                    doc_type = document.metadata["doc_type"]
                    upload_file = upload_file_map.get(attachment_id)
                    if upload_file:
                        blob = storage.load_once(upload_file.key)
                        file_base64_str = base64.b64encode(blob).decode()
                        file_base64_list.append(
                            {
                                "content": file_base64_str,
                                "content_type": doc_type,
                                "file_id": attachment_id,
                            }
                        )
                        real_batch.append(document)
                batch_embeddings = self._embeddings.embed_multimodal_documents(file_base64_list)
                logger.info(
                    "Embedding batch %s/%s took %s s", i // batch_size + 1, total_batches, time.time() - batch_start
                )
                self._vector_processor.create(texts=real_batch, embeddings=batch_embeddings, **kwargs)
            logger.info("Embedding %s files took %s s", len(file_documents), time.time() - start)

    def add_texts(self, documents: list[Document], **kwargs):
        documents = self._filter_empty_text_documents(documents)
        if not documents:
            return

        if kwargs.get("duplicate_check", False):
            documents = self._filter_duplicate_texts(documents)
            if not documents:
                return

        embeddings = self._embeddings.embed_documents([document.page_content for document in documents])
        self._vector_processor.create(texts=documents, embeddings=embeddings, **kwargs)

    def text_exists(self, id: str) -> bool:
        return self._vector_processor.text_exists(id)

    def delete_by_ids(self, ids: list[str]):
        self._vector_processor.delete_by_ids(ids)

    def delete_by_metadata_field(self, key: str, value: str):
        self._vector_processor.delete_by_metadata_field(key, value)

    def search_by_vector(self, query: str, **kwargs: Any) -> list[Document]:
        query_vector = self._embeddings.embed_query(query)
        return self._search_by_vector_traced(query_vector, **kwargs)

    @trace_span()
    def _search_by_vector_traced(self, query_vector: list[float], **kwargs) -> list[Document]:
        return self._vector_processor.search_by_vector(query_vector, **kwargs)

    def search_by_file(self, file_id: str, **kwargs: Any) -> list[Document]:
        upload_file: UploadFile | None = db.session.get(UploadFile, file_id)

        if not upload_file:
            return []
        blob = storage.load_once(upload_file.key)
        file_base64_str = base64.b64encode(blob).decode()
        multimodal_vector = self._embeddings.embed_multimodal_query(
            {
                "content": file_base64_str,
                "content_type": DocType.IMAGE,
                "file_id": file_id,
            }
        )
        return self._search_by_vector_traced(multimodal_vector, **kwargs)

    def search_by_full_text(self, query: str, **kwargs: Any) -> list[Document]:
        return self._vector_processor.search_by_full_text(query, **kwargs)

    def delete(self):
        self._vector_processor.delete()
        # delete collection redis cache
        if self._vector_processor.collection_name:
            collection_exist_cache_key = f"vector_indexing_{self._vector_processor.collection_name}"
            redis_client.delete(collection_exist_cache_key)

    def _get_embeddings(self) -> Embeddings:
        model_manager = ModelManager.for_tenant(tenant_id=self._dataset.tenant_id)

        embedding_model = model_manager.get_model_instance(
            tenant_id=self._dataset.tenant_id,
            provider=self._dataset.embedding_model_provider,
            model_type=ModelType.TEXT_EMBEDDING,
            model=self._dataset.embedding_model,
        )
        return CacheEmbedding(embedding_model)

    def _filter_duplicate_texts(self, texts: list[Document]) -> list[Document]:
        for text in texts.copy():
            if text.metadata is None:
                continue
            doc_id = text.metadata["doc_id"]
            if doc_id:
                exists_duplicate_node = self.text_exists(doc_id)
                if exists_duplicate_node:
                    texts.remove(text)

        return texts

    def __getattr__(self, name):
        if self._vector_processor is not None:
            method = getattr(self._vector_processor, name)
            if callable(method):
                return method

        raise AttributeError(f"'vector_processor' object has no attribute '{name}'")
