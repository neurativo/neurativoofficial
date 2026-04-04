import asyncio
import base64
import json

import app.services.openai_service as openai_service
from app.services.cost_tracker import log_cost_async

VISION_PROMPT = """You are analyzing a screenshot from a live lecture.
Extract ALL meaningful academic content visible on screen.

Look for and describe:
- Text on slides (headings, bullet points, body text)
- Mathematical equations or formulas — write them out fully
- Chemical structures or formulas
- Diagrams, charts, graphs — describe what they show
- Code snippets — transcribe them exactly
- Tables — describe their structure and content
- Whiteboard or annotation content
- Any key terms or definitions visible

Format your response as JSON:
{
  "has_content": true/false,
  "content_type": "slide|whiteboard|code|diagram|mixed|none",
  "title": "slide or section title if visible",
  "text_content": "all readable text verbatim",
  "equations": ["list of equations found"],
  "diagrams": ["description of each diagram/chart"],
  "code": "any code visible",
  "key_terms": ["important terms highlighted or emphasized"],
  "summary": "one sentence describing what this screen shows"
}

If the screen shows nothing academically relevant
(desktop, browser tabs, chat, etc.), set has_content: false.
Return ONLY valid JSON."""


BOARD_PROMPT = """You are analyzing a photo taken of a physical classroom
whiteboard, blackboard, or projector screen.

The image may contain:
- Handwritten text (potentially messy or partial)
- Mathematical equations written by hand
- Diagrams drawn by hand
- Printed slides on a projector
- Chemical structures
- Graphs or charts drawn on board
- Key terms underlined or circled

Your job is to extract ALL readable academic content.
Be tolerant of imperfect handwriting — do your best to read what is written.

Format your response as JSON:
{
  "has_content": true/false,
  "is_readable": true/false,
  "content_type": "whiteboard|blackboard|projector|mixed|unclear",
  "title": "any heading or title visible",
  "text_content": "all readable text, preserving structure",
  "equations": ["list of equations found"],
  "diagrams": ["description of each drawing/diagram"],
  "key_terms": ["important terms that appear emphasized"],
  "confidence": "high|medium|low",
  "summary": "one sentence describing what is on the board"
}

If the image is too blurry, too dark, or has no academic content,
set has_content: false and is_readable: false.
Return ONLY valid JSON."""


def assess_frame_quality(image_base64: str) -> dict:
    """
    Quick local assessment of frame quality before sending to Vision API.
    Avoids API calls for blank or too-dark frames.
    Returns: {"usable": bool, "issue": str|None}
    """
    try:
        image_bytes = base64.b64decode(image_base64)
        size_kb = len(image_bytes) / 1024
        if size_kb < 5:
            return {"usable": False, "issue": "too_dark"}
        if size_kb > 10:
            return {"usable": True, "issue": None}
        return {"usable": True, "issue": None}
    except Exception:
        return {"usable": True, "issue": None}


async def analyze_frame(image_base64: str, topic: str = None) -> dict:
    """
    Sends a base64 encoded screen-capture frame to GPT-4o Vision.
    Returns structured visual content or empty dict on failure.
    """
    if not openai_service.client:
        return {}

    topic_note = f" This is a {topic} lecture." if topic else ""

    try:
        response = await asyncio.to_thread(
            openai_service.client.chat.completions.create,
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": VISION_PROMPT + topic_note
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}",
                                "detail": "high"
                            }
                        }
                    ]
                }
            ],
            max_tokens=800,
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        await log_cost_async("vision_screen", "gpt-4o-vision", image_count=1)
        print(f"[VISION] {result.get('content_type')} — {result.get('summary', '')[:80]}")
        return result

    except Exception as e:
        print(f"[VISION] Error: {e}")
        return {}


async def analyze_board_frame(image_base64: str, topic: str = None) -> dict:
    """
    Analyzes a physical board/projector photo with the board-specific prompt.
    Includes a quality pre-check to avoid wasting API calls on dark frames.
    """
    if not openai_service.client:
        return {}

    quality = assess_frame_quality(image_base64)
    if not quality["usable"]:
        print(f"[VISION-BOARD] Skipped: {quality['issue']}")
        return {"has_content": False, "issue": quality["issue"]}

    topic_note = f" This is a {topic} lecture." if topic else ""

    try:
        response = await asyncio.to_thread(
            openai_service.client.chat.completions.create,
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": BOARD_PROMPT + topic_note
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}",
                                "detail": "high"
                            }
                        }
                    ]
                }
            ],
            max_tokens=800,
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        await log_cost_async("vision_board", "gpt-4o-vision", image_count=1)
        confidence = result.get("confidence", "low")
        print(
            f"[VISION-BOARD] {result.get('content_type')} "
            f"confidence={confidence} — {result.get('summary', '')[:80]}"
        )
        return result

    except Exception as e:
        print(f"[VISION-BOARD] Error: {e}")
        return {}


def format_visual_for_summary(visual: dict) -> str:
    """
    Formats visual content into a text description
    that can be merged with the audio transcript.
    Works for both screen and board frames.
    """
    if not visual or not visual.get("has_content"):
        return ""

    parts = []

    if visual.get("title"):
        parts.append(f"[Slide: {visual['title']}]")

    if visual.get("text_content"):
        parts.append(visual["text_content"])

    if visual.get("equations"):
        parts.append("Equations: " + " | ".join(visual["equations"]))

    if visual.get("diagrams"):
        for d in visual["diagrams"]:
            parts.append(f"[Diagram: {d}]")

    if visual.get("code"):
        parts.append(f"[Code shown: {visual['code'][:200]}]")

    return "\n".join(parts) if parts else ""


def should_send_frame(current_frame_b64: str, last_frame_b64: str) -> bool:
    """
    Compares two base64 frames to detect meaningful change.
    Returns True only if content has changed enough to warrant
    sending to Vision API (>2% byte-level difference).
    """
    if not last_frame_b64:
        return True

    sample_size = min(len(current_frame_b64), len(last_frame_b64), 5000)
    current_sample = current_frame_b64[:sample_size]
    last_sample = last_frame_b64[:sample_size]

    differences = sum(c1 != c2 for c1, c2 in zip(current_sample, last_sample))
    change_pct = differences / sample_size
    return change_pct > 0.02
