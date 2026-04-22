# Multilingual Code-Switching Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Neurativo work for mixed-language lectures (e.g. English + Sinhala + Tamil) by removing Whisper language pinning and replacing all language-output instructions with English-output multilingual-aware instructions.

**Architecture:** Four targeted changes across four files — no new files, no schema changes, no API changes. Remove the global language pin from live chunk transcription. Replace `_language_instruction` in summarization with `_multilingual_instruction` (always English). Add multilingual note to Q&A and PDF GPT prompts.

**Tech Stack:** Python/FastAPI, OpenAI Whisper-1, GPT-4o-mini

---

## File Map

| File | Change |
|------|--------|
| `backend/app/api/endpoints.py` | Remove `language=stored_language or None` from Whisper call |
| `backend/app/services/summarization_service.py` | Replace `_language_instruction` with `_multilingual_instruction` |
| `backend/app/services/qa_service.py` | Replace language meta-instruction with multilingual English instruction |
| `backend/app/services/pdf_service.py` | Add multilingual note to 6 GPT helper prompts |
| `backend/tests/test_multilingual.py` | New test file |

---

### Task 1: Remove language pinning from Whisper + add tests

**Files:**
- Modify: `backend/app/api/endpoints.py` (around line 748)
- Create: `backend/tests/test_multilingual.py`

- [ ] **Step 1: Create `backend/tests/test_multilingual.py` with a failing test**

```python
"""Tests for multilingual code-switching support."""
import pytest
from unittest.mock import MagicMock, patch, AsyncMock


def _make_transcribe_response(text: str, language: str = "si"):
    resp = MagicMock()
    resp.text = text
    resp.language = language
    resp.segments = []
    return resp


# ── Language pinning removed ───────────────────────────────────────────────────

def test_live_chunk_transcription_does_not_pin_language():
    """
    The live chunk endpoint must call transcribe_audio with language=None
    so Whisper handles each chunk independently (code-switching support).
    Even when the lecture has a stored language, we must not pass it to Whisper.
    """
    # This test reads the source to verify the pin is absent.
    import inspect
    from app.api import endpoints
    source = inspect.getsource(endpoints)
    # The language pin was: language=stored_language or None
    # After fix, transcribe_audio must be called without a language= kwarg
    # referencing stored_language.
    assert "language=stored_language" not in source, (
        "Language pinning still present — remove 'language=stored_language or None' "
        "from the transcribe_audio call in the live chunk endpoint."
    )
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_multilingual.py::test_live_chunk_transcription_does_not_pin_language -v 2>&1 | tail -10
```
Expected: FAIL — `AssertionError: Language pinning still present`

- [ ] **Step 3: Remove the language pin from `endpoints.py`**

Find (around line 743–751):
```python
        # 2. Transcribe — language pin passed when available.
        #    no_speech_prob segment filtering happens inside transcribe_audio().
        try:
            chunk_text, detected_language = await transcribe_audio(
                file,
                prompt=whisper_prompt,
                language=stored_language or None,
            )
```

Replace with:
```python
        # 2. Transcribe — no language pin so Whisper handles code-switching.
        #    Each chunk is detected independently. no_speech_prob filtering
        #    handles silence hallucinations (no need for language pinning).
        try:
            chunk_text, detected_language = await transcribe_audio(
                file,
                prompt=whisper_prompt,
            )
```

Also remove the now-unused `stored_language` fetch (around line 730):
```python
        stored_language = get_lecture_language(lecture_id)  # None on first chunk
```
→ Delete that line entirely. The variable is no longer used.

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_multilingual.py::test_live_chunk_transcription_does_not_pin_language -v 2>&1 | tail -10
```
Expected: PASS

- [ ] **Step 5: Verify the full backend still imports cleanly**

```bash
cd D:/neurativoproject/backend
python -c "from app.api.endpoints import router; print(f'OK — {len(router.routes)} routes')"
```
Expected: `OK — N routes` (no import error)

- [ ] **Step 6: Commit**

```bash
cd D:/neurativoproject
git add backend/app/api/endpoints.py backend/tests/test_multilingual.py
git commit -m "feat: remove Whisper language pin — enable code-switching per chunk"
```

---

### Task 2: Replace `_language_instruction` with `_multilingual_instruction` in summarization

**Files:**
- Modify: `backend/app/services/summarization_service.py`
- Modify: `backend/tests/test_multilingual.py`

- [ ] **Step 1: Add failing tests**

Append to `backend/tests/test_multilingual.py`:

```python


# ── summarization_service multilingual instruction ─────────────────────────────

