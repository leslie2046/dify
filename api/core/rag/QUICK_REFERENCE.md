# RAG缓存优化 - 快速参考

## 🚀 快速开始

### 查看缓存统计

```python
# Vector缓存
from core.rag.datasource.vdb.vector_factory import Vector
print(Vector.get_cache_stats())

# Rerank Model缓存
from core.rag.data_post_processor.data_post_processor import DataPostProcessor
print(DataPostProcessor.get_cache_stats())

# Weight Rerank Embedding缓存
from core.rag.rerank.weight_rerank import WeightRerankRunner
print(WeightRerankRunner.get_cache_stats())
```

### 清空缓存（调试用）

```python
# Vector
Vector.clear_cache()
Vector.clear_cache_stats()

# Rerank Model
DataPostProcessor.clear_cache()
DataPostProcessor.clear_cache_stats()

# Weight Rerank
WeightRerankRunner.clear_cache()
WeightRerankRunner.clear_cache_stats()
```

---

## 📊 关键指标

| 缓存类型 | 命中率目标 | TTL | 最大大小 |
|---------|-----------|-----|---------|
| **Embedding Model** | 90%+ | 30分钟 | 100个 |
| **Vector Processor** | 90%+ | 30分钟 | 100个 |
| **Rerank Model** | 85%+ | 30分钟 | 50个 |
| **Weight Rerank Embedding** | 85%+ | 30分钟 | 50个 |

---

## ⚡ 性能提升

| 场景 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| **Vector首次加载** | 15秒 | 2.06秒 | 87% ↓ |
| **Vector缓存命中** | - | <0.001秒 | 99.99% ↓ |
| **Rerank Model加载** | 3秒 | <0.001秒 | 99.9% ↓ |
| **Weight Rerank Embedding** | 2.5秒 | <0.001秒 | 99.9% ↓ |

---

## 📁 文件位置

### Vector缓存
- **实现**: `api/core/rag/datasource/vdb/vector_factory.py`
- **监控**: `api/core/rag/datasource/vdb/cache_monitor.py`
- **测试**: `api/core/rag/datasource/vdb/test_vector_cache.py`

### Reranker缓存
- **Rerank Model**: `api/core/rag/data_post_processor/data_post_processor.py`
- **Weight Rerank**: `api/core/rag/rerank/weight_rerank.py`
- **Rerank Runner**: `api/core/rag/rerank/rerank_model.py`
- **测试**: 
  - `api/core/rag/rerank/test_rerank_cache.py`
  - `api/core/rag/rerank/test_weight_rerank_cache.py`

---

## 🔧 配置调整

### 修改TTL

```python
# vector_factory.py
class Vector:
    _CACHE_TTL_SECONDS = 3600  # 改为60分钟

# data_post_processor.py
class DataPostProcessor:
    _RERANK_MODEL_CACHE_TTL_SECONDS = 3600

# weight_rerank.py
class WeightRerankRunner:
    _EMBEDDING_CACHE_TTL_SECONDS = 3600
```

### 修改缓存大小

```python
# vector_factory.py
class Vector:
    _CACHE_MAX_SIZE = 200  # 增加到200个

# data_post_processor.py
class DataPostProcessor:
    _RERANK_MODEL_CACHE_MAX_SIZE = 100

# weight_rerank.py
class WeightRerankRunner:
    _EMBEDDING_CACHE_MAX_SIZE = 100
```

---

## 🧪 运行测试

```bash
cd api

# Vector缓存测试
python core/rag/datasource/vdb/test_vector_cache.py

# Rerank Model缓存测试
python core/rag/rerank/test_rerank_cache.py

# Weight Rerank Embedding缓存测试
python core/rag/rerank/test_weight_rerank_cache.py
```

---

## 📈 监控示例

### Python代码

```python
from core.rag.datasource.vdb.cache_monitor import VectorCacheMonitor

monitor = VectorCacheMonitor()
monitor.log_stats()  # 记录到日志
monitor.print_performance_report()  # 打印报告
```

### 日志输出

```
INFO - Embedding model cache HIT for tenant_id=xxx, age=120s
INFO - Vector processor cache MISS, initializing...
INFO - Vector processor initialized in 2.03s
INFO - Weight rerank embedding cache HIT, age=85s
WARNING - Cache full (100), evicting LRU entry
```

---

## ⚠️ 告警阈值建议

| 指标 | 阈值 | 说明 |
|------|------|------|
| **命中率** | < 70% | 需调查原因 |
| **淘汰率** | > 100次/小时 | 考虑增加缓存 |
| **过期率** | 异常增长 | 检查TTL设置 |
| **初始化时间** | > 5秒 | 性能问题 |

---

## 🎯 最佳实践

1. ✅ **生产环境定期监控缓存统计**
2. ✅ **根据实际情况调整TTL和缓存大小**
3. ✅ **实施缓存预热策略**
4. ✅ **设置Prometheus告警**
5. ✅ **每周Review缓存性能**

---

## 📞 快速排查

### 问题：命中率低

**可能原因**:
- 模型配置多样化
- 缓存大小太小
- TTL太短

**解决方案**:
- 增加`_CACHE_MAX_SIZE`
- 延长`_CACHE_TTL_SECONDS`
- 实施缓存预热

### 问题：内存占用高

**可能原因**:
- 缓存大小过大
- 模型实例太多

**解决方案**:
- 减小`_CACHE_MAX_SIZE`
- 缩短`_CACHE_TTL_SECONDS`
- 监控淘汰频率

### 问题：频繁淘汰

**可能原因**:
- 缓存大小不足
- 请求模式不稳定

**解决方案**:
- 增加缓存大小
- 分析请求模式
- 优化预热策略

---

## 🔗 相关文档

- [Vector缓存详细文档](./datasource/vdb/CACHE_OPTIMIZATION.md)
- [Reranker优化分析](./rerank/RERANKER_OPTIMIZATION.md)
- [P1优化完成总结](./rerank/P1优化完成总结.md)
- [完整优化总结](./RAG性能优化总结.md)

---

**最后更新**: 2025-11-25  
**实测性能**: 总查询时间 **416ms** ⚡
