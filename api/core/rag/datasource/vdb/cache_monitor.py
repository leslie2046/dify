"""
Vector Cache Monitoring Utility

This module provides utilities to monitor and report on the enhanced vector caching system.
It can be used to:
- Log cache statistics periodically
- Expose metrics for monitoring systems
- Generate cache performance reports
"""

import logging
import time
from typing import Dict

from core.rag.datasource.vdb.vector_factory import Vector

logger = logging.getLogger(__name__)


class VectorCacheMonitor:
    """Monitor and report vector cache performance"""
    
    def __init__(self):
        self.start_time = time.time()
        self.initial_stats = Vector.get_cache_stats()
    
    def get_current_stats(self) -> Dict:
        """Get current cache statistics with additional metadata"""
        stats = Vector.get_cache_stats()
        
        # Add uptime
        stats["uptime_seconds"] = time.time() - self.start_time
        
        # Calculate total requests
        stats["total_embedding_requests"] = stats["embedding_hits"] + stats["embedding_misses"]
        stats["total_processor_requests"] = stats["processor_hits"] + stats["processor_misses"]
        
        # Calculate cache efficiency
        stats["embedding_efficiency"] = self._calculate_efficiency(
            stats["embedding_hits"],
            stats["embedding_misses"]
        )
        stats["processor_efficiency"] = self._calculate_efficiency(
            stats["processor_hits"],
            stats["processor_misses"]
        )
        
        return stats
    
    def _calculate_efficiency(self, hits: int, misses: int) -> str:
        """Calculate cache efficiency rating"""
        total = hits + misses
        if total == 0:
            return "No data"
        
        hit_rate = hits / total
        if hit_rate >= 0.9:
            return "Excellent (90%+)"
        elif hit_rate >= 0.75:
            return "Good (75-90%)"
        elif hit_rate >= 0.5:
            return "Fair (50-75%)"
        else:
            return "Poor (<50%)"
    
    def log_stats(self, level=logging.INFO):
        """Log current cache statistics"""
        stats = self.get_current_stats()
        
        logger.log(level, "="*70)
        logger.log(level, "VECTOR CACHE STATISTICS")
        logger.log(level, "="*70)
        
        # Embedding cache stats
        logger.log(level, "\nEmbedding Model Cache:")
        logger.log(level, f"  Size: {stats['embedding_cache_size']}/{Vector._CACHE_MAX_SIZE}")
        logger.log(level, f"  Hits: {stats['embedding_hits']}")
        logger.log(level, f"  Misses: {stats['embedding_misses']}")
        logger.log(level, f"  Hit Rate: {stats['embedding_hit_rate']*100:.2f}%")
        logger.log(level, f"  Efficiency: {stats['embedding_efficiency']}")
        logger.log(level, f"  Evictions: {stats['embedding_evictions']}")
        logger.log(level, f"  Expirations: {stats['embedding_expired']}")
        
        # Vector processor cache stats
        logger.log(level, "\nVector Processor Cache:")
        logger.log(level, f"  Size: {stats['processor_cache_size']}/{Vector._CACHE_MAX_SIZE}")
        logger.log(level, f"  Hits: {stats['processor_hits']}")
        logger.log(level, f"  Misses: {stats['processor_misses']}")
        logger.log(level, f"  Hit Rate: {stats['processor_hit_rate']*100:.2f}%")
        logger.log(level, f"  Efficiency: {stats['processor_efficiency']}")
        logger.log(level, f"  Evictions: {stats['processor_evictions']}")
        logger.log(level, f"  Expirations: {stats['processor_expired']}")
        
        # System info
        logger.log(level, "\nSystem:")
        logger.log(level, f"  Uptime: {stats['uptime_seconds']:.0f}s ({stats['uptime_seconds']/3600:.1f}h)")
        logger.log(level, f"  TTL: {Vector._CACHE_TTL_SECONDS}s (30 min)")
        logger.log(level, f"  Max Cache Size: {Vector._CACHE_MAX_SIZE} instances")
        logger.log(level, "="*70)
    
    def get_prometheus_metrics(self) -> str:
        """Export metrics in Prometheus format"""
        stats = self.get_current_stats()
        
        metrics = []
        
        # Embedding metrics
        metrics.append(f'# HELP vector_embedding_cache_hits Total number of embedding cache hits')
        metrics.append(f'# TYPE vector_embedding_cache_hits counter')
        metrics.append(f'vector_embedding_cache_hits {stats["embedding_hits"]}')
        
        metrics.append(f'# HELP vector_embedding_cache_misses Total number of embedding cache misses')
        metrics.append(f'# TYPE vector_embedding_cache_misses counter')
        metrics.append(f'vector_embedding_cache_misses {stats["embedding_misses"]}')
        
        metrics.append(f'# HELP vector_embedding_cache_size Current embedding cache size')
        metrics.append(f'# TYPE vector_embedding_cache_size gauge')
        metrics.append(f'vector_embedding_cache_size {stats["embedding_cache_size"]}')
        
        metrics.append(f'# HELP vector_embedding_cache_hit_rate Embedding cache hit rate')
        metrics.append(f'# TYPE vector_embedding_cache_hit_rate gauge')
        metrics.append(f'vector_embedding_cache_hit_rate {stats["embedding_hit_rate"]:.4f}')
        
        metrics.append(f'# HELP vector_embedding_cache_evictions Total embedding cache evictions')
        metrics.append(f'# TYPE vector_embedding_cache_evictions counter')
        metrics.append(f'vector_embedding_cache_evictions {stats["embedding_evictions"]}')
        
        metrics.append(f'# HELP vector_embedding_cache_expirations Total embedding cache expirations')
        metrics.append(f'# TYPE vector_embedding_cache_expirations counter')
        metrics.append(f'vector_embedding_cache_expirations {stats["embedding_expired"]}')
        
        # Processor metrics
        metrics.append(f'# HELP vector_processor_cache_hits Total number of processor cache hits')
        metrics.append(f'# TYPE vector_processor_cache_hits counter')
        metrics.append(f'vector_processor_cache_hits {stats["processor_hits"]}')
        
        metrics.append(f'# HELP vector_processor_cache_misses Total number of processor cache misses')
        metrics.append(f'# TYPE vector_processor_cache_misses counter')
        metrics.append(f'vector_processor_cache_misses {stats["processor_misses"]}')
        
        metrics.append(f'# HELP vector_processor_cache_size Current processor cache size')
        metrics.append(f'# TYPE vector_processor_cache_size gauge')
        metrics.append(f'vector_processor_cache_size {stats["processor_cache_size"]}')
        
        metrics.append(f'# HELP vector_processor_cache_hit_rate Processor cache hit rate')
        metrics.append(f'# TYPE vector_processor_cache_hit_rate gauge')
        metrics.append(f'vector_processor_cache_hit_rate {stats["processor_hit_rate"]:.4f}')
        
        metrics.append(f'# HELP vector_processor_cache_evictions Total processor cache evictions')
        metrics.append(f'# TYPE vector_processor_cache_evictions counter')
        metrics.append(f'vector_processor_cache_evictions {stats["processor_evictions"]}')
        
        metrics.append(f'# HELP vector_processor_cache_expirations Total processor cache expirations')
        metrics.append(f'# TYPE vector_processor_cache_expirations counter')
        metrics.append(f'vector_processor_cache_expirations {stats["processor_expired"]}')
        
        return '\n'.join(metrics)
    
    def get_performance_report(self) -> Dict:
        """Generate a performance report with time savings estimation"""
        stats = self.get_current_stats()
        
        # Performance calculations (based on benchmarks)
        cold_start_time = 15.0  # 15 seconds without cache
        optimized_load_time = 2.06  # 2.06 seconds optimized first load
        cache_hit_time = 0.0001  # 0.1ms for cache hit
        
        embedding_requests = stats["total_embedding_requests"]
        processor_requests = stats["total_processor_requests"]
        
        # Calculate time saved for embeddings
        time_without_cache_embedding = embedding_requests * cold_start_time
        time_with_cache_embedding = (
            stats["embedding_misses"] * optimized_load_time +
            stats["embedding_hits"] * cache_hit_time
        )
        embedding_time_saved = time_without_cache_embedding - time_with_cache_embedding
        
        # Calculate time saved for processors
        time_without_cache_processor = processor_requests * cold_start_time
        time_with_cache_processor = (
            stats["processor_misses"] * optimized_load_time +
            stats["processor_hits"] * cache_hit_time
        )
        processor_time_saved = time_without_cache_processor - time_with_cache_processor
        
        total_time_saved = embedding_time_saved + processor_time_saved
        
        return {
            "embedding_time_saved_seconds": embedding_time_saved,
            "embedding_time_saved_hours": embedding_time_saved / 3600,
            "processor_time_saved_seconds": processor_time_saved,
            "processor_time_saved_hours": processor_time_saved / 3600,
            "total_time_saved_seconds": total_time_saved,
            "total_time_saved_hours": total_time_saved / 3600,
            "total_requests": embedding_requests + processor_requests,
            "average_speedup": (
                (embedding_requests * cold_start_time + processor_requests * cold_start_time) /
                max(time_with_cache_embedding + time_with_cache_processor, 0.001)
            )
        }
    
    def print_performance_report(self):
        """Print a formatted performance report"""
        report = self.get_performance_report()
        
        print("\n" + "="*70)
        print("CACHE PERFORMANCE REPORT")
        print("="*70)
        print(f"\nTotal Requests: {report['total_requests']}")
        print(f"\nTime Saved:")
        print(f"  Embedding Model Loading: {report['embedding_time_saved_hours']:.2f} hours")
        print(f"  Vector Processor Init: {report['processor_time_saved_hours']:.2f} hours")
        print(f"  Total: {report['total_time_saved_hours']:.2f} hours")
        print(f"\nAverage Speedup: {report['average_speedup']:.1f}x faster")
        print("="*70 + "\n")


# Example usage
if __name__ == "__main__":
    # Initialize monitor
    monitor = VectorCacheMonitor()
    
    # Log current statistics
    monitor.log_stats()
    
    # Print performance report
    monitor.print_performance_report()
    
    # Export Prometheus metrics (example)
    # print(monitor.get_prometheus_metrics())