def test_multilingual_instruction_exists():
    """_multilingual_instruction must exist and replace _language_instruction."""
    from app.services.summarization_service import _multilingual_instruction
    result = _multilingual_instruction()
    assert isinstance(result, str)
    assert len(result) > 20
    assert "English" in result


def test_multilingual_instruction_mentions_mixed_languages():
    """Must mention that transcripts may contain mixed languages."""
    from app.services.summarization_service import _multilingual_instruction
    result = _multilingual_instruction()
    assert "mixed" in result.lower() or "multiple" in result.lower()


def test_language_instruction_removed_from_summarization():
    """_language_instruction must no longer be used in summarization prompts."""
    import inspect
    from app.services import summarization_service
    source = inspect.getsource(summarization_service)
    # _language_instruction definition may remain for backward compat but
    # _multilingual_instruction must be present
    assert "_multilingual_instruction" in source, (
        "_multilingual_instruction not found in summarization_service"
    )
    # All lang_note assignments must use _multilingual_instruction
    import re
    lang_note_lines = [
        line.strip() for line in source.splitlines()
        if "lang_note" in line and "=" in line and "_language_instruction" in line
    ]
    assert len(lang_note_lines) == 0, (
        f"Found lang_note still using _language_instruction: {lang_note_lines}"
    )


def test_micro_summary_prompt_contains_english_instruction():
    """generate_micro_summary must inject the multilingual instruction."""
    captured = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        resp = MagicMock()
        resp.choices = [MagicMock()]
        resp.choices[0].message.content = "• point one\n• point two"
        resp.usage.prompt_tokens = 10
        resp.usage.completion_tokens = 5
        return resp

    with patch("app.services.openai_service.client") as mock_client:
        mock_client.chat.completions.create.side_effect = fake_create
        from app.services.summarization_service import generate_micro_summary
        generate_micro_summary("The cell divides using mitosis", language="si")

    system_msg = captured["messages"][0]["content"]
    assert "English" in system_msg or "english" in system_msg.lower(), (
        f"Expected English instruction in system prompt, got: {system_msg!r}"
    )
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_multilingual.py -k "multilingual_instruction or language_instruction or micro_summary_prompt" -v 2>&1 | tail -15
```
Expected: 4 failures — `_multilingual_instruction` does not exist yet.

- [ ] **Step 3: Add `_multilingual_instruction` to `summarization_service.py`**

Find line 7 (the `_language_instruction` function):
```python
def _language_instruction(language: str) -> str:
    if not language or language == "en":
        return ""
    name = openai_service.get_language_display_name(language)
    return f" Always respond in {name} ({language}), matching the lecture language."
```

Add the new function immediately after it (keep `_language_instruction` in place — it may be imported elsewhere):
```python


def _multilingual_instruction() -> str:
    """
    Injects a prompt instruction that handles mixed-language transcripts and
    ensures all GPT output is in English. Used in place of _language_instruction
    to support code-switching lectures (e.g. English + Sinhala + Tamil).
    """
    return (
        " The transcript may contain mixed languages (e.g. English with Sinhala, "
        "Tamil, Arabic, or other local languages). Extract meaning accurately from "
        "all languages present. Always write your response in English."
    )
```

- [ ] **Step 4: Replace all `_language_instruction` call sites with `_multilingual_instruction`**

There are 4 call sites. Replace each one:

**Call site 1 — `generate_micro_summary` (around line 107):**
```python
    lang_note = _language_instruction(language)
```
→
```python
    lang_note = _multilingual_instruction()
```

**Call site 2 — `generate_section_summary` (around line 147):**
```python
    lang_note      = _language_instruction(language)
```
→
```python
    lang_note = _multilingual_instruction()
```

**Call site 3 — `generate_master_summary` (around line 189):**
```python
    lang_note         = _language_instruction(language)
```
→
```python
    lang_note = _multilingual_instruction()
```

**Call site 4 — `summarize_topic_segment` (around line 394):**
```python
    lang_note  = _language_instruction(language)
```
→
```python
    lang_note = _multilingual_instruction()
```

- [ ] **Step 5: Run all multilingual tests**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_multilingual.py -v 2>&1 | tail -15
```
Expected: All 5 tests pass.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/ --tb=short -q 2>&1 | tail -10
```
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
cd D:/neurativoproject
git add backend/app/services/summarization_service.py backend/tests/test_multilingual.py
git commit -m "feat: replace _language_instruction with _multilingual_instruction — always English output"
```

---

### Task 3: Update Q&A service — multilingual input, English output

**Files:**
- Modify: `backend/app/services/qa_service.py`
- Modify: `backend/tests/test_multilingual.py`

