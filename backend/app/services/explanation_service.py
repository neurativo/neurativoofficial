import json
from openai import OpenAI
from app.core.config import settings
from fastapi import HTTPException

# Initialize client
client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None

def generate_explanation(selected_text: str, mode: str = "simple"):
    """
    Generates a structured explanation for academic content.
    mode: "simple" for plain language, "technical" for academic depth.
    """
    if not client:
        raise HTTPException(status_code=500, detail="OpenAI client not initialized")

    if mode == "technical":
        system_instruction = (
            "You are Neurativo, an AI academic tutor. "
            "Provide a rigorous, technically precise explanation using domain-specific terminology. "
            "Assume the reader has academic background. Avoid unnecessary verbosity. "
            "Return your response as a valid JSON object."
        )
    else:
        system_instruction = (
            "You are Neurativo, an AI academic tutor. "
            "Explain clearly and simply, as if to someone encountering this concept for the first time. "
            "Avoid jargon. Avoid unnecessary verbosity. "
            "Return your response as a valid JSON object."
        )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": system_instruction
                },
                {
                    "role": "user",
                    "content": (
                        "Explain the following academic content:\n\n"
                        "1. Simple Explanation\n"
                        "2. Real-World Analogy\n"
                        "3. Step-by-Step Breakdown (if applicable)\n\n"
                        f"Content:\n{selected_text}\n\n"
                        "Keep response structured and concise. "
                        "Must follow this JSON format:\n"
                        "{\n"
                        "  \"explanation\": \"...\",\n"
                        "  \"analogy\": \"...\",\n"
                        "  \"breakdown\": \"...\"\n"
                        "}"
                    )
                }
            ],
            temperature=0.3,
            max_tokens=600,
            response_format={"type": "json_object"}
        )

        content = response.choices[0].message.content
        return json.loads(content)

    except Exception as e:
        print(f"Error generating explanation: {e}")
        raise HTTPException(status_code=500, detail=f"Explanation failed: {str(e)}")
