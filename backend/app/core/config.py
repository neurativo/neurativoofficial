import os
import sys
from dotenv import load_dotenv

load_dotenv()


def _require_env(name: str) -> str:
    """Return an env var or abort at startup — never silently fall back."""
    val = os.getenv(name)
    if not val:
        print(f"FATAL: required environment variable {name} is not set", file=sys.stderr)
        sys.exit(1)
    return val


class Settings:
    PROJECT_NAME: str = "AI Lecture Assistant Backend"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY")
    CLERK_JWKS_URL: str = _require_env("CLERK_JWKS_URL")
    CLERK_JWT_ISSUER: str = os.getenv("CLERK_JWT_ISSUER", "")
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
