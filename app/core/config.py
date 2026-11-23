from functools import lru_cache

from pydantic import Field, computed_field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    APP_NAME: str = "Samity Khata"
    DEBUG: bool = False
    APP_ENV: str = "development"

    # Database (compose sets DB_HOST=db and DB_PORT=5432 inside Docker)
    DB_HOST: str = "localhost"
    DB_PORT: int = 5433
    DB_USER: str = Field(min_length=1)
    DB_PASSWORD: SecretStr = Field(min_length=1)
    DB_NAME: str = Field(min_length=1)

    @computed_field
    @property
    def DATABASE_URL(self) -> str:
        return URL.create(
            drivername="postgresql+asyncpg",
            username=self.DB_USER,
            password=self.DB_PASSWORD.get_secret_value(),
            host=self.DB_HOST,
            port=self.DB_PORT,
            database=self.DB_NAME,
        ).render_as_string(hide_password=False)

    # Auth (required)
    JWT_SECRET: str = Field(min_length=32)
    JWT_EXPIRE_MINUTES: int = 60

    # Chat model (optional: POST /chat returns 503 until both are set)
    LLM_API_KEY: str | None = None
    LLM_MODEL: str | None = None
    LLM_MAX_TOOL_STEPS: int = Field(default=6, ge=1, le=10)

    # Embeddings (required)
    EMBEDDING_URL: str
    EMBEDDING_DIM: int = 384
    RAG_SIMILARITY_THRESHOLD: float = 0.35

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )




@lru_cache
def get_settings() -> Settings:
    return Settings()