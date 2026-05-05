from pydantic_settings import BaseSettings
from functools import lru_cache
import os

class Settings(BaseSettings):
    APP_NAME: str = "Penumbra"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

    HTTP_TIMEOUT: float = 15.0
    MEMPOOL_API_URL: str = "https://mempool.space/api"

    CACHE_TTL_UTXOS: int = 30
    CACHE_TTL_TRANSACTIONS: int = 300
    CACHE_TTL_FEES: int = 60

    BITCOIN_RPC_USER: str = os.getenv("BITCOIN_RPC_USER", "")
    BITCOIN_RPC_PASSWORD: str = os.getenv("BITCOIN_RPC_PASSWORD", "")
    BITCOIN_RPC_PORT: int = int(os.getenv("BITCOIN_RPC_PORT", "15443"))
    BITCOIN_RPC_HOST: str = os.getenv("BITCOIN_RPC_HOST", "localhost")
    BITCOIN_ZMQ_HOST: str = os.getenv("BITCOIN_ZMQ_HOST", "localhost")
    BITCOIN_ZMQ_PORT: int = int(os.getenv("BITCOIN_ZMQ_PORT", "28332"))

    @property
    def BITCOIN_RPC_URL(self) -> str:
        return f"http://{self.BITCOIN_RPC_HOST}:{self.BITCOIN_RPC_PORT}"
    @property
    def BITCOIN_ZMQ_URL(self) -> str:
        return f"tcp://{self.BITCOIN_ZMQ_HOST}:{self.BITCOIN_ZMQ_PORT}"
    
    @property
    def USE_BITCOIN_CORE(self) -> bool:
        return bool(self.BITCOIN_RPC_USER and self.BITCOIN_RPC_PASSWORD)
    
@lru_cache
def get_setting() -> Settings:
    return Settings()

settings = get_setting()