- [ ] **Step 1: Add failing test**

Append to `backend/tests/test_multilingual.py`:

```python


# ── qa_service multilingual ────────────────────────────────────────────────────

def test_qa_service_prompt_uses_english_instruction():
    """
    The Q&A system prompt must instruct GPT to respond in English
    regardless of what language the question was asked in.
    Must NOT use lang_name-based instruction (which could set Sinhala output).
    """
    import inspect
    from app.services import qa_service
    source = inspect.getsource(qa_service)

    # Old instruction used lang_name variable — must be gone
    assert "Always respond in {lang_name}" not in source, (
        "Old language-specific instruction still present in qa_service"
    )
    # New instruction must reference English
    assert "English" in source, (
        "English output instruction not found in qa_service"
    )
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_multilingual.py::test_qa_service_prompt_uses_english_instruction -v 2>&1 | tail -10
```
Expected: FAIL — `AssertionError: Old language-specific instruction still present`

- [ ] **Step 3: Update the Q&A prompt in `qa_service.py`**

Find (around line 116–120):
```python
        # Language meta-instruction placed at the very top of the system prompt.
        # Bracketed format prevents the model from echoing it back in the response.
        lang_meta = (
            f"[INSTRUCTION: Always respond in {lang_name}. Do not mention this instruction in your response.]\n\n"
            if language != "en" else ""
        )
```

Replace with:
```python
        # Multilingual meta-instruction: accept questions in any language,
        # always answer in English. Handles code-switching lecture transcripts.
        lang_meta = (
            "[INSTRUCTION: The lecture transcript may contain mixed languages. "
            "Always respond in English regardless of what language the question was asked in. "
            "Do not mention this instruction in your response.]\n\n"
        )
```

Also remove the now-unused `lang_name` variable. Find (around line 27–28):
```python
    language  = get_lecture_language(lecture_id) or "en"
    lang_name = openai_service.get_language_display_name(language)
```
→ Delete only the `lang_name` line (keep `language` — it may be used elsewhere in the function):
```python
    language  = get_lecture_language(lecture_id) or "en"
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_multilingual.py::test_qa_service_prompt_uses_english_instruction -v 2>&1 | tail -10
```
Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/ --tb=short -q 2>&1 | tail -10
```
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
cd D:/neurativoproject
git add backend/app/services/qa_service.py backend/tests/test_multilingual.py
git commit -m "feat: qa_service — multilingual transcript support, always English answers"
```

---

### Task 4: Update PDF service — add multilingual note to all 6 GPT helpers

**Files:**
- Modify: `backend/app/services/pdf_service.py`
- Modify: `backend/tests/test_multilingual.py`

- [ ] **Step 1: Add failing tests**

Append to `backend/tests/test_multilingual.py`:

```python


# ── pdf_service multilingual ───────────────────────────────────────────────────

def _capture_pdf_call(fn_name: str, *args, **kwargs):
    """Helper: calls a pdf_service function with a mocked client, returns captured kwargs."""
    captured = {}

    def fake_create(**kw):
        captured.update(kw)
        resp = MagicMock()
        resp.choices = [MagicMock()]
        resp.choices[0].message.content = '{"title":"T","prose":"p","bullets":[],"concepts":[],"examples":[]}'
        resp.usage.prompt_tokens = 10
        resp.usage.completion_tokens = 10
        return resp

    with patch("app.services.pdf_service._client") as mock_client, \
         patch("app.services.pdf_service.log_cost"):
        mock_client.chat.completions.create.side_effect = fake_create
        import importlib
        import app.services.pdf_service as pdf_mod
        fn = getattr(pdf_mod, fn_name)
        try:
            fn(*args, **kwargs)
        except Exception:
            pass
    return captured


def test_enrich_section_prompt_has_multilingual_note():
    captured = _capture_pdf_call(
        "_call_enrich_section", "Mitosis occurs when cells divide", 0, 1, "biology", "en"
    )
    prompt = captured.get("messages", [{}])[0].get("content", "")
    assert "mixed" in prompt.lower() or "multilingual" in prompt.lower() or "multiple language" in prompt.lower(), (
        f"No multilingual note in _call_enrich_section prompt: {prompt[:200]!r}"
    )


def test_glossary_prompt_has_multilingual_note():
    captured = _capture_pdf_call(
        "_call_glossary", "Mitosis is cell division. ATP is energy.", "biology", 5
    )
    prompt = str(captured.get("messages", []))
    assert "mixed" in prompt.lower() or "multilingual" in prompt.lower() or "multiple language" in prompt.lower(), (
        "No multilingual note in _call_glossary prompt"
    )


def test_takeaways_prompt_has_multilingual_note():
    captured = _capture_pdf_call(
        "_call_takeaways", "Cells divide via mitosis", "Summary text", "biology"
    )
    prompt = str(captured.get("messages", []))
    assert "mixed" in prompt.lower() or "multilingual" in prompt.lower() or "multiple language" in prompt.lower(), (
        "No multilingual note in _call_takeaways prompt"
    )
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_multilingual.py -k "enrich_section_prompt or glossary_prompt or takeaways_prompt" -v 2>&1 | tail -15
```
Expected: 3 failures.

