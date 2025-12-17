"""
Run Repository - manages loading and caching of telemetry runs.

This abstraction layer allows the backend to work with CSV files now,
and can be swapped for a real database later without touching the API.
"""

import logging
from pathlib import Path
from typing import Optional

from app.models.telemetry import TelemetryRun, RunSummary
from app.services.csv_parser import parse_telemetry_file


logger = logging.getLogger(__name__)


class RunRepository:
    """
    Repository for managing telemetry runs.
    
    Currently reads from CSV files in a folder.
    Caches parsed runs in memory for performance.
    """
    
    def __init__(self, data_folder: Optional[Path] = None):
        """
        Initialize the repository.
        
        Args:
            data_folder: Folder containing CSV files. If None, must be set later.
        """
        self._data_folder: Optional[Path] = data_folder
        self._cache: dict[str, TelemetryRun] = {}
        self._index: dict[str, Path] = {}  # id -> filepath mapping
        
        if data_folder is not None:
            self.scan_folder(data_folder)
    
    @property
    def data_folder(self) -> Optional[Path]:
        return self._data_folder
    
    def set_data_folder(self, folder: Path) -> int:
        """
        Set the data folder and scan for CSV files.
        
        Args:
            folder: Path to folder containing CSV files
            
        Returns:
            Number of CSV files found
        """
        self._data_folder = folder
        self._cache.clear()
        self._index.clear()
        return self.scan_folder(folder)
    
    def scan_folder(self, folder: Path) -> int:
        """
        Scan a folder for CSV files and build the index.
        
        Args:
            folder: Folder to scan
            
        Returns:
            Number of CSV files found
        """
        if not folder.exists():
            logger.warning(f"Data folder does not exist: {folder}")
            return 0
        
        count = 0
        for csv_file in folder.glob("*.csv"):
            if csv_file.is_file():
                # Generate ID from filename for consistency
                run_id = self._filepath_to_id(csv_file)
                self._index[run_id] = csv_file
                count += 1
                logger.debug(f"Indexed run: {run_id} -> {csv_file.name}")
        
        logger.info(f"Scanned {count} CSV files in {folder}")
        return count
    
    def list_runs(self) -> list[RunSummary]:
        """
        List all available runs.
        
        Returns:
            List of RunSummary objects
        """
        summaries = []
        
        for run_id, filepath in self._index.items():
            # Check cache first
            if run_id in self._cache:
                summaries.append(RunSummary.from_run(self._cache[run_id]))
            else:
                # Load minimally to get summary
                try:
                    run = self._load_run(filepath)
                    summaries.append(RunSummary.from_run(run))
                except Exception as e:
                    logger.error(f"Failed to load run {filepath}: {e}")
        
        # Sort by recorded time (newest first), then by name
        summaries.sort(
            key=lambda s: (s.recorded_at or "", s.name),
            reverse=True
        )
        
        return summaries
    
    def get_run(self, run_id: str) -> Optional[TelemetryRun]:
        """
        Get a run by ID.
        
        Args:
            run_id: The run identifier
            
        Returns:
            TelemetryRun if found, None otherwise
        """
        # Check cache
        if run_id in self._cache:
            return self._cache[run_id]
        
        # Check index
        if run_id not in self._index:
            return None
        
        # Load and cache
        filepath = self._index[run_id]
        try:
            run = self._load_run(filepath)
            return run
        except Exception as e:
            logger.error(f"Failed to load run {run_id}: {e}")
            return None
    
    def get_run_by_name(self, name: str) -> Optional[TelemetryRun]:
        """
        Get a run by filename/name.
        
        Args:
            name: The run name (typically filename without extension)
            
        Returns:
            TelemetryRun if found, None otherwise
        """
        for run_id, filepath in self._index.items():
            if filepath.stem == name:
                return self.get_run(run_id)
        return None
    
    def reload_run(
        self, 
        run_id: str,
        origin_lat: Optional[float] = None,
        origin_lon: Optional[float] = None,
        origin_alt: Optional[float] = None,
    ) -> Optional[TelemetryRun]:
        """
        Reload a run with optional manual origin override.
        
        Args:
            run_id: The run identifier
            origin_lat: Manual origin latitude
            origin_lon: Manual origin longitude
            origin_alt: Manual origin altitude
            
        Returns:
            TelemetryRun if found, None otherwise
        """
        if run_id not in self._index:
            return None
        
        filepath = self._index[run_id]
        
        # Remove from cache
        if run_id in self._cache:
            del self._cache[run_id]
        
        try:
            run = self._load_run(filepath, origin_lat, origin_lon, origin_alt)
            return run
        except Exception as e:
            logger.error(f"Failed to reload run {run_id}: {e}")
            return None
    
    def clear_cache(self) -> None:
        """Clear the in-memory cache."""
        self._cache.clear()
        logger.info("Run cache cleared")
    
    def _load_run(
        self,
        filepath: Path,
        origin_lat: Optional[float] = None,
        origin_lon: Optional[float] = None,
        origin_alt: Optional[float] = None,
    ) -> TelemetryRun:
        """Load a run from CSV and cache it."""
        run = parse_telemetry_file(filepath, origin_lat, origin_lon, origin_alt)
        
        # Update cache
        self._cache[run.metadata.id] = run
        
        # Update index if needed (in case ID changed)
        if run.metadata.id not in self._index:
            self._index[run.metadata.id] = filepath
        
        logger.debug(f"Loaded and cached run: {run.metadata.id}")
        return run
    
    def _filepath_to_id(self, filepath: Path) -> str:
        """Generate a consistent ID from filepath."""
        # Use filename + size + mtime hash for consistency
        import hashlib
        stat = filepath.stat()
        id_string = f"{filepath.name}_{stat.st_size}_{stat.st_mtime}"
        return hashlib.sha256(id_string.encode()).hexdigest()[:16]


# Global repository instance (set up by app initialization)
_repository: Optional[RunRepository] = None


def get_repository() -> RunRepository:
    """Get the global repository instance."""
    global _repository
    if _repository is None:
        _repository = RunRepository()
    return _repository


def init_repository(data_folder: Path) -> RunRepository:
    """Initialize the global repository with a data folder."""
    global _repository
    _repository = RunRepository(data_folder)
    return _repository
