# LectureView UI/UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `LectureView.jsx` with time-range transcript rows, a live-chunk accent, Smart Explain floating button, richer summary cards, expanded stats, and a mobile drag handle — all within Neurativo's existing warm-minimal design token system.

**Architecture:** Single-file rewrite of `LectureView.jsx`. All changes are CSS-string additions/replacements and JSX updates. No new files, no backend changes, no new dependencies. The existing `index.css` keyframes (`fade-in`, `summary-card-enter`, `section-highlight-fade`) are reused directly.

**Tech Stack:** React 18, Vite, Tailwind (utility classes only where already used), CSS-in-JS via inline `<style>` tag, existing design tokens via CSS custom properties, Inter + Outfit + JetBrains Mono (already loaded).

---

## File Structure

**Only file changed:** `frontend/src/pages/LectureView.jsx`

Sections of that file (by line range as of reading):
- Lines 1–22: imports + `fmtTs` + design tokens (`C` object)
- Lines 24–147: `CSS` string (inline stylesheet)
- Lines 149–165: `ACCENTS_LIGHT` / `ACCENTS_DARK` palettes
- Lines 167–177: `useIsDark()` hook
- Lines 179–220: `parseSummary()`
- Lines 222–246: `SummaryCard` component
- Lines 248–382: `ShareModal` component
- Lines 384–774: `LectureView` default export (main component)
  - Lines 391–401: state declarations
  - Lines 444–453: derived values (`segments`, `wordCount`, `summarySections`)
  - Lines 464–509: navbar + transcript panel JSX
  - Lines 512–633: right panel tabs JSX
  - Lines 636–773: visuals tab + modals

---

## Task 1: Transcript Row Redesign — Time Ranges + Live Accent

**Files:**
- Modify: `frontend/src/pages/LectureView.jsx` (CSS string + transcript JSX)

This task replaces the single-timestamp + uniform-color segments with time-range rows, muted past chunks, and a left-border indigo accent on the last (most recent) chunk.

- [ ] **Step 1: Update `.lv-transcript-list` CSS**

Inside the `CSS` template string, find:
```
.lv-transcript-list { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }
```
Replace with:
```
.lv-transcript-list { flex: 1; overflow-y: auto; padding: 0 0; display: flex; flex-direction: column; }
```

- [ ] **Step 2: Replace `.lv-segment`, `.lv-seg-num`, `.lv-seg-text` CSS**

Find this block in the CSS string:
```
  .lv-segment { display: flex; gap: 10px; }
  .lv-seg-num { font-size: 10px; color: ${C.muted}; font-family: monospace; min-width: 40px; padding-top: 3px; text-align: right; flex-shrink: 0; }
  .lv-seg-text { font-size: 13px; color: ${C.text}; line-height: 1.65; }
```
Replace with:
```
  .lv-segment { display: flex; gap: 14px; padding: 10px 20px; border-bottom: 1px solid ${C.border}; transition: background 0.15s; }
  .lv-segment:last-child { border-bottom: none; }
  .lv-seg-num { font-size: 10px; color: ${C.muted}; font-family: 'JetBrains Mono', monospace; min-width: 42px; padding-top: 3px; flex-shrink: 0; line-height: 1.6; text-align: right; }
  .lv-seg-text { font-size: 14px; color: ${C.sec}; line-height: 1.75; flex: 1; }
  .lv-seg-live { border-left: 3px solid #6366f1; padding-left: 14px; }
  .lv-seg-live .lv-seg-text { color: ${C.text}; font-weight: 500; }
  @keyframes lv-chunk-in { from { opacity: 0; } to { opacity: 1; } }
  .lv-chunk-enter { animation: lv-chunk-in 0.25s ease; }
```

- [ ] **Step 3: Verify CSS compiles — open the app**

Run:
```bash
cd /d/neurativoproject/frontend && npm run dev
```
Navigate to any lecture. Expected: no JS errors in console.

- [ ] **Step 4: Update transcript JSX to use time ranges and live accent**

