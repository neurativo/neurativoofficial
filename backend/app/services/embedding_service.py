from typing import List
import numpy as np
import app.services.openai_service as openai_service

def get_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Generates embeddings for a list of texts using text-embedding-3-small.
    """
    if not texts:
        return []

    if not openai_service.client:
        raise Exception("OpenAI client not initialized")

    try:
        # OpenAI handles batching, but be mindful of total tokens if chunks are very large
        # Here chunks are ~1500 words, which is within limits for a reasonable batch size
        response = openai_service.client.embeddings.create(
            input=texts,
            model="text-embedding-3-small"
        )
        return [data.embedding for data in response.data]
    except Exception as e:
        print(f"Error generating embeddings: {e}")
        raise e

def cosine_similarity(a: List[float], b: List[float]) -> float:
    """
    Computes cosine similarity between two vectors.
    """
    vec_a = np.array(a)
    vec_b = np.array(b)
    
    if np.linalg.norm(vec_a) == 0 or np.linalg.norm(vec_b) == 0:
        return 0.0
        
    return np.dot(vec_a, vec_b) / (np.linalg.norm(vec_a) * np.linalg.norm(vec_b))
