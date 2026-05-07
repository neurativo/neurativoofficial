# Subscription prices (USD/month) — reference only, no payment gateway yet
PLAN_PRICES_USD = {
    "free":    0.00,
    "student": 9.99,
    "pro":    19.99,
}

# Cost model: Whisper $0.006/min + GPT-4o-mini ~$0.0007/min = ~$0.0067/min total.
# 1 credit = 1 lecture. Avg lecture 30 min = ~$0.20 cost.
# Included credits set low to protect margins — heavy users buy extra packs.
PLAN_LIMITS = {
    "free": {
        # 5 live × 30 min + 3 imports × 60 min avg = ~330 min max = ~$1.98 Whisper worst case
        "live_lectures_per_month":     5,
        "live_max_duration_seconds":   1800,    # 30 min per lecture
        "uploads_per_month":           3,
        "upload_max_duration_seconds": 3600,    # 60 min per file
        "upload_max_bytes":            500 * 1024 * 1024,   # 500 MB
        "total_minutes_per_month":     150,     # 2.5 hrs hard ceiling
        # Feature flags
        "max_summary_sections":        2,       # only first 2 sections summarized
        "pdf_export":                  False,
        "qa_enabled":                  False,
        "sharing":                     False,
        "multilingual":                False,
        "visual_capture":              False,
        "flashcards":                  False,
        "action_items":                False,
        "speaker_diarization":         False,
        "lecture_comparison":          False,
        "bulk_export":                 False,
        "api_access":                  False,
        "global_search":               False,
        "spaced_repetition":           False,
        "priority_processing":         False,
    },
    "student": {
        # $19/month — target margin: ~55% at average usage
        "live_lectures_per_month":     None,    # unlimited count
        "live_max_duration_seconds":   10800,   # 3 hours per lecture
        "uploads_per_month":           20,
        "upload_max_duration_seconds": 10800,   # 3 hours per file
        "upload_max_bytes":            2 * 1024 * 1024 * 1024,  # 2 GB
        "total_minutes_per_month":     1500,    # 25 hrs hard ceiling — worst-case Whisper: $9.00 (~= $9.99 revenue; credits run out first at 15 lectures)
        # Feature flags
        "max_summary_sections":        None,    # all sections
        "pdf_export":                  True,
        "qa_enabled":                  True,
        "sharing":                     True,
        "multilingual":                True,
        "visual_capture":              True,
        "flashcards":                  True,
        "action_items":                True,
        "speaker_diarization":         False,
        "lecture_comparison":          False,
        "bulk_export":                 False,
        "api_access":                  False,
        "global_search":               False,
        "spaced_repetition":           False,
        "priority_processing":         True,
    },
    "pro": {
        # $19.99/month — target margin: ~58% at worst-case (credit-gated; time cap is safety net)
        "live_lectures_per_month":     None,    # unlimited count
        "live_max_duration_seconds":   14400,   # 4 hours per lecture
        "uploads_per_month":           None,    # unlimited
        "upload_max_duration_seconds": 14400,   # 4 hours per file
        "upload_max_bytes":            None,    # unlimited
        "total_minutes_per_month":     2400,    # 40 hrs hard ceiling — worst-case API cost: $16.80 vs $19.99 = 16% floor margin (credits exhaust first)
        # Feature flags
        "max_summary_sections":        None,    # all sections
        "pdf_export":                  True,
        "qa_enabled":                  True,
        "sharing":                     True,
        "multilingual":                True,
        "visual_capture":              True,
        "flashcards":                  True,
        "action_items":                True,
        "speaker_diarization":         True,
        "lecture_comparison":          True,
        "bulk_export":                 True,
        "api_access":                  True,
        "global_search":               True,
        "spaced_repetition":           True,
        "priority_processing":         True,
    },
}

# Feature flag keys that are boolean (for easy iteration)
FEATURE_FLAGS = [
    "pdf_export", "qa_enabled", "sharing", "multilingual",
    "visual_capture", "flashcards", "action_items",
    "speaker_diarization", "lecture_comparison", "bulk_export",
    "api_access", "global_search", "spaced_repetition", "priority_processing",
]


def get_limits(plan_tier: str) -> dict:
    """
    Returns limits for a plan tier. Checks Supabase admin_config override first,
    falls back to Python constants if no override is set or Supabase is unavailable.
    """
    try:
        from app.services.supabase_service import get_plan_limits_override
        override = get_plan_limits_override()
        if override and plan_tier in override:
            # Merge override with base constants so any missing keys use defaults
            base = dict(PLAN_LIMITS.get(plan_tier, PLAN_LIMITS["free"]))
            base.update(override[plan_tier])
            return base
    except Exception:
        pass
    return PLAN_LIMITS.get(plan_tier, PLAN_LIMITS["free"])


def is_unlimited(value) -> bool:
    return value is None


def get_feature_flags(plan_tier: str) -> dict:
    """Returns only the boolean feature flags for a plan tier."""
    limits = get_limits(plan_tier)
    return {k: limits[k] for k in FEATURE_FLAGS if k in limits}