Find this JSX block (around line 500–508):
```jsx
<div className="lv-transcript-list">
    {segments.map((text, i) => (
        <div key={i} className="lv-segment">
            <span className="lv-seg-num">{fmtTs(i * 12)}</span>
            <span className="lv-seg-text">{text}</span>
        </div>
    ))}
</div>
```
Replace with:
```jsx
<div className="lv-transcript-list">
    {segments.map((text, i) => {
        const isLast = i === segments.length - 1;
        return (
            <div key={i} className={`lv-segment lv-chunk-enter${isLast ? ' lv-seg-live' : ''}`}>
                <span className="lv-seg-num">
                    {fmtTs(i * 12)}<br />
                    <span style={{ opacity: 0.6 }}>–{fmtTs((i + 1) * 12)}</span>
                </span>
                <span className="lv-seg-text">{text}</span>
            </div>
        );
    })}
</div>
```

- [ ] **Step 5: Verify in browser**

Navigate to a lecture with at least 3 chunks. Expected:
- Each row shows two-line timestamp: `0:00` on top, `–0:12` below in lighter gray
- All rows except the last are in muted gray text
- Last row has a left indigo border, darker bold-ish text
- Rows separated by a hairline border

- [ ] **Step 6: Commit**

```bash
cd /d/neurativoproject && git add frontend/src/pages/LectureView.jsx && git commit -m "feat: transcript rows — time ranges, muted past chunks, live accent border"
```

---

## Task 2: Smart Explain Floating Button + Side Panel

**Files:**
- Modify: `frontend/src/pages/LectureView.jsx` (state, CSS, JSX)

Adds text-selection detection on the transcript panel. When the user selects ≥ 6 characters, a `✦ Explain` button floats above the selection. Clicking it calls the existing backend explain API and shows a slide-in panel with explanation, analogy, and breakdown.

The API call: `POST /api/v1/explain/{lectureId}` with `{ text: selectedText, mode: 'simple' }`
Response shape: `{ explanation: string, analogy?: string, breakdown?: string }`

- [ ] **Step 1: Add CSS for explain button + panel**

Inside the `CSS` string, after the last `/* Mobile */` media query, append:

```
  /* Smart Explain */
  .lv-explain-btn { position: fixed; z-index: 50; padding: 5px 10px; background: ${C.dark}; color: ${C.darkFg}; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.18); font-family: inherit; animation: lv-chunk-in 0.15s ease; transform: translate(-50%, -100%); white-space: nowrap; }
  .lv-explain-btn:hover { opacity: 0.85; }
  .lv-explain-overlay { position: fixed; inset: 0; z-index: 60; display: flex; justify-content: flex-end; }
  .lv-explain-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.25); backdrop-filter: blur(2px); }
  .lv-explain-panel { position: relative; width: 100%; max-width: 480px; background: ${C.card}; height: 100%; box-shadow: -4px 0 32px rgba(0,0,0,0.12); display: flex; flex-direction: column; border-left: 1px solid ${C.border}; animation: slide-in-right 0.28s ease; }
  .lv-explain-header { height: 52px; padding: 0 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid ${C.border}; flex-shrink: 0; }
  .lv-explain-title { font-size: 14px; font-weight: 700; color: ${C.text}; font-family: 'Outfit', sans-serif; display: flex; align-items: center; gap: 8px; }
  .lv-explain-dot { width: 8px; height: 8px; border-radius: 50%; background: ${C.dark}; }
  .lv-explain-close { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; color: ${C.muted}; border-radius: 6px; transition: color 0.12s, background 0.12s; }
  .lv-explain-close:hover { color: ${C.text}; background: ${C.border}; }
  .lv-explain-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 18px; }
  .lv-explain-section-label { font-size: 10px; font-weight: 700; color: ${C.muted}; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px; }
  .lv-explain-text { font-size: 14px; color: ${C.text}; line-height: 1.75; }
  .lv-explain-analogy { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px; }
  .dark .lv-explain-analogy { background: #291e00; border-color: #4a3800; }
  .lv-explain-analogy-text { font-size: 13px; color: ${C.sec}; line-height: 1.7; font-style: italic; }
  .lv-explain-step { display: flex; gap: 12px; padding: 10px 12px; background: ${C.bg}; border: 1px solid ${C.border}; border-radius: 8px; }
  .lv-explain-step-num { font-size: 10px; font-weight: 700; color: ${C.muted}; font-family: 'JetBrains Mono', monospace; padding-top: 2px; flex-shrink: 0; min-width: 20px; }
  .lv-explain-step-text { font-size: 13px; color: ${C.sec}; line-height: 1.65; }
  .lv-explain-spinner { width: 32px; height: 32px; border: 3px solid ${C.border}; border-top-color: ${C.dark}; border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slide-in-right { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: translateX(0); } }
```

