from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # App
    APP_NAME: str = "QUAERO"
    DEBUG: bool = False
    PORT: int = 8000

    # Model routing — points to OmniRoute by default (free tier)
    OPENAI_BASE_URL: str = "http://localhost:20128/v1"
    OPENAI_API_KEY: str = "omniroute"

    # Groq free API fallback (when OmniRoute unavailable)
    GROQ_API_KEY: Optional[str] = None

    # Search providers (all have free tiers)
    BRAVE_API_KEY: Optional[str] = None
    TAVILY_API_KEY: Optional[str] = None
    EXA_API_KEY: Optional[str] = None
    SERPAPI_KEY: Optional[str] = None

    # Storage
    REDIS_URL: str = "redis://localhost:6379"
    QDRANT_URL: str = "http://localhost:6333"
    NEO4J_URL: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "quaero123"

    # MiroFish
    MIROFISH_URL: str = "http://localhost:8001"
    MIROFISH_ENABLED: bool = True
    MIROFISH_AGENTS: int = 500   # agents per simulation

    class Config:
        env_file = ".env"

settings = Settings()
