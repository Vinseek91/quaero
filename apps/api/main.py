from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from loguru import logger

from api.routes import router
from core.config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("QUAERYX starting up...")
    yield
    logger.info("QUAERYX shutting down...")

app = FastAPI(
    title="QUAERYX",
    description="The search engine born from the word 'search' — more powerful than Google + Perplexity combined",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")

@app.get("/health")
async def health():
    return {"status": "ok", "service": "quaeryx"}
