# Multilingual Code-Switching Support — Design Spec

**Date:** 2026-04-22
**Goal:** Make Neurativo work seamlessly for students whose lecturers speak in mixed languages (e.g. English + Sinhala + Tamil, or English + Arabic, etc.) — accurate transcription, English output for all summaries, Q&A, and PDF.

---

## Problem

1. **Language pinning breaks code-switching.** After the first chunk, Whisper is pinned to the detected language (e.g. `si` = Sinhala). When the lecturer switches to English mid-sentence, Whisper forces the audio into Sinhala, producing garbled or hallucinated text.
2. **Summarization prompts assume mono-lingual input.** `_language_instruction(language)` tells GPT "respond in Sinhala" when the lecture language is Sinhala — even when the transcript is 60% English.
3. **Q&A and PDF GPT calls have no multilingual awareness.** Mixed-language transcripts produce lower-quality analysis because prompts don't tell GPT the content may be multilingual.

---

## Architecture

No new files. No schema changes. No API endpoint changes. No frontend changes.

| File | Change |
|------|--------|
| `backend/app/api/endpoints.py` | Remove `language=stored_language` pin from live chunk Whisper call |
| `backend/app/services/summarization_service.py` | Replace `_language_instruction` with `_multilingual_instruction` — always English output |
| `backend/app/services/qa_service.py` | Add multilingual input note + English output instruction to RAG answer prompt |
| `backend/app/services/pdf_service.py` | Add multilingual input note to all 6 GPT helper prompts |

---

## Change Details

### 1. Remove language pinning — `endpoints.py`

**Current (broken for code-switching):**
```python
chunk_text, detected_language = await transcribe_audio(
    ...,
    language=stored_language or None,   # ← pins Whisper after first chunk
)
```

**New:**
```python
chunk_text, detected_language = await transcribe_audio(
    ...,
    language=None,   # never pin — let Whisper handle each chunk independently
)
```

Language detection still runs per chunk. `detected_language` is still stored on the lecture record (for the UI badge). Only the *input pin* is removed. The `no_speech_prob` filter already handles silence hallucinations so unpinning is safe.

---

### 2. Replace `_language_instruction` — `summarization_service.py`

**Current:**
```python
def _language_instruction(language: str) -> str:
    if not language or language == "en":
        return ""
    name = openai_service.get_language_display_name(language)
    return f" Always respond in {name} ({language}), matching the lecture language."
```

**New — rename to `_multilingual_instruction`, always return English instruction:**
```python
def _multilingual_instruction() -> str:
    return (
        " The transcript may contain mixed languages (e.g. English with Sinhala, "
        "Tamil, Arabic, or other local languages). Extract meaning accurately from "
        "all languages present. Always write your response in English."
    )
```

All 5 call sites that used `lang_note = _language_instruction(language)` replace with `lang_note = _multilingual_instruction()`. The `language` parameter is kept on all public functions for API compatibility but is no longer used in prompt construction.

Affected functions: `generate_micro_summary`, `generate_section_summary`, `generate_master_summary`, `summarize_topic_segment`, and any other function using `_language_instruction`.

---

### 3. Q&A multilingual instruction — `qa_service.py`

In the RAG answer prompt, add after the context block:

```
The lecture transcript may contain mixed languages. Extract meaning from all languages.
Answer in English regardless of what language the question was asked in.
```

Students can ask questions in Sinhala, Tamil, or English — answers always come back in English.

---

### 4. PDF GPT calls — `pdf_service.py`

Add a short multilingual note to the user message in each of the 6 GPT helpers:

```
Note: The transcript may contain mixed languages. Extract meaning from all languages present. Respond in English.
```

Affected calls: `_call_enrich_section`, `_call_glossary`, `_call_takeaways`, `_call_quick_review`, `_call_common_mistakes`, `_call_study_roadmap`. (Skip `_call_mnemonics` — it operates on already-English glossary terms.)

---

## What This Fixes

| Scenario | Before | After |
|----------|--------|-------|
| Pure English lecture | Works | Works (unchanged) |
| Pure Sinhala lecture | Whisper pinned to `si`, works for mono-lingual | Works (no pin, Whisper still detects `si`) |
| Mixed English+Sinhala | Pinned to first language, second language garbled | Each chunk detected independently, both transcribed correctly |
| Mixed English+Tamil+Sinhala | Badly broken | Each chunk handled by Whisper's multilingual model |
| Summaries of mixed transcript | GPT told to respond in Sinhala, English content lost | GPT told to extract from all languages, responds in English |
| Q&A on mixed transcript | Confusion on non-English transcript sections | Always English answer, question accepted in any language |
| PDF from mixed transcript | GPT helpers confused by mixed input | All helpers aware of multilingual input |

---

## Anti-Hallucination / Safety

- **Unpinning Whisper is safe** because `no_speech_prob` filtering (already implemented) handles the silence-hallucination problem that originally motivated pinning.
- **No new GPT calls** — all changes are prompt-only modifications to existing calls. Cost is unchanged.
- **Language badge in UI** — still works. `detected_language` is still returned and stored per chunk. The last detected language is what shows in the UI.

---

## Non-Goals

- No Sinhala/Tamil/Arabic output option (English-only output for now).
- No speaker diarization.
- No language detection UI or settings page.
- No changes to the `language` column in the database.
- No changes to how the full-audio import endpoint handles language.
