PLAN_LIMITS = {
    "free": {
        # 5 lectures × 45 min = 225 min Whisper = ~$1.35 worst case/month
        "live_lectures_per_month":    5,
        "live_max_duration_seconds":  2700,   # 45 min — covers a standard class
        # 2 uploads × 60 min = 120 min Whisper = ~$0.72 worst case/month
        "uploads_per_month":          2,
        "upload_max_duration_seconds": 3600,  # 60 min
        "upload_max_bytes":           300 * 1024 * 1024,  # 300 MB
    },
    "student": {
        # 20 lectures × 90 min avg = 1800 min = ~$10.80 worst case/month
        # Expected avg (~60 min): 20 × 60 = 1200 min = ~$7.20
        "live_lectures_per_month":    20,
        "live_max_duration_seconds":  5400,   # 90 min — covers most university lectures
        # 10 uploads × 2h = 1200 min = ~$7.20 worst case/month
        "uploads_per_month":          10,
        "upload_max_duration_seconds": 7200,  # 2 hours
        "upload_max_bytes":           1 * 1024 * 1024 * 1024,  # 1 GB
    },
    "pro": {
        # 40 lectures × 2h avg = 4800 min = ~$28.80 worst case/month
        # Expected avg (~70 min): 40 × 70 = 2800 min = ~$16.80
        "live_lectures_per_month":    40,
        "live_max_duration_seconds":  7200,   # 2 hours — covers even long seminars
        # 20 uploads × 2h = 2400 min = ~$14.40 worst case/month
        "uploads_per_month":          20,
        "upload_max_duration_seconds": 7200,  # 2 hours
        "upload_max_bytes":           2 * 1024 * 1024 * 1024,  # 2 GB
    },
}


def get_limits(plan_tier: str) -> dict:
    return PLAN_LIMITS.get(plan_tier, PLAN_LIMITS["free"])


def is_unlimited(value) -> bool:
    return value is None