Note: `slide-in-right` already exists in `index.css` as `.animate-slide-in-right` but we add it here as a local named animation for the panel, which is CSS-in-JS rather than Tailwind.

- [ ] **Step 2: Add state and handler to `LectureView` component**

After the existing state declarations (around line 401), add:

```jsx
const [selInfo, setSelInfo]         = useState({ text: '', x: 0, y: 0, show: false });
const [explainPanel, setExplainPanel] = useState({ show: false, loading: false, data: null });
const transcriptRef = useRef(null);
```

After `const handleAsk = async () => { ... }` (around line 440), add:

```jsx
const handleTextSelection = () => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (text.length >= 6) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        setSelInfo({ text, x: rect.left + rect.width / 2, y: rect.top - 10, show: true });
    } else {
        setSelInfo(s => ({ ...s, show: false }));
    }
};

const handleExplain = async () => {
    if (!selInfo.text) return;
    setSelInfo(s => ({ ...s, show: false }));
    setExplainPanel({ show: true, loading: true, data: null });
    try {
        const res = await api.post(`/api/v1/explain/${id}`, { text: selInfo.text, mode: 'simple' });
        setExplainPanel({ show: true, loading: false, data: res.data });
    } catch {
        setExplainPanel({ show: true, loading: false, data: { explanation: 'Could not generate explanation. Please try again.' } });
    }
};
```

- [ ] **Step 3: Wire `onMouseUp` to transcript panel**

Find the transcript panel div (the `lv-left` div) and add `ref` + `onMouseUp`:

Find:
```jsx
<div className="lv-left">
```
Replace with:
```jsx
<div className="lv-left" ref={transcriptRef} onMouseUp={handleTextSelection}>
```

- [ ] **Step 4: Add floating button + explain panel JSX**

Just before the final closing `</>` of the return (around line 772, before `{exportOpen && ...}`), add:

```jsx
{selInfo.show && (
    <button
        className="lv-explain-btn"
        style={{ left: selInfo.x, top: selInfo.y }}
        onMouseDown={e => e.preventDefault()}
        onClick={handleExplain}
    >
        ✦ Explain
    </button>
)}

{explainPanel.show && (
    <div className="lv-explain-overlay">
        <div className="lv-explain-backdrop" onClick={() => setExplainPanel(p => ({ ...p, show: false }))} />
        <div className="lv-explain-panel">
            <div className="lv-explain-header">
                <div className="lv-explain-title">
                    <div className="lv-explain-dot" />
                    Concept Breakdown
                </div>
                <button className="lv-explain-close" onClick={() => setExplainPanel(p => ({ ...p, show: false }))}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div className="lv-explain-body">
                {explainPanel.loading ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                        <div className="lv-explain-spinner" />
                        <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Analyzing concept…</p>
                    </div>
                ) : explainPanel.data ? (
                    <>
                        <div>
                            <div className="lv-explain-section-label">Explanation</div>
                            <p className="lv-explain-text">{explainPanel.data.explanation}</p>
                        </div>
                        {explainPanel.data.analogy && (
                            <div className="lv-explain-analogy">
                                <div className="lv-explain-section-label" style={{ color: '#92400e' }}>Analogy</div>
                                <p className="lv-explain-analogy-text">{explainPanel.data.analogy}</p>
                            </div>
                        )}
                        {explainPanel.data.breakdown && (
                            <div>
                                <div className="lv-explain-section-label">Step-by-Step</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {explainPanel.data.breakdown.split('\n').filter(l => l.trim()).map((step, i) => (
                                        <div key={i} className="lv-explain-step">
                                            <span className="lv-explain-step-num">{String(i + 1).padStart(2, '0')}</span>
                                            <p className="lv-explain-step-text">{step.replace(/^\d+\.\s*/, '')}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                ) : null}
            </div>
        </div>
    </div>
)}
```

