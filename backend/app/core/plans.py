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
        "total_minutes_per_month":     1500,    # 25 hrs hard ceiling
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
        # $39/month — target margin: ~45% at average usage
        "live_lectures_per_month":     None,    # unlimited
        "live_max_duration_seconds":   None,    # unlimited per lecture
        "uploads_per_month":           None,    # unlimited
        "upload_max_duration_seconds": None,    # unlimited per file
        "upload_max_bytes":            None,    # unlimited
        "total_minutes_per_month":     3600,    # 60 hrs hard ceiling
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
    return PLAN_LIMITS.get(plan_tier, PLAN_LIMITS["free"])


def is_unlimited(value) -> bool:
    return value is None


def get_feature_flags(plan_tier: str) -> dict:
    """Returns only the boolean feature flags for a plan tier."""
    limits = get_limits(plan_tier)
    return {k: limits[k] for k in FEATURE_FLAGS if k in limits}
