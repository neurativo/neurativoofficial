from app.services.supabase_service import get_lecture_transcript
from app.services.embedding_service import get_embeddings, cosine_similarity
import app.services.openai_service as openai_service
from fastapi import HTTPException

def answer_lecture_question(lecture_id: str, question: str) -> str:
    # 1. Fetch transcript
    transcript = get_lecture_transcript(lecture_id)
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript empty or not found")

    # 2. Split transcript (Simple word-based chunking, same as summarization)
    words = transcript.split()
    chunk_size = 1500
    chunks = [' '.join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size)]
    
    if not chunks:
        return "Lecture content is empty, cannot answer questions."

    try:
        # 3. Generate embeddings
        # Embed chunks
        chunk_embeddings = get_embeddings(chunks)
        # Embed question
        question_embedding = get_embeddings([question])[0]
        
        # 4. Compute similarity & select top 3
        similarities = []
        for i, emb in enumerate(chunk_embeddings):
            score = cosine_similarity(emb, question_embedding)
            similarities.append((score, i))
            
        # Sort by score descending
        similarities.sort(key=lambda x: x[0], reverse=True)
        
        # Get top 3 indices
        top_indices = [idx for _, idx in similarities[:3]]
        relevant_chunks = [chunks[i] for i in top_indices]
        
        # 5. Form context and ask GPT
        if not openai_service.client:
            raise HTTPException(status_code=500, detail="OpenAI client not initialized")

        context = "\n\n---\n\n".join(relevant_chunks)

        system_prompt = (
            "You are an expert AI Lecture Assistant. "
            "Answer the user's question based ONLY on the provided lecture context. "
            "If the answer is not in the context, state that clearly. "
            "Be clear, accurate, and concise."
        )
        
        response = openai_service.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"}
            ],
            temperature=0.3,
            max_tokens=600
        )
        
        return response.choices[0].message.content

    except Exception as e:
        print(f"Error in QA process: {e}")
        raise HTTPException(status_code=500, detail=f"QA failed: {str(e)}")