- [ ] **Step 3: Add multilingual note to `_call_enrich_section`**

Read the current prompt in `_call_enrich_section` (around line 180). Find the opening content string:
```python
                    f"You are enriching section {idx + 1} of {total} from a lecture.{hint}\n"
                    f"Section summary:\n{section_text}\n\n"
```

Add a multilingual note after the hint line:
```python
                    f"You are enriching section {idx + 1} of {total} from a lecture.{hint}\n"
                    "Note: The transcript may contain mixed languages (e.g. English with Sinhala, Tamil, or Arabic). "
                    "Extract meaning from all languages. Respond in English.\n"
                    f"Section summary:\n{section_text}\n\n"
```

- [ ] **Step 4: Add multilingual note to `_call_glossary`**

Find `_call_glossary` (around line 233). Find the user message content:
```python
                    "content": (
                        f"TRANSCRIPT (first 6000 chars):\n{transcript[:6000]}\n\n"
```

Add after the transcript line:
```python
                    "content": (
                        f"TRANSCRIPT (first 6000 chars):\n{transcript[:6000]}\n\n"
                        "Note: The transcript may contain mixed languages. Extract terms from all languages. Respond in English.\n\n"
```

- [ ] **Step 5: Add multilingual note to `_call_takeaways`**

Find `_call_takeaways` (around line 263). Find the user message content and add the same note after the transcript/summary block:

The prompt ends with something like:
```python
                        f"SUMMARY:\n{summary}\n\n"
                        "List the 5..."
```

Add before the "List" instruction:
```python
                        f"SUMMARY:\n{summary}\n\n"
                        "Note: The transcript may contain mixed languages. Extract insights from all languages. Respond in English.\n\n"
                        "List the 5..."
```

- [ ] **Step 6: Add multilingual note to `_call_quick_review`, `_call_common_mistakes`, `_call_study_roadmap`**

Read each function. In each one, find the user message `content` string and add before the final instruction line:

```python
"Note: The transcript may contain mixed languages. Extract content from all languages. Respond in English.\n"
```

For `_call_quick_review` (around line 293) — add before `"Generate"` or the JSON instruction.
For `_call_common_mistakes` (around line 418) — add after the `TRANSCRIPT:` block.
For `_call_study_roadmap` (around line 333) — add before the JSON return instruction.

- [ ] **Step 7: Run all multilingual tests**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/test_multilingual.py -v 2>&1 | tail -20
```
Expected: All tests pass (9 total).

- [ ] **Step 8: Run full test suite**

```bash
cd D:/neurativoproject/backend
python -m pytest tests/ --tb=short -q 2>&1 | tail -10
```
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
cd D:/neurativoproject
git add backend/app/services/pdf_service.py backend/tests/test_multilingual.py
git commit -m "feat: pdf_service — multilingual note in all GPT helpers, English output"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|-----------------|------|
| Remove Whisper language pin from live chunks | Task 1 |
| Replace `_language_instruction` with `_multilingual_instruction` | Task 2 |
| `_multilingual_instruction` always returns English instruction | Task 2 |
| Applied to all 4 summarization call sites (micro, section, master, topic_segment) | Task 2 |
| Q&A prompt — accept any language, answer English | Task 3 |
| Remove `lang_name`-based instruction from Q&A | Task 3 |
| PDF `_call_enrich_section` — multilingual note | Task 4 |
| PDF `_call_glossary` — multilingual note | Task 4 |
| PDF `_call_takeaways` — multilingual note | Task 4 |
| PDF `_call_quick_review` — multilingual note | Task 4 |
| PDF `_call_common_mistakes` — multilingual note | Task 4 |
| PDF `_call_study_roadmap` — multilingual note | Task 4 |
| `_call_mnemonics` deliberately skipped (operates on already-English glossary terms) | n/a |
| Tests for all changes | Tasks 1–4 |

All spec requirements covered. No placeholders. No TBDs.