- [ ] **Step 5: Verify in browser**

Navigate to a lecture with transcript text. Select 6+ characters of transcript text.
Expected:
- `✦ Explain` dark button appears above the selection
- Clicking it: panel slides in from right, shows spinner, then explanation + analogy + steps
- Clicking backdrop or X closes the panel
- Explain button disappears after click

- [ ] **Step 6: Commit**

```bash
cd /d/neurativoproject && git add frontend/src/pages/LectureView.jsx && git commit -m "feat: Smart Explain in LectureView — text selection → floating button → side panel"
```

---

## Task 3: SummaryCard — Section Count Chip + Animation

**Files:**
- Modify: `frontend/src/pages/LectureView.jsx` (SummaryCard component + call site)

Adds a `N/M` section counter chip to each card header and attaches the existing `summary-card-enter` animation from `index.css`.

- [ ] **Step 1: Update `SummaryCard` signature and header**

Find the `SummaryCard` function (around line 222):
```jsx
function SummaryCard({ section, accent }) {
    const a = accent || ACCENTS_LIGHT[0];
    return (
        <div className="lv-sum-card" style={{ borderLeft: `3px solid ${a.border}` }}>
            <div className="lv-sum-title" style={{ color: a.title }}>{section.title}</div>
```
Replace with:
```jsx
function SummaryCard({ section, accent, index, total }) {
    const a = accent || ACCENTS_LIGHT[0];
    return (
        <div className="lv-sum-card summary-card-enter" style={{ borderLeft: `3px solid ${a.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div className="lv-sum-title" style={{ color: a.title, margin: 0 }}>{section.title}</div>
                {total > 1 && (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--color-muted)', flexShrink: 0, paddingLeft: 8 }}>
                        {index + 1}/{total}
                    </span>
                )}
            </div>
```

- [ ] **Step 2: Update call site to pass `index` and `total`**

Find (around line 531):
```jsx
: summarySections.map((s, i) => { const palette = isDark ? ACCENTS_DARK : ACCENTS_LIGHT; return <SummaryCard key={i} section={s} accent={palette[i % palette.length]} />; })
```
Replace with:
```jsx
: summarySections.map((s, i) => {
    const palette = isDark ? ACCENTS_DARK : ACCENTS_LIGHT;
    return <SummaryCard key={i} section={s} accent={palette[i % palette.length]} index={i} total={summarySections.length} />;
})
```

- [ ] **Step 3: Verify in browser**

Open a lecture with ≥ 2 sections. Expected:
- Each section card header shows the section title on the left and `1/3`, `2/3`, `3/3` chips in JetBrains Mono on the right
- Cards animate in (fade + slide up) — `summary-card-enter` is already defined in `index.css`
- Single-section lectures show no chip (the `total > 1` guard)

- [ ] **Step 4: Commit**

```bash
cd /d/neurativoproject && git add frontend/src/pages/LectureView.jsx && git commit -m "feat: summary cards — section count chip and entry animation"
```

---

## Task 4: Stats Tab — Sections + Topics Cards

**Files:**
- Modify: `frontend/src/pages/LectureView.jsx` (derived values + stats JSX)

Adds two new stat cards (Sections and Topics) to the grid using data already available client-side. No backend change.

- [ ] **Step 1: Compute `topicCount` in derived values block**

Find (around line 448–453):
```jsx
const segments = lecture?.transcript
    ? lecture.transcript.split('\n').filter(s => s.trim())
    : [];

