PLAN_LIMITS = {
    "free": {
        # 5 live × 30 min + 3 imports × 60 min avg = ~330 min max = ~$1.98 Whisper worst case
        "live_lectures_per_month":     5,
        "live_max_duration_seconds":   1800,    # 30 min per lecture
        "uploads_per_month":           3,
        "upload_max_duration_seconds": 3600,    # 60 min per file
        "upload_max_bytes":            300 * 1024 * 1024,   # 300 MB
        "total_minutes_per_month":     150,     # 2.5 hrs hard ceiling = $0.90 Whisper max
    },
    "student": {
        # $19/month — target margin: ~55% at average usage
        # 25 hrs total cap = 1500 min = $9.00 Whisper max → $10 margin worst case
        # Expected avg (15 hrs): $5.40 Whisper + ~$2 GPT = $7.40 cost → $11.60 margin (61%)
        "live_lectures_per_month":     None,    # unlimited count
        "live_max_duration_seconds":   10800,   # 3 hours per lecture
        "uploads_per_month":           20,
        "upload_max_duration_seconds": 10800,   # 3 hours per file
        "upload_max_bytes":            1 * 1024 * 1024 * 1024,  # 1 GB
        "total_minutes_per_month":     1500,    # 25 hrs hard ceiling = $9.00 Whisper max
    },
    "pro": {
        # $39/month — target margin: ~45% at average usage
        # 60 hrs total cap = 3600 min = $21.60 Whisper max → $17.40 margin worst case
        # Expected avg (35 hrs): $12.60 Whisper + ~$4 GPT = $16.60 cost → $22.40 margin (57%)
        "live_lectures_per_month":     None,    # unlimited
        "live_max_duration_seconds":   None,    # unlimited per lecture
        "uploads_per_month":           None,    # unlimited
        "upload_max_duration_seconds": None,    # unlimited per file
        "upload_max_bytes":            5 * 1024 * 1024 * 1024,  # 5 GB
        "total_minutes_per_month":     3600,    # 60 hrs hard ceiling = $21.60 Whisper max
    },
}


def get_limits(plan_tier: str) -> dict:
    return PLAN_LIMITS.get(plan_tier, PLAN_LIMITS["free"])


def is_unlimited(value) -> bool:
    return value is None
