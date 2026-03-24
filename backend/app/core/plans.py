PLAN_LIMITS = {
    "free": {
        "live_lectures_per_month": 5,
        "live_max_duration_seconds": 1800,   # 30 min
        "uploads_per_month": 3,
        "upload_max_duration_seconds": 3600,  # 60 min audio
        "upload_max_bytes": 500 * 1024 * 1024,  # 500 MB
    },
    "student": {
        "live_lectures_per_month": None,      # unlimited
        "live_max_duration_seconds": 10800,   # 3 hours
        "uploads_per_month": 20,
        "upload_max_duration_seconds": 14400,  # 4 hours
        "upload_max_bytes": 2 * 1024 * 1024 * 1024,  # 2 GB
    },
    "pro": {
        "live_lectures_per_month": None,
        "live_max_duration_seconds": None,    # unlimited
        "uploads_per_month": None,
        "upload_max_duration_seconds": None,
        "upload_max_bytes": None,
    },
}


def get_limits(plan_tier: str) -> dict:
    return PLAN_LIMITS.get(plan_tier, PLAN_LIMITS["free"])


def is_unlimited(value) -> bool:
    return value is None
