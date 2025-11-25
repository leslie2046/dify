import hashlib
import logging
import threading
import time
from abc import ABC, abstractmethod
from collections import OrderedDict
from typing import Any

from sqlalchemy import select

from configs import dify_config
from core.model_manager import ModelManager
from core.model_runtime.entities.model_entities import ModelType
from core.rag.datasource.vdb.vector_base import BaseVector
from core.rag.datasource.vdb.vector_type import VectorType
from core.rag.embedding.cached_embedding import CacheEmbedding
from core.rag.embedding.embedding_base import Embeddings
from core.rag.models.document import Document
from extensions.ext_database import db
from extensions.ext_redis import redis_client
from models.dataset import Dataset, Whitelist

logger = logging.getLogger(__name__)


class AbstractVectorFactory(ABC):
    @abstractmethod
    def init_vector(self, dataset: Dataset, attributes: list, embeddings: Embeddings) -> BaseVector:
        raise NotImplementedError

    @staticmethod
    def gen_index_struct_dict(vector_type: VectorType, collection_name: str):
        index_struct_dict = {"type": vector_type, "vector_store": {"class_prefix": collection_name}}
        return index_struct_dict


class Vector:
    # ==================== Enhanced Cache Configuration ====================
    # Cache TTL: 30 minutes to prevent using stale configurations
    _CACHE_TTL_SECONDS = 1800
    # Maximum cache size: limit memory usage to ~100 instances
    _CACHE_MAX_SIZE = 100

    # LRU cache support using OrderedDict (maintains insertion order)
    _vector_processor_cache: OrderedDict = OrderedDict()
    _embedding_model_cache: OrderedDict = OrderedDict()

    # Thread locks for safe concurrent cache access
    _vector_processor_lock = threading.Lock()
    _embedding_model_lock = threading.Lock()

    # Monitoring metrics for cache performance tracking
    _cache_stats = {
        "embedding_hits": 0,
        "embedding_misses": 0,
        "embedding_evictions": 0,
        "embedding_expired": 0,
        "processor_hits": 0,
        "processor_misses": 0,
        "processor_evictions": 0,
        "processor_expired": 0,
    }

    def __init__(self, dataset: Dataset, attributes: list | None = None):
        if attributes is None:
            attributes = ["doc_id", "dataset_id", "document_id", "doc_hash"]
        self._dataset = dataset
        self.init_latencies = {}

        start_embed = time.perf_counter()
        self._embeddings = self._get_embeddings()
        self.init_latencies['embedding_model_init'] = time.perf_counter() - start_embed

        self._attributes = attributes

        start_vdb = time.perf_counter()
        self._vector_processor = self._init_vector()
        self.init_latencies['vector_db_init'] = time.perf_counter() - start_vdb

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
        
        # Calculate hit rates
        embedding_total = stats["embedding_hits"] + stats["embedding_misses"]
        processor_total = stats["processor_hits"] + stats["processor_misses"]
        
        stats["embedding_hit_rate"] = (
            stats["embedding_hits"] / embedding_total if embedding_total > 0 else 0
        )
        stats["processor_hit_rate"] = (
            stats["processor_hits"] / processor_total if processor_total > 0 else 0
        )
        
        stats["embedding_cache_size"] = len(cls._embedding_model_cache)
        stats["processor_cache_size"] = len(cls._vector_processor_cache)
        
        return stats

    @classmethod
    def _is_cache_expired(cls, cached_time: float) -> bool:
        """Check if cached item has exceeded TTL"""
        return (time.time() - cached_time) > cls._CACHE_TTL_SECONDS

    @classmethod
    def _evict_lru_embedding(cls):
        """Evict least recently used embedding from cache"""
        if cls._embedding_model_cache:
            # OrderedDict.popitem(last=False) removes oldest (LRU) item
            cls._embedding_model_cache.popitem(last=False)
            cls._cache_stats["embedding_evictions"] += 1

    @classmethod
    def _evict_lru_processor(cls):
        """Evict least recently used vector processor from cache"""
        if cls._vector_processor_cache:
            cls._vector_processor_cache.popitem(last=False)
            cls._cache_stats["processor_evictions"] += 1

    @classmethod
    def _cleanup_expired_embeddings(cls):
        """Remove expired embeddings from cache"""
        current_time = time.time()
        expired_keys = [
            key for key, (_, cached_time) in cls._embedding_model_cache.items()
            if (current_time - cached_time) > cls._CACHE_TTL_SECONDS
        ]
        for key in expired_keys:
            del cls._embedding_model_cache[key]
            cls._cache_stats["embedding_expired"] += 1

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
        with cls._embedding_model_lock:
            cls._embedding_model_cache.clear()
        with cls._vector_processor_lock:
            cls._vector_processor_cache.clear()
        logger.info("All vector and embedding caches cleared")

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
        match vector_type:
            case VectorType.CHROMA:
                from core.rag.datasource.vdb.chroma.chroma_vector import ChromaVectorFactory

                return ChromaVectorFactory
            case VectorType.MILVUS:
                from core.rag.datasource.vdb.milvus.milvus_vector import MilvusVectorFactory

                return MilvusVectorFactory
            case VectorType.ALIBABACLOUD_MYSQL:
                from core.rag.datasource.vdb.alibabacloud_mysql.alibabacloud_mysql_vector import (
                    AlibabaCloudMySQLVectorFactory,
                )

                return AlibabaCloudMySQLVectorFactory
            case VectorType.MYSCALE:
                from core.rag.datasource.vdb.myscale.myscale_vector import MyScaleVectorFactory

                return MyScaleVectorFactory
            case VectorType.PGVECTOR:
                from core.rag.datasource.vdb.pgvector.pgvector import PGVectorFactory

                return PGVectorFactory
            case VectorType.VASTBASE:
                from core.rag.datasource.vdb.pyvastbase.vastbase_vector import VastbaseVectorFactory

                return VastbaseVectorFactory
            case VectorType.PGVECTO_RS:
                from core.rag.datasource.vdb.pgvecto_rs.pgvecto_rs import PGVectoRSFactory

                return PGVectoRSFactory
            case VectorType.QDRANT:
                from core.rag.datasource.vdb.qdrant.qdrant_vector import QdrantVectorFactory

                return QdrantVectorFactory
            case VectorType.RELYT:
                from core.rag.datasource.vdb.relyt.relyt_vector import RelytVectorFactory

                return RelytVectorFactory
            case VectorType.ELASTICSEARCH:
                from core.rag.datasource.vdb.elasticsearch.elasticsearch_vector import ElasticSearchVectorFactory

                return ElasticSearchVectorFactory
            case VectorType.ELASTICSEARCH_JA:
                from core.rag.datasource.vdb.elasticsearch.elasticsearch_ja_vector import (
                    ElasticSearchJaVectorFactory,
                )

                return ElasticSearchJaVectorFactory
            case VectorType.TIDB_VECTOR:
                from core.rag.datasource.vdb.tidb_vector.tidb_vector import TiDBVectorFactory

                return TiDBVectorFactory
            case VectorType.WEAVIATE:
                from core.rag.datasource.vdb.weaviate.weaviate_vector import WeaviateVectorFactory

                return WeaviateVectorFactory
            case VectorType.TENCENT:
                from core.rag.datasource.vdb.tencent.tencent_vector import TencentVectorFactory

                return TencentVectorFactory
            case VectorType.ORACLE:
                from core.rag.datasource.vdb.oracle.oraclevector import OracleVectorFactory

                return OracleVectorFactory
            case VectorType.OPENSEARCH:
                from core.rag.datasource.vdb.opensearch.opensearch_vector import OpenSearchVectorFactory

                return OpenSearchVectorFactory
            case VectorType.ANALYTICDB:
                from core.rag.datasource.vdb.analyticdb.analyticdb_vector import AnalyticdbVectorFactory

                return AnalyticdbVectorFactory
            case VectorType.COUCHBASE:
                from core.rag.datasource.vdb.couchbase.couchbase_vector import CouchbaseVectorFactory

                return CouchbaseVectorFactory
            case VectorType.BAIDU:
                from core.rag.datasource.vdb.baidu.baidu_vector import BaiduVectorFactory

                return BaiduVectorFactory
            case VectorType.VIKINGDB:
                from core.rag.datasource.vdb.vikingdb.vikingdb_vector import VikingDBVectorFactory

                return VikingDBVectorFactory
            case VectorType.UPSTASH:
                from core.rag.datasource.vdb.upstash.upstash_vector import UpstashVectorFactory

                return UpstashVectorFactory
            case VectorType.TIDB_ON_QDRANT:
                from core.rag.datasource.vdb.tidb_on_qdrant.tidb_on_qdrant_vector import TidbOnQdrantVectorFactory

                return TidbOnQdrantVectorFactory
            case VectorType.LINDORM:
                from core.rag.datasource.vdb.lindorm.lindorm_vector import LindormVectorStoreFactory

                return LindormVectorStoreFactory
            case VectorType.OCEANBASE:
                from core.rag.datasource.vdb.oceanbase.oceanbase_vector import OceanBaseVectorFactory

                return OceanBaseVectorFactory
            case VectorType.OPENGAUSS:
                from core.rag.datasource.vdb.opengauss.opengauss import OpenGaussFactory

                return OpenGaussFactory
            case VectorType.TABLESTORE:
                from core.rag.datasource.vdb.tablestore.tablestore_vector import TableStoreVectorFactory

                return TableStoreVectorFactory
            case VectorType.HUAWEI_CLOUD:
                from core.rag.datasource.vdb.huawei.huawei_cloud_vector import HuaweiCloudVectorFactory

                return HuaweiCloudVectorFactory
            case VectorType.MATRIXONE:
                from core.rag.datasource.vdb.matrixone.matrixone_vector import MatrixoneVectorFactory

                return MatrixoneVectorFactory
            case VectorType.CLICKZETTA:
                from core.rag.datasource.vdb.clickzetta.clickzetta_vector import ClickzettaVectorFactory

                return ClickzettaVectorFactory
            case _:
                raise ValueError(f"Vector store {vector_type} is not supported.")

    def create(self, texts: list | None = None, **kwargs):
        if texts:
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

    def add_texts(self, documents: list[Document], **kwargs):
        if kwargs.get("duplicate_check", False):
            documents = self._filter_duplicate_texts(documents)

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
        return self._vector_processor.search_by_vector(query_vector, **kwargs)

    def search_by_full_text(self, query: str, **kwargs: Any) -> list[Document]:
        return self._vector_processor.search_by_full_text(query, **kwargs)

    def delete(self):
        self._vector_processor.delete()
        # delete collection redis cache
        if self._vector_processor.collection_name:
            collection_exist_cache_key = f"vector_indexing_{self._vector_processor.collection_name}"
            redis_client.delete(collection_exist_cache_key)

    def _get_embeddings(self) -> Embeddings:
        """Get embedding model with enhanced caching and double-check locking"""
        # Generate cache key
        cache_key = self._generate_embedding_cache_key(
            self._dataset.tenant_id,
            self._dataset.embedding_model_provider,
            self._dataset.embedding_model
        )

        # First check: without lock (fast path for cache hits)
        if cache_key in self._embedding_model_cache:
            cached_embeddings, cached_time = self._embedding_model_cache[cache_key]
            
            # Check TTL expiration
            if not self._is_cache_expired(cached_time):
                # Cache hit - move to end (mark as recently used)
                with self._embedding_model_lock:
                    self._embedding_model_cache.move_to_end(cache_key)
                    self._cache_stats["embedding_hits"] += 1
                
                logger.info(
                    f"Embedding model cache HIT for tenant_id={self._dataset.tenant_id}, "
                    f"provider={self._dataset.embedding_model_provider}, "
                    f"model={self._dataset.embedding_model}, age={time.time() - cached_time:.2f}s"
                )
                return cached_embeddings
            else:
                # Expired - remove from cache
                with self._embedding_model_lock:
                    del self._embedding_model_cache[cache_key]
                    self._cache_stats["embedding_expired"] += 1
                logger.info(
                    f"Embedding model cache EXPIRED for tenant_id={self._dataset.tenant_id}"
                )

        # Cache miss - load new model
        with self._embedding_model_lock:
            # Double-check: another thread might have loaded it
            if cache_key in self._embedding_model_cache:
                cached_embeddings, cached_time = self._embedding_model_cache[cache_key]
                if not self._is_cache_expired(cached_time):
                    self._embedding_model_cache.move_to_end(cache_key)
                    self._cache_stats["embedding_hits"] += 1
                    return cached_embeddings

            # Record cache miss
            self._cache_stats["embedding_misses"] += 1
            logger.info(
                f"Embedding model cache MISS for tenant_id={self._dataset.tenant_id}, "
                f"provider={self._dataset.embedding_model_provider}, "
                f"model={self._dataset.embedding_model}, loading model..."
            )

            # Clean up expired entries
            self._cleanup_expired_embeddings()

            # Load new model
            load_start = time.perf_counter()
            model_manager = ModelManager()
            embedding_model = model_manager.get_model_instance(
                tenant_id=self._dataset.tenant_id,
                provider=self._dataset.embedding_model_provider,
                model_type=ModelType.TEXT_EMBEDDING,
                model=self._dataset.embedding_model,
            )
            cached_embedding = CacheEmbedding(embedding_model)
            load_duration = time.perf_counter() - load_start

            logger.info(
                f"Embedding model loaded for tenant_id={self._dataset.tenant_id} in {load_duration:.2f}s"
            )

            # Evict LRU if cache is full
            if len(self._embedding_model_cache) >= self._CACHE_MAX_SIZE:
                logger.warning(
                    f"Embedding model cache full ({self._CACHE_MAX_SIZE}), evicting LRU entry"
                )
                self._evict_lru_embedding()

            # Store in cache with current timestamp
            self._embedding_model_cache[cache_key] = (cached_embedding, time.time())

            return cached_embedding

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
