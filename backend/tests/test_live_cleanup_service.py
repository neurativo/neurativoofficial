from datetime import datetime, timedelta, timezone


def test_cleanup_stale_live_sessions_finalizes_old_sessions(monkeypatch):
    from app.services import live_cleanup_service as svc

    old_ts = (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat()
    calls = []

    monkeypatch.setattr(svc, "list_active_live_sessions", lambda limit=0: [
        {"id": "sess1", "lecture_id": "lec1", "created_at": old_ts, "last_chunk_at": None},
    ])
    monkeypatch.setattr(svc, "get_lecture_owner", lambda lecture_id: "user1")
    monkeypatch.setattr(svc, "end_live_session_if_active", lambda lecture_id, session_id=None: True)
    monkeypatch.setattr(svc, "get_lecture_for_summarization", lambda lecture_id: {"total_duration_seconds": 1800})
    monkeypatch.setattr(
        svc,
        "finalize_reserved_credits",
        lambda user_id, lecture_id, actual_duration_seconds: calls.append(
            ("finalize", user_id, lecture_id, actual_duration_seconds)
        ),
    )
    monkeypatch.setattr(
        svc,
        "add_monthly_usage_minutes",
        lambda user_id, minutes: calls.append(("minutes", user_id, minutes)),
    )

    cleaned = svc.cleanup_stale_live_sessions(idle_minutes=15, limit=5)

    assert cleaned == 1
    assert ("finalize", "user1", "lec1", 1800) in calls
    assert ("minutes", "user1", 29) in calls


def test_cleanup_stale_live_sessions_skips_recent_sessions(monkeypatch):
    from app.services import live_cleanup_service as svc

    fresh_ts = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
    monkeypatch.setattr(svc, "list_active_live_sessions", lambda limit=0: [
        {"id": "sess1", "lecture_id": "lec1", "created_at": fresh_ts, "last_chunk_at": fresh_ts},
    ])
    monkeypatch.setattr(svc, "get_lecture_owner", lambda lecture_id: "user1")
    monkeypatch.setattr(svc, "end_live_session_if_active", lambda lecture_id, session_id=None: True)

    cleaned = svc.cleanup_stale_live_sessions(idle_minutes=15, limit=5)

    assert cleaned == 0
