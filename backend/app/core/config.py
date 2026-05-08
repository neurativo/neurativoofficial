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


def _default_clerk_issuer(jwks_url: str) -> str:
    suffix = "/.well-known/jwks.json"
    return jwks_url[:-len(suffix)] if jwks_url and jwks_url.endswith(suffix) else ""


class Settings:
    PROJECT_NAME: str = "AI Lecture Assistant Backend"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY")
    CLERK_JWKS_URL: str = _require_env("CLERK_JWKS_URL")
    CLERK_JWT_ISSUER: str = os.getenv("CLERK_JWT_ISSUER", "") or _default_clerk_issuer(CLERK_JWKS_URL)
    CLERK_SECRET_KEY: str = os.getenv("CLERK_SECRET_KEY", "")
    # Comma-separated list of allowed CORS origins — set in .env for production
    ALLOWED_ORIGINS: list = [
        o.strip()
        for o in os.getenv(
            "ALLOWED_ORIGINS",
            "https://neurativo.com,https://www.neurativo.com,https://teams.neurativo.com"
        ).split(",")
        if o.strip()
    ]
    # Comma-separated Clerk user IDs with admin access (e.g. user_abc123,user_def456)
    ADMIN_USER_IDS: list = [
        u.strip()
        for u in os.getenv("ADMIN_USER_IDS", "").split(",")
        if u.strip()
    ]
    # Resend — transactional email (invite emails); optional
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    RESEND_FROM_EMAIL: str = os.getenv("RESEND_FROM_EMAIL", "Neurativo <noreply@neurativo.com>")


settings = Settings()
