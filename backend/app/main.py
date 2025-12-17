"""
Autocross Telemetry MVP - FastAPI Backend

Main application entry point and configuration.
"""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.runs import router as runs_router, folder_router
from app.services.repository import init_repository, get_repository


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# Default data folder (can be overridden via API or environment)
DEFAULT_DATA_FOLDER = Path("./data/runs")
DATA_FOLDER_ENV = "AUTOCROSS_DATA_FOLDER"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    logger.info("Starting Autocross Telemetry Backend")
    
    # Initialize repository with configured folder if it exists
    repo = get_repository()
    if repo.data_folder is None:
        data_folder = Path(os.getenv(DATA_FOLDER_ENV, str(DEFAULT_DATA_FOLDER)))
        if data_folder.exists():
            init_repository(data_folder)
            logger.info(f"Initialized repository with folder: {data_folder}")
        else:
            logger.info(f"Default data folder not found: {data_folder}")
            logger.info("Use POST /folder to set data folder")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Autocross Telemetry Backend")


# Create FastAPI app
app = FastAPI(
    title="Autocross Telemetry MVP",
    description="""
    Backend API for autocross telemetry analysis.
    
    ## Features
    - Ingest GPS + IMU telemetry from TrackAddict CSV files
    - Convert GPS coordinates to local ENU frame
    - Serve telemetry data for visualization
    - Provide playback data at configurable sample rates
    
    ## Data Flow
    1. Set data folder via POST /folder
    2. List available runs via GET /runs
    3. Get run data via GET /runs/{id}/data
    4. Get playback data via GET /runs/{id}/playback
    """,
    version="0.1.0",
    lifespan=lifespan,
)


# CORS middleware (allow all origins for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(runs_router)
app.include_router(folder_router)


@app.get("/")
async def root():
    """Root endpoint - basic health check."""
    return {
        "name": "Autocross Telemetry MVP",
        "version": "0.1.0",
        "status": "running",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    from app.services.repository import get_repository
    repo = get_repository()
    
    return {
        "status": "healthy",
        "data_folder": str(repo.data_folder) if repo.data_folder else None,
        "run_count": len(repo._index),
    }
