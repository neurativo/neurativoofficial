import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "AI Lecture Assistant Backend"
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY")


settings = Settings()
