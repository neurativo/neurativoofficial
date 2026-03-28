import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "AI Lecture Assistant Backend"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY")
    CLERK_JWKS_URL: str = os.getenv("CLERK_JWKS_URL", "https://excited-cowbird-75.clerk.accounts.dev/.well-known/jwks.json")
    # Comma-separated list of allowed CORS origins — set in .env for production
    ALLOWED_ORIGINS: list = [
        o.strip()
        for o in os.getenv(
            "ALLOWED_ORIGINS",
            "https://neurativo.com,https://www.neurativo.com"
        ).split(",")
        if o.strip()
    ]


settings = Settings()
