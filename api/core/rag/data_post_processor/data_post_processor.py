import hashlib
import logging
import threading
import time
from collections import OrderedDict

from core.model_manager import ModelInstance, ModelManager
from core.model_runtime.entities.model_entities import ModelType
from core.model_runtime.errors.invoke import InvokeAuthorizationError
from core.rag.data_post_processor.reorder import ReorderRunner
from core.rag.models.document import Document
from core.rag.rerank.entity.weight import KeywordSetting, VectorSetting, Weights
from core.rag.rerank.rerank_base import BaseRerankRunner
from core.rag.rerank.rerank_factory import RerankRunnerFactory
from core.rag.rerank.rerank_type import RerankMode

logger = logging.getLogger(__name__)


class DataPostProcessor:
    """Interface for data post-processing document."""
    
    # ==================== Rerank Model Cache Configuration ====================
    # Cache TTL: 30 minutes to prevent using stale model configurations
    _RERANK_MODEL_CACHE_TTL_SECONDS = 1800
    # Maximum cache size: limit memory usage (rerank models can be large)
    _RERANK_MODEL_CACHE_MAX_SIZE = 50
    
    # LRU cache for rerank model instances
    _rerank_model_cache: OrderedDict = OrderedDict()
    _rerank_model_lock = threading.Lock()
    
    # Monitoring metrics for cache performance
    _cache_stats = {
        "rerank_model_hits": 0,
        "rerank_model_misses": 0,
        "rerank_model_evictions": 0,
        "rerank_model_expired": 0,
    }

    def __init__(
        self,
        tenant_id: str,
        reranking_mode: str,
        reranking_model: dict | None = None,
        weights: dict | None = None,
        reorder_enabled: bool = False,
    ):
        self.rerank_runner = self._get_rerank_runner(reranking_mode, tenant_id, reranking_model, weights)
        self.reorder_runner = self._get_reorder_runner(reorder_enabled)

    def invoke(
        self,
        query: str,
        documents: list[Document],
        score_threshold: float | None = None,
        top_n: int | None = None,
        user: str | None = None,
    ) -> list[Document]:
        if self.rerank_runner:
            documents = self.rerank_runner.run(query, documents, score_threshold, top_n, user)

        if self.reorder_runner:
            documents = self.reorder_runner.run(documents)

        return documents

    # ==================== Cache Utility Methods ====================
    @classmethod
    def _generate_rerank_model_cache_key(cls, tenant_id: str, provider: str, model: str) -> str:
        """Generate cache key for rerank model"""
        key_str = f"{tenant_id}:{provider}:{model}"
        return hashlib.md5(key_str.encode()).hexdigest()
    
    @classmethod
    def get_cache_stats(cls) -> dict:
        """Get current cache statistics including hit rates"""
        stats = cls._cache_stats.copy()
        
        total = stats["rerank_model_hits"] + stats["rerank_model_misses"]
        stats["rerank_model_hit_rate"] = (
            stats["rerank_model_hits"] / total if total > 0 else 0
        )
        stats["rerank_model_cache_size"] = len(cls._rerank_model_cache)
        
        return stats
    
    @classmethod
    def _is_cache_expired(cls, cached_time: float) -> bool:
        """Check if cached item has exceeded TTL"""
        return (time.time() - cached_time) > cls._RERANK_MODEL_CACHE_TTL_SECONDS
    
    @classmethod
    def _evict_lru_rerank_model(cls):
        """Evict least recently used rerank model from cache"""
        if cls._rerank_model_cache:
            cls._rerank_model_cache.popitem(last=False)
            cls._cache_stats["rerank_model_evictions"] += 1
    
    @classmethod
    def _cleanup_expired_rerank_models(cls):
        """Remove expired rerank models from cache"""
        current_time = time.time()
        expired_keys = [
            key for key, (_, cached_time) in cls._rerank_model_cache.items()
            if (current_time - cached_time) > cls._RERANK_MODEL_CACHE_TTL_SECONDS
        ]
        for key in expired_keys:
            del cls._rerank_model_cache[key]
            cls._cache_stats["rerank_model_expired"] += 1
    
    @classmethod
    def clear_cache(cls):
        """Clear all rerank model caches"""
        with cls._rerank_model_lock:
            cls._rerank_model_cache.clear()
        logger.info("Rerank model cache cleared")
    
    @classmethod
    def clear_cache_stats(cls):
        """Reset cache statistics to zero"""
        for key in cls._cache_stats:
            cls._cache_stats[key] = 0
        logger.info("Rerank model cache statistics reset")

    def _get_rerank_runner(
        self,
        reranking_mode: str,
        tenant_id: str,
        reranking_model: dict | None = None,
        weights: dict | None = None,
    ) -> BaseRerankRunner | None:
        if reranking_mode == RerankMode.WEIGHTED_SCORE and weights:
            runner = RerankRunnerFactory.create_rerank_runner(
                runner_type=reranking_mode,
                tenant_id=tenant_id,
                weights=Weights(
                    vector_setting=VectorSetting(
                        vector_weight=weights["vector_setting"]["vector_weight"],
                        embedding_provider_name=weights["vector_setting"]["embedding_provider_name"],
                        embedding_model_name=weights["vector_setting"]["embedding_model_name"],
                    ),
                    keyword_setting=KeywordSetting(
                        keyword_weight=weights["keyword_setting"]["keyword_weight"],
                    ),
                ),
            )
            return runner
        elif reranking_mode == RerankMode.RERANKING_MODEL:
            rerank_model_instance = self._get_rerank_model_instance(tenant_id, reranking_model)
            if rerank_model_instance is None:
                return None
            runner = RerankRunnerFactory.create_rerank_runner(
                runner_type=reranking_mode, rerank_model_instance=rerank_model_instance
            )
            return runner
        return None

    def _get_reorder_runner(self, reorder_enabled) -> ReorderRunner | None:
        if reorder_enabled:
            return ReorderRunner()
        return None

    def _get_rerank_model_instance(self, tenant_id: str, reranking_model: dict | None) -> ModelInstance | None:
        """Get rerank model instance with enhanced caching and double-check locking"""
        if not reranking_model:
            return None
        
        reranking_provider_name = reranking_model.get("reranking_provider_name")
        reranking_model_name = reranking_model.get("reranking_model_name")
        
        if not reranking_provider_name or not reranking_model_name:
            return None
        
        # Generate cache key
        cache_key = self._generate_rerank_model_cache_key(
            tenant_id, reranking_provider_name, reranking_model_name
        )
        
        # First check: without lock (fast path for cache hits)
        if cache_key in self._rerank_model_cache:
            cached_model, cached_time = self._rerank_model_cache[cache_key]
            
            # Check TTL expiration
            if not self._is_cache_expired(cached_time):
                # Cache hit - move to end (mark as recently used)
                with self._rerank_model_lock:
                    self._rerank_model_cache.move_to_end(cache_key)
                    self._cache_stats["rerank_model_hits"] += 1
                
                logger.info(
                    f"Rerank model cache HIT for tenant_id={tenant_id}, "
                    f"provider={reranking_provider_name}, model={reranking_model_name}, "
                    f"age={time.time() - cached_time:.2f}s"
                )
                return cached_model
            else:
                # Expired - remove from cache
                with self._rerank_model_lock:
                    del self._rerank_model_cache[cache_key]
                    self._cache_stats["rerank_model_expired"] += 1
                logger.info(
                    f"Rerank model cache EXPIRED for tenant_id={tenant_id}, "
                    f"provider={reranking_provider_name}, model={reranking_model_name}"
                )
        
        # Cache miss - load new model
        with self._rerank_model_lock:
            # Double-check: another thread might have loaded it
            if cache_key in self._rerank_model_cache:
                cached_model, cached_time = self._rerank_model_cache[cache_key]
                if not self._is_cache_expired(cached_time):
                    self._rerank_model_cache.move_to_end(cache_key)
                    self._cache_stats["rerank_model_hits"] += 1
                    return cached_model
            
            # Record cache miss
            self._cache_stats["rerank_model_misses"] += 1
            logger.info(
                f"Rerank model cache MISS for tenant_id={tenant_id}, "
                f"provider={reranking_provider_name}, model={reranking_model_name}, loading..."
            )
            
            # Clean up expired entries
            self._cleanup_expired_rerank_models()
            
            # Load new model
            try:
                load_start = time.perf_counter()
                model_manager = ModelManager()
                rerank_model_instance = model_manager.get_model_instance(
                    tenant_id=tenant_id,
                    provider=reranking_provider_name,
                    model_type=ModelType.RERANK,
                    model=reranking_model_name,
                )
                load_duration = time.perf_counter() - load_start
                
                logger.info(
                    f"Rerank model loaded for tenant_id={tenant_id} in {load_duration:.2f}s"
                )
                
                # Evict LRU if cache is full
                if len(self._rerank_model_cache) >= self._RERANK_MODEL_CACHE_MAX_SIZE:
                    logger.warning(
                        f"Rerank model cache full ({self._RERANK_MODEL_CACHE_MAX_SIZE}), evicting LRU entry"
                    )
                    self._evict_lru_rerank_model()
                
                # Store in cache with current timestamp
                self._rerank_model_cache[cache_key] = (rerank_model_instance, time.time())
                
                return rerank_model_instance
            except InvokeAuthorizationError:
                logger.warning(
                    f"Authorization error loading rerank model: tenant_id={tenant_id}, "
                    f"provider={reranking_provider_name}, model={reranking_model_name}"
                )
                return None
