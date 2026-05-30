"""
scheduled_releases.py
---------------------
Daemon thread that checks every 60 seconds for feature releases whose
scheduled_at has passed and published_at is still NULL, then publishes them.

Matches the daemon-thread pattern used in live_cleanup_service.py and cost_tracker.py.
"""
import logging
import threading
import time

logger = logging.getLogger(__name__)

_thread: threading.Thread | None = None


def _run_loop() -> None:
    while True:
        try:
            from app.services.feature_flags_service import auto_publish_due_releases
            auto_publish_due_releases()
        except Exception as e:
            logger.error(f"[release-scheduler] check failed: {e}")
        time.sleep(60)


def start_scheduler() -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    _thread = threading.Thread(target=_run_loop, daemon=True, name="release-scheduler")
    _thread.start()
    logger.info("Release scheduler started (60s interval)")
