import asyncio
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.routes import router
from app.api.wallet_routes import router as wallet_router
from app.websocket.alerts import start_alert_monitoring
from app.websocket.zmq_listener import start_zmq_listener
from app.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()

    asyncio.create_task(start_alert_monitoring(interval_seconds=60))
    asyncio.create_task(start_zmq_listener())
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
app.include_router(wallet_router, prefix="/api")


@app.get("/")
async def root():
    return {"app": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/health")
async def health():
    return {"status": "ok"}