from core.model_manager import ModelInstance
from core.rag.models.document import Document
from core.rag.rerank.rerank_base import BaseRerankRunner


class RerankModelRunner(BaseRerankRunner):
    def __init__(self, rerank_model_instance: ModelInstance):
        self.rerank_model_instance = rerank_model_instance

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
        
        # Extract document content for reranking
        docs = [doc.page_content for doc in documents]

        rerank_result = self.rerank_model_instance.invoke_rerank(
            query=query, docs=docs, score_threshold=score_threshold, top_n=top_n, user=user
        )

        rerank_documents = []

        for result in rerank_result.docs:
            if score_threshold is None or result.score >= score_threshold:
                # format document
                rerank_document = Document(
                    page_content=result.text,
                    metadata=documents[result.index].metadata,
                    provider=documents[result.index].provider,
                )
                if rerank_document.metadata is not None:
                    rerank_document.metadata["score"] = result.score
                    rerank_documents.append(rerank_document)

        rerank_documents.sort(key=lambda x: x.metadata.get("score", 0.0), reverse=True)
        return rerank_documents[:top_n] if top_n else rerank_documents