const wordCount = segments.reduce((n, s) => n + s.split(/\s+/).filter(Boolean).length, 0);
const summaryText = lecture?.master_summary || lecture?.summary || '';
const summarySections = parseSummary(summaryText);
```
After `const summarySections = parseSummary(summaryText);`, add:
```jsx
const topicCount = summarySections.reduce((n, s) => n + s.concepts.length, 0);
```

- [ ] **Step 2: Add Sections and Topics cards to the stats grid**

Find the last two conditional cards in the stats section (around line 606):
```jsx
{lecture?.share_views > 0 && (
    <div className="lv-stat-card">
        <div className="lv-stat-label">Share views</div>
        <div className="lv-stat-val">{lecture.share_views}</div>
    </div>
)}
{visualFrames && visualFrames.length > 0 && (() => {
```

Just before `{lecture?.share_views > 0 && (`, insert the two new permanent cards:
```jsx
<div className="lv-stat-card">
    <div className="lv-stat-label">Sections</div>
    <div className="lv-stat-val">{summarySections.length || '—'}</div>
    <div className="lv-stat-sub">summarized</div>
</div>
<div className="lv-stat-card">
    <div className="lv-stat-label">Topics</div>
    <div className="lv-stat-val">{topicCount || '—'}</div>
    <div className="lv-stat-sub">key concepts</div>
</div>
```

- [ ] **Step 3: Verify in browser**

Open the Stats tab on a lecture with summaries. Expected:
- Grid now includes a "Sections" card showing the section count (e.g. `3`)
- Grid includes a "Topics" card showing the total concept count (e.g. `18`)
- Both show `—` when no summaries exist yet

- [ ] **Step 4: Commit**

```bash
cd /d/neurativoproject && git add frontend/src/pages/LectureView.jsx && git commit -m "feat: stats tab — add Sections and Topics cards derived client-side"
```

---

## Task 5: Q&A Source Citation

**Files:**
- Modify: `frontend/src/pages/LectureView.jsx` (Q&A messages JSX)

Adds a "From your lecture transcript" citation line below each AI answer. No CSS changes needed — uses inline style consistent with the existing `.lv-qa-msg` styling.

- [ ] **Step 1: Add citation below assistant messages**

Find (around line 546–553):
```jsx
<div className="lv-qa-messages">
    {qaHistory.map((m, i) => (
        <div key={i} className={`lv-qa-msg ${m.role === 'user' ? 'lv-qa-user' : 'lv-qa-assistant'}`}>
            {m.role === 'assistant'
                ? <QAAnswer text={m.text} />
                : m.text
            }
        </div>
    ))}
```
Replace with:
```jsx
<div className="lv-qa-messages">
    {qaHistory.map((m, i) => (
        <div key={i}>
            <div className={`lv-qa-msg ${m.role === 'user' ? 'lv-qa-user' : 'lv-qa-assistant'}`}>
                {m.role === 'assistant'
                    ? <QAAnswer text={m.text} />
                    : m.text
                }
            </div>
            {m.role === 'assistant' && (
                <p style={{ fontSize: 11, color: 'var(--color-muted)', fontStyle: 'italic', marginTop: 4, paddingLeft: 2 }}>
                    From your lecture transcript
                </p>
            )}
        </div>
    ))}
```

- [ ] **Step 2: Verify in browser**

Ask a question in the Ask tab. Expected:
- User question bubble on the right, unchanged
- AI answer card on the left, unchanged
- Below each AI answer: small italic muted text "From your lecture transcript"

- [ ] **Step 3: Commit**

```bash
cd /d/neurativoproject && git add frontend/src/pages/LectureView.jsx && git commit -m "feat: Q&A — add source citation below each AI answer"
```

---

## Task 6: Mobile Panel Drag Handle

**Files:**
- Modify: `frontend/src/pages/LectureView.jsx` (state, CSS, refs, JSX)

Adds a drag handle strip between the transcript and AI panels on mobile (< 768px). Users can drag to resize the split between 20% and 80% of the body height. On desktop (≥ 768px) the handle is hidden.

- [ ] **Step 1: Add drag handle CSS**

Inside the `CSS` string, append at the end (before the closing backtick):
```
  /* Drag handle (mobile only) */
  .lv-drag-handle { display: none; height: 24px; align-items: center; justify-content: center; background: ${C.bg}; border-top: 1px solid ${C.border}; border-bottom: 1px solid ${C.border}; cursor: ns-resize; flex-shrink: 0; touch-action: none; user-select: none; }
  .lv-drag-pill { width: 32px; height: 4px; background: ${C.borderHov}; border-radius: 2px; }
  @media (max-width: 680px) {
    .lv-drag-handle { display: flex; }
    .lv-left { border-bottom: none !important; }
  }
```

- [ ] **Step 2: Add state, refs, and `isMobile` sync**

In the component state block (after line 401), add:
```jsx
const [mobileSplit, setMobileSplit] = useState(55);
const [isMobile, setIsMobile]       = useState(() => window.innerWidth < 768);
const bodyRef = useRef(null);
```

Then add a `useEffect` (after the existing `useEffect` blocks, around line 425):
```jsx
useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
}, []);
```

- [ ] **Step 3: Add drag handler function**

After `handleExplain` (from Task 2), add:
```jsx
const onHandleDrag = (e) => {
    e.preventDefault();
    const bodyRect = bodyRef.current?.getBoundingClientRect();
    if (!bodyRect) return;
    const onMove = (ev) => {
        const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
        const pct = ((y - bodyRect.top) / bodyRect.height) * 100;
        setMobileSplit(Math.min(80, Math.max(20, Math.round(pct))));
    };
    const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
};
```

- [ ] **Step 4: Attach `bodyRef` to `.lv-body` and apply dynamic height on `.lv-left`**

Find (this string exists after Task 2 is complete):
```jsx
<div className="lv-body">
    {/* Left: transcript */}
    <div className="lv-left" ref={transcriptRef} onMouseUp={handleTextSelection}>
```
Replace with:
```jsx
<div className="lv-body" ref={bodyRef}>
    {/* Left: transcript */}
    <div className="lv-left" ref={transcriptRef} onMouseUp={handleTextSelection}
        style={isMobile ? { height: `${mobileSplit}vh` } : {}}>
```

**Important:** Task 2 must be completed before this step. The find string includes `ref={transcriptRef} onMouseUp={handleTextSelection}` which Task 2 adds.

- [ ] **Step 5: Insert drag handle between panels**

Find:
```jsx
    </div>

                    {/* Right: tabbed panel */}
                    <div className="lv-right">
```
Replace with:
```jsx
    </div>

                    {/* Drag handle — mobile only */}
                    <div
                        className="lv-drag-handle"
                        onMouseDown={onHandleDrag}
                        onTouchStart={onHandleDrag}
                    >
                        <div className="lv-drag-pill" />
                    </div>

                    {/* Right: tabbed panel */}
                    <div className="lv-right">
```

- [ ] **Step 6: Remove the conflicting fixed `height: 42vh` from mobile CSS**

Inside the `CSS` string, find the mobile media query:
```
  @media (max-width: 680px) {
    .lv-body { flex-direction: column; }
    .lv-left { width: 100%; height: 42vh; border-right: none; border-bottom: 1px solid ${C.border}; }
    .lv-right { flex: 1; min-height: 0; }
  }
```
Replace with:
```
  @media (max-width: 680px) {
    .lv-body { flex-direction: column; }
    .lv-left { width: 100%; border-right: none; overflow: hidden; flex-shrink: 0; }
    .lv-right { flex: 1; min-height: 0; overflow: hidden; }
  }
```

- [ ] **Step 7: Verify on mobile / narrow window**

Resize browser to < 680px wide. Expected:
- Panels stack vertically, transcript on top (~55vh by default)
- A drag handle strip visible between panels with a pill indicator
- Dragging the handle adjusts the split (transcript grows/shrinks between 20vh and 80vh)
- Desktop (≥ 680px): handle invisible, layout unchanged

- [ ] **Step 8: Commit**

```bash
cd /d/neurativoproject && git add frontend/src/pages/LectureView.jsx && git commit -m "feat: mobile drag handle — resizable transcript/AI panel split"
```

---

## Task 7: Dark Mode CSS for New Elements

**Files:**
- Modify: `frontend/src/index.css` (dark mode overrides)

All new CSS classes use `var(--color-*)` tokens which auto-adapt to dark mode — but a few elements use hardcoded light-mode colors (the analogy box, the `#6366f1` live accent color, and the `✦ Explain` button). This task adds explicit dark overrides.

- [ ] **Step 1: Verify what already works in dark mode**

Toggle dark mode (click the moon icon in the app nav). Expected automatic passes:
- `lv-explain-btn`: uses `var(--color-dark)` and `var(--color-dark-fg)` → auto-correct ✓
- `lv-explain-panel`: uses `var(--color-card)`, `var(--color-border)`, `var(--color-text)` → auto-correct ✓
- `lv-drag-handle`: uses `var(--color-bg)`, `var(--color-border)`, `var(--color-border-hov)` → auto-correct ✓
- `lv-seg-live` border `#6366f1` → stays indigo in dark (acceptable, but we'll make it lighter)

Manually verify: inspect the live chunk border and the analogy box in dark mode.

- [ ] **Step 2: Add dark mode overrides to `index.css`**

Open `frontend/src/index.css`. At the bottom of the file (after line 385), append:

```css
/* ── LectureView redesign dark overrides ── */
.dark .lv-seg-live { border-left-color: #818cf8; }
.dark .lv-explain-analogy { background: #291e00 !important; border-color: #4a3800 !important; }
.dark .lv-explain-analogy .lv-explain-section-label { color: #d97706 !important; }
.dark .lv-explain-analogy-text { color: var(--color-sec); }
.dark .lv-explain-step { background: var(--color-card); }
```

- [ ] **Step 3: Verify in dark mode**

Toggle dark mode. Expected:
- Live chunk border is lighter indigo (#818cf8) — clearly visible against dark background
- Analogy box is a dark amber rather than yellow-on-dark
- Explain steps have the card background (dark gray) rather than the light `--color-bg`
- All other new elements look correct

- [ ] **Step 4: Commit**

```bash
cd /d/neurativoproject && git add frontend/src/pages/LectureView.jsx frontend/src/index.css && git commit -m "fix: dark mode overrides for live chunk accent and explain panel analogy box"
```

---

## Self-Review Checklist

After all tasks complete, verify each spec requirement has a task:

| Spec Requirement | Task |
|---|---|
| Transcript time ranges (`0:00–0:12`) | Task 1 |
| Latest chunk left-border accent, past chunks muted | Task 1 |
| Chunk entry fade-in animation | Task 1 |
| Smart Explain floating button on text selection | Task 2 |
| Smart Explain side panel with explanation/analogy/steps | Task 2 |
| Section cards with N/M count chip | Task 3 |
| Section card entry animation (`summary-card-enter`) | Task 3 |
| Stats: Sections + Topics cards | Task 4 |
| Q&A source citation below answers | Task 5 |
| Mobile drag handle for panel resize | Task 6 |
| Dark mode for all new elements | Task 7 |
| Language badge in panel header | Already exists — preserved in Task 1 |
| Word count in panel header | Already exists — preserved in Task 1 |
| Sub-header (language + word count strip) | Spec simplified — existing panel header already shows these; no sub-header needed |
| Master summary "Lecture Overview" collapsible | Omitted — master_summary IS the section cards; no separate field to show |
