#!/usr/bin/env python3
"""
Launch script for Autocross Telemetry Backend.

Usage:
    python run_server.py [data_folder] [--port PORT] [--host HOST]
    
Examples:
    python run_server.py                    # Use default ./data/runs folder
    python run_server.py /path/to/csvs      # Use custom folder
    python run_server.py --port 5000        # Run on port 5000
"""

import argparse
import os
import sys
from pathlib import Path

# Add app to path
sys.path.insert(0, str(Path(__file__).parent))


def main():
    parser = argparse.ArgumentParser(description="Autocross Telemetry Backend Server")
    parser.add_argument(
        "data_folder",
        nargs="?",
        default="./data/runs",
        help="Path to folder containing CSV telemetry files (default: ./data/runs)"
    )
    parser.add_argument(
        "--port", "-p",
        type=int,
        default=8000,
        help="Port to run server on (default: 8000)"
    )
    parser.add_argument(
        "--host", "-H",
        default="127.0.0.1",
        help="Host to bind to (default: 127.0.0.1, use 0.0.0.0 for all interfaces)"
    )
    parser.add_argument(
        "--debug", "-d",
        action="store_true",
        help="Run in debug mode"
    )
    
    args = parser.parse_args()
    
    data_folder = Path(args.data_folder)
    
    print(f"Autocross Telemetry Backend")
    print(f"=" * 40)
    print(f"Data folder: {data_folder.absolute()}")
    print(f"Server: http://{args.host}:{args.port}")
    print(f"=" * 40)
    
    if not data_folder.exists():
        print(f"\nWarning: Data folder does not exist: {data_folder}")
        print("You can set it later via POST /folder")
    
    # Configure data folder for FastAPI lifespan
    if data_folder.exists():
        os.environ["AUTOCROSS_DATA_FOLDER"] = str(data_folder)
    
    print("\nAPI Endpoints:")
    print("  GET  /              - Health check")
    print("  GET  /health        - Detailed health")
    print("  GET  /folder        - Current folder info")
    print("  POST /folder        - Set data folder")
    print("  GET  /runs          - List all runs")
    print("  GET  /runs/{id}     - Get run metadata")
    print("  GET  /runs/{id}/data     - Get full run data")
    print("  GET  /runs/{id}/playback - Get playback data")
    print("\nStarting server...")

    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.debug,
        log_level="info",
    )


if __name__ == "__main__":
    main()
