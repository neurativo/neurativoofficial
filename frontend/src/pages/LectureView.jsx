import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import ExportModal from '../components/ExportModal';
import QAAnswer from '../components/QAAnswer';

function fmtTs(seconds) {
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
    bg: 'var(--color-bg)', text: 'var(--color-text)', sec: 'var(--color-sec)', muted: 'var(--color-muted)',
    border: 'var(--color-border)', borderHov: 'var(--color-border-hov)', card: 'var(--color-card)', dark: 'var(--color-dark)',
    darkFg: 'var(--color-dark-fg)',
};

const CSS = `
  .lv * { box-sizing: border-box; }
  .lv { font-family: 'Inter', sans-serif; background: ${C.bg}; color: ${C.text}; height: 100vh; display: flex; flex-direction: column; -webkit-font-smoothing: antialiased; }

  /* Navbar */
  .lv-nav { height: 52px; background: ${C.card}; border-bottom: 1px solid ${C.border}; display: flex; align-items: center; padding: 0 20px; gap: 12px; flex-shrink: 0; }
  .lv-back { display: flex; align-items: center; gap: 5px; font-size: 13px; color: ${C.sec}; text-decoration: none; transition: color 0.12s; white-space: nowrap; }
  .lv-back:hover { color: ${C.text}; }
  .lv-nav-title { flex: 1; font-size: 14px; font-weight: 500; color: ${C.text}; letter-spacing: -0.2px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 12px; }
  .lv-nav-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .lv-btn-ghost { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; font-size: 12px; font-weight: 500; color: ${C.text}; border: 1px solid ${C.border}; border-radius: 8px; background: ${C.card}; cursor: pointer; transition: border-color 0.15s; font-family: inherit; white-space: nowrap; }
  .lv-btn-ghost:hover { border-color: ${C.borderHov}; }

  /* Two-panel body */
  .lv-body { display: flex; flex: 1; overflow: hidden; }

  /* Left panel */
  .lv-left { width: 50%; border-right: 1px solid ${C.border}; display: flex; flex-direction: column; overflow: hidden; }
  .lv-panel-header { padding: 16px 20px 12px; border-bottom: 1px solid ${C.border}; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .lv-panel-label { font-size: 11px; font-weight: 600; color: ${C.muted}; letter-spacing: 0.5px; text-transform: uppercase; flex: 1; }
  .lv-panel-meta { font-size: 11px; color: ${C.muted}; }
  .lv-transcript-list { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }
  .lv-segment { display: flex; gap: 10px; }
  .lv-seg-num { font-size: 10px; color: ${C.muted}; font-family: monospace; min-width: 40px; padding-top: 3px; text-align: right; flex-shrink: 0; }
  .lv-seg-text { font-size: 13px; color: ${C.text}; line-height: 1.65; }
  .lv-empty-panel { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 13px; color: ${C.muted}; }

  /* Right panel */
  .lv-right { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .lv-tabs { display: flex; border-bottom: 1px solid ${C.border}; padding: 0 20px; flex-shrink: 0; }
  .lv-tab { padding: 14px 14px 12px; font-size: 13px; font-weight: 500; color: ${C.muted}; background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color 0.12s, border-color 0.12s; font-family: inherit; }
  .lv-tab.active { color: ${C.text}; border-bottom-color: ${C.text}; }
  .lv-tab-body { flex: 1; overflow-y: auto; padding: 20px; }

  /* Summary cards */
  .lv-sum-card { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 12px; padding: 16px; margin-bottom: 10px; }
  .lv-sum-title { font-size: 13px; font-weight: 600; color: ${C.text}; letter-spacing: -0.2px; margin-bottom: 8px; }
  .lv-sum-lead { font-size: 13px; color: ${C.sec}; line-height: 1.65; margin-bottom: 8px; }
  .lv-sum-prose { font-size: 12px; color: ${C.muted}; line-height: 1.65; margin-bottom: 8px; }
  .lv-sum-highlights { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
  .lv-sum-highlight { font-size: 12px; color: ${C.text}; background: #f8f6f3; border-left: 2px solid ${C.borderHov}; padding: 6px 10px; border-radius: 0 6px 6px 0; line-height: 1.5; }
  .lv-sum-concepts { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
  .lv-sum-concept { font-size: 11px; color: ${C.sec}; background: ${C.bg}; border: 1px solid ${C.border}; border-radius: 5px; padding: 2px 7px; }
  .lv-sum-examples { display: flex; flex-direction: column; gap: 3px; }
  .lv-sum-example { font-size: 12px; color: ${C.sec}; padding-left: 12px; position: relative; line-height: 1.5; }
  .lv-sum-example::before { content: '→'; position: absolute; left: 0; color: ${C.muted}; }

  /* QA */
  .lv-qa-messages { display: flex; flex-direction: column; gap: 12px; padding-bottom: 16px; }
  .lv-qa-msg { padding: 10px 14px; border-radius: 10px; font-size: 13px; line-height: 1.6; max-width: 88%; }
  .lv-qa-user { background: ${C.dark}; color: #fafaf9; align-self: flex-end; }
  .lv-qa-assistant { background: ${C.card}; border: 1px solid ${C.border}; color: ${C.text}; align-self: flex-start; }
  .lv-qa-bar { display: flex; gap: 8px; padding: 16px 20px; border-top: 1px solid ${C.border}; flex-shrink: 0; }
  .lv-qa-input { flex: 1; padding: 9px 12px; border: 1px solid ${C.border}; border-radius: 9px; font-size: 13px; color: ${C.text}; background: ${C.card}; outline: none; transition: border-color 0.15s; font-family: inherit; }
  .lv-qa-input:focus { border-color: #c0bdb8; }
  .lv-qa-input::placeholder { color: ${C.muted}; }
  .lv-qa-send { padding: 9px 16px; background: ${C.dark}; color: #fafaf9; border: none; border-radius: 9px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; transition: opacity 0.15s; white-space: nowrap; }
  .lv-qa-send:hover { opacity: 0.82; }
  .lv-qa-send:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Stats */
  .lv-stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .lv-stat-card { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 10px; padding: 16px; }
  .lv-stat-label { font-size: 11px; color: ${C.muted}; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 6px; }
  .lv-stat-val { font-size: 20px; font-weight: 600; color: ${C.text}; letter-spacing: -0.5px; }
  .lv-stat-sub { font-size: 12px; color: ${C.muted}; margin-top: 2px; }

  /* Pills */
  .lv-pill { font-size: 11px; padding: 2px 8px; border-radius: 5px; white-space: nowrap; }
  .lv-pill-topic { background: #f3f0ff; color: #7c3aed; border: 1px solid #e9d5ff; }
  .lv-pill-lang { background: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; }

  /* Loading */
  .lv-loading { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 13px; color: ${C.muted}; }

  /* Mobile */
  @media (max-width: 680px) {
    .lv-body { flex-direction: column; }
    .lv-left { width: 100%; height: 42vh; border-right: none; border-bottom: 1px solid ${C.border}; }
    .lv-right { flex: 1; min-height: 0; }
  }
  @media (max-width: 480px) {
    .lv-nav { padding: 0 12px; gap: 6px; }
    .lv-nav-title { font-size: 13px; padding: 0 6px; }
    .lv-btn-text { display: none; }
    .lv-btn-ghost { padding: 6px 9px; min-width: 32px; justify-content: center; }
    .lv-panel-header { padding: 12px 14px 10px; }
    .lv-transcript-list { padding: 12px 14px; }
    .lv-tabs { padding: 0 12px; }
    .lv-tab { padding: 12px 10px 10px; font-size: 12px; }
    .lv-tab-body { padding: 14px; }
    .lv-qa-bar { padding: 10px 12px; gap: 6px; }
    .lv-qa-input { padding: 9px 10px; font-size: 13px; }
    .lv-qa-send { padding: 9px 12px; font-size: 13px; }
    .lv-stat-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
    .lv-left { height: 38vh; }
  }
`;

// ─── Accent palette (cycles per card) ────────────────────────────────────────
const ACCENTS = [
    { border: '#c4b5fd', title: '#7c3aed', bg: '#faf5ff' }, // violet
    { border: '#93c5fd', title: '#2563eb', bg: '#eff6ff' }, // blue
    { border: '#6ee7b7', title: '#059669', bg: '#f0fdf4' }, // emerald
    { border: '#fdba74', title: '#c2410c', bg: '#fff7ed' }, // orange
    { border: '#f9a8d4', title: '#be185d', bg: '#fdf2f8' }, // pink
    { border: '#86efac', title: '#15803d', bg: '#f0fdf4' }, // green
];

// ─── parseSummary (mirrors App.jsx) ───────────────────────────────────────────
function parseSummary(text) {
    if (!text) return [];
    return text.split('## ').filter(s => s.trim()).map((block) => {
        const lines = block.split('\n');
        const title = lines[0].trim();
        const highlights = [], concepts = [], examples = [], proseLines = [];
        for (const line of lines.slice(1)) {
            const l = line.trim();
            if (!l || l === '---') continue;
            if (l.startsWith('>')) { highlights.push(l.replace(/^>\s*/, '')); continue; }
            if (/^key concepts:/i.test(l)) {
                const m = l.match(/`([^`]+)`/g);
                if (m) m.forEach(x => concepts.push(x.replace(/`/g, '').trim()));
                continue;
            }
            if (/^examples:$/i.test(l)) continue;
            if (l.startsWith('→')) { examples.push(l.replace(/^→\s*/, '').trim()); continue; }
            if (l.startsWith('- ')) {
                const c = l.slice(2).trim();
                if (c.startsWith('→') || c.toLowerCase().includes('example') || c.toLowerCase().includes('e.g.')) {
                    examples.push(c.replace(/^→\s*/, ''));
                } else if (/`[^`]+`/.test(c) || c.split(/\s+/).length < 5) {
                    concepts.push(c.replace(/`/g, '').trim());
                } else { proseLines.push(c); }
                continue;
            }
            proseLines.push(l);
        }
        const fullProse = proseLines.map(l => l.replace(/\*\*(.*?)\*\*/g, '$1')).join(' ').trim();
        let lead_sentence = fullProse, prose = '';
        let from = 0, found = false;
        while (from < fullProse.length) {
            const idx = fullProse.indexOf('. ', from);
            if (idx === -1) break;
            if (idx + 1 >= 40) { lead_sentence = fullProse.slice(0, idx + 1); prose = fullProse.slice(idx + 2).trim(); found = true; break; }
            from = idx + 2;
        }
        if (!found) { const fb = fullProse.indexOf('. '); if (fb !== -1) { lead_sentence = fullProse.slice(0, fb + 1); prose = fullProse.slice(fb + 2).trim(); } }
        return { title, lead_sentence, prose, concepts, examples, highlights };
    });
}

function SummaryCard({ section, accent }) {
    const a = accent || ACCENTS[0];
    return (
        <div className="lv-sum-card" style={{ borderLeft: `3px solid ${a.border}` }}>
            <div className="lv-sum-title" style={{ color: a.title }}>{section.title}</div>
            {section.highlights.map((h, i) => (
                <div key={i} className="lv-sum-highlight" style={{ background: a.bg, borderLeftColor: a.border }}>{h}</div>
            ))}
            {section.lead_sentence && <div className="lv-sum-lead">{section.lead_sentence}</div>}
            {section.prose && <div className="lv-sum-prose">{section.prose}</div>}
            {section.concepts.length > 0 && (
                <div className="lv-sum-concepts">
                    {section.concepts.map((c, i) => (
                        <span key={i} className="lv-sum-concept" style={{ borderColor: a.border, color: a.title }}>{c}</span>
                    ))}
                </div>
            )}
            {section.examples.length > 0 && (
                <div className="lv-sum-examples">
                    {section.examples.map((e, i) => <div key={i} className="lv-sum-example">{e}</div>)}
                </div>
            )}
        </div>
    );
}

const LANG_NAMES = { en: 'English', ar: 'Arabic', zh: 'Chinese', fr: 'French', de: 'German', hi: 'Hindi', es: 'Spanish', it: 'Italian', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese', ru: 'Russian' };

function fmtDur(s) {
    if (!s) return '—';
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LectureView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const addToast = useToast();

    const [lecture, setLecture]         = useState(null);
    const [loading, setLoading]         = useState(true);
    const [exportOpen, setExportOpen]   = useState(false);
    const [activeTab, setActiveTab]     = useState('summary');
    const [qaHistory, setQaHistory]     = useState([]);
    const [qaQuestion, setQaQuestion]   = useState('');
    const [qaLoading, setQaLoading]     = useState(false);
    const [stats, setStats]             = useState(null);
    const [visualFrames, setVisualFrames] = useState(null); // null = not fetched
    const qaEndRef = useRef(null);

    useEffect(() => {
        api.get(`/api/v1/lectures/${id}/full`)
            .then(res => setLecture(res.data))
            .catch(() => navigate('/app'))
            .finally(() => setLoading(false));
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (activeTab === 'stats' && id && !stats) {
            api.get(`/api/v1/lectures/${id}/analytics`)
                .then(res => setStats(res.data))
                .catch(() => {});
        }
        if (activeTab === 'visuals' && id && visualFrames === null) {
            api.get(`/api/v1/lectures/${id}/visual-frames`)
                .then(res => setVisualFrames(res.data.frames || []))
                .catch(() => setVisualFrames([]));
        }
    }, [activeTab, id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (qaEndRef.current) qaEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [qaHistory, qaLoading]);

    const handleAsk = async () => {
        const q = qaQuestion.trim();
        if (!q || qaLoading) return;
        setQaQuestion('');
        setQaHistory(h => [...h, { role: 'user', text: q }]);
        setQaLoading(true);
        try {
            const res = await api.post(`/api/v1/ask/${id}`, { question: q });
            setQaHistory(h => [...h, { role: 'assistant', text: res.data.answer }]);
        } catch {
            setQaHistory(h => [...h, { role: 'assistant', text: 'Failed to get answer. Please try again.' }]);
        }
        setQaLoading(false);
    };

    const handleShare = async () => {
        try {
            const res = await api.post(`/api/v1/lectures/${id}/share`);
            const shareUrl = window.location.origin + res.data.share_url;
            await navigator.clipboard.writeText(shareUrl);
            addToast({ type: 'success', message: 'Link copied!' });
            if (lecture) setLecture(l => ({ ...l, share_token: res.data.share_url.split('/share/')[1] }));
        } catch {
            addToast({ type: 'error', message: 'Failed to generate share link' });
        }
    };


    const segments = lecture?.transcript
        ? lecture.transcript.split('\n').filter(s => s.trim())
        : [];

    const wordCount = segments.reduce((n, s) => n + s.split(/\s+/).filter(Boolean).length, 0);
    const summaryText = lecture?.master_summary || lecture?.summary || '';
    const summarySections = parseSummary(summaryText);
    const titleDisplay = lecture?.title
        ? (lecture.title.length > 40 ? lecture.title.slice(0, 40) + '…' : lecture.title)
        : 'Lecture';

    if (loading) {
        return (
            <>
                <style>{CSS}</style>
                <div className="lv"><div className="lv-loading">Loading…</div></div>
            </>
        );
    }

    return (
        <>
            <style>{CSS}</style>
            <div className="lv">
                {/* ── Navbar ── */}
                <nav className="lv-nav">
                    <Link to="/app" className="lv-back">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M5 12l7-7M5 12l7 7"/></svg>
                        Back
                    </Link>
                    <div className="lv-nav-title">{titleDisplay}</div>
                    <div className="lv-nav-right">
                        <button className="lv-btn-ghost" onClick={() => setExportOpen(true)}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            <span className="lv-btn-text">Export PDF</span>
                        </button>
                        <button className="lv-btn-ghost" onClick={handleShare}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                            <span className="lv-btn-text">{lecture?.share_token ? 'Copy link' : 'Share'}</span>
                        </button>
                    </div>
                </nav>

                {/* ── Two-panel body ── */}
                <div className="lv-body">
                    {/* Left: transcript */}
                    <div className="lv-left">
                        <div className="lv-panel-header">
                            <span className="lv-panel-label">Transcript</span>
                            <span className="lv-panel-meta">{wordCount.toLocaleString()} words</span>
                            {lecture?.topic && <span className="lv-pill lv-pill-topic">{lecture.topic}</span>}
                            {lecture?.language && <span className="lv-pill lv-pill-lang">{LANG_NAMES[lecture.language] || lecture.language.toUpperCase()}</span>}
                        </div>
                        {segments.length === 0
                            ? <div className="lv-empty-panel">No transcript available</div>
                            : (
                                <div className="lv-transcript-list">
                                    {segments.map((text, i) => (
                                        <div key={i} className="lv-segment">
                                            <span className="lv-seg-num">{fmtTs(i * 12)}</span>
                                            <span className="lv-seg-text">{text}</span>
                                        </div>
                                    ))}
                                </div>
                            )
                        }
                    </div>

                    {/* Right: tabbed panel */}
                    <div className="lv-right">
                        <div className="lv-tabs">
                            {['summary', 'ask', 'stats', 'visuals'].map(tab => (
                                <button
                                    key={tab}
                                    className={`lv-tab${activeTab === tab ? ' active' : ''}`}
                                    onClick={() => setActiveTab(tab)}
                                >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                        </div>

                        {/* Summary */}
                        {activeTab === 'summary' && (
                            <div className="lv-tab-body">
                                {summarySections.length === 0
                                    ? <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', paddingTop: 40 }}>Summary not yet generated</div>
                                    : summarySections.map((s, i) => <SummaryCard key={i} section={s} accent={ACCENTS[i % ACCENTS.length]} />)
                                }
                            </div>
                        )}

                        {/* Ask */}
                        {activeTab === 'ask' && (
                            <>
                                <div className="lv-tab-body">
                                    {qaHistory.length === 0 && !qaLoading && (
                                        <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', paddingTop: 32 }}>
                                            Ask anything about this lecture
                                        </div>
                                    )}
                                    <div className="lv-qa-messages">
                                        {qaHistory.map((m, i) => (
                                            <div key={i} className={`lv-qa-msg ${m.role === 'user' ? 'lv-qa-user' : 'lv-qa-assistant'}`}>
                                                {m.role === 'assistant'
                                                    ? <QAAnswer text={m.text} />
                                                    : m.text
                                                }
                                            </div>
                                        ))}
                                        {qaLoading && (
                                            <div className="lv-qa-msg lv-qa-assistant" style={{ color: C.muted }}>Thinking…</div>
                                        )}
                                        <div ref={qaEndRef} />
                                    </div>
                                </div>
                                <div className="lv-qa-bar">
                                    <input
                                        className="lv-qa-input"
                                        type="text"
                                        value={qaQuestion}
                                        onChange={e => setQaQuestion(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAsk()}
                                        placeholder="Ask a question about this lecture…"
                                        disabled={qaLoading}
                                    />
                                    <button className="lv-qa-send" onClick={handleAsk} disabled={qaLoading || !qaQuestion.trim()}>
                                        Ask
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Stats */}
                        {activeTab === 'stats' && (
                            <div className="lv-tab-body">
                                {!stats
                                    ? <div style={{ fontSize: 13, color: C.muted }}>Loading…</div>
                                    : (
                                        <div className="lv-stat-grid">
                                            <div className="lv-stat-card">
                                                <div className="lv-stat-label">Words</div>
                                                <div className="lv-stat-val">{(stats.word_count || 0).toLocaleString()}</div>
                                            </div>
                                            <div className="lv-stat-card">
                                                <div className="lv-stat-label">Duration</div>
                                                <div className="lv-stat-val">{fmtDur(stats.total_duration_seconds)}</div>
                                            </div>
                                            <div className="lv-stat-card">
                                                <div className="lv-stat-label">Chunks</div>
                                                <div className="lv-stat-val">{stats.total_chunks || 0}</div>
                                                <div className="lv-stat-sub">12s segments</div>
                                            </div>
                                            <div className="lv-stat-card">
                                                <div className="lv-stat-label">Compression</div>
                                                <div className="lv-stat-val">{stats.compression_ratio || '—'}</div>
                                                <div className="lv-stat-sub">summary / transcript</div>
                                            </div>
                                            <div className="lv-stat-card">
                                                <div className="lv-stat-label">Language</div>
                                                <div className="lv-stat-val" style={{ fontSize: 16 }}>{LANG_NAMES[stats.language] || (stats.language || '').toUpperCase()}</div>
                                            </div>
                                            {lecture?.share_views > 0 && (
                                                <div className="lv-stat-card">
                                                    <div className="lv-stat-label">Share views</div>
                                                    <div className="lv-stat-val">{lecture.share_views}</div>
                                                </div>
                                            )}
                                            {visualFrames && visualFrames.length > 0 && (() => {
                                                const screenCount = visualFrames.filter(f => (f.source || 'screen') === 'screen').length;
                                                const boardCount  = visualFrames.filter(f => f.source === 'board').length;
                                                return (
                                                    <div className="lv-stat-card">
                                                        <div className="lv-stat-label">Visual frames</div>
                                                        <div className="lv-stat-val">{visualFrames.length}</div>
                                                        <div className="lv-stat-sub">
                                                            {screenCount > 0 && boardCount > 0
                                                                ? `${screenCount} screen · ${boardCount} board`
                                                                : screenCount > 0
                                                                    ? `${screenCount} screen`
                                                                    : `${boardCount} board`
                                                            }
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )
                                }
                            </div>
                        )}

                        {/* Visuals */}
                        {activeTab === 'visuals' && (
                            <div className="lv-tab-body">
                                {visualFrames === null ? (
                                    <div style={{ fontSize: 13, color: C.muted }}>Loading…</div>
                                ) : visualFrames.length === 0 ? (
                                    <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', paddingTop: 32 }}>
                                        No visual capture data for this lecture.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {visualFrames.map((frame, i) => {
                                            const vd = frame.visual_data || {};
                                            const contentType = vd.content_type || 'unknown';
                                            const source = frame.source || 'screen';
                                            const typeColors = {
                                                slide: { bg: '#eff6ff', color: '#2563eb' },
                                                code: { bg: '#f0fdf4', color: '#16a34a' },
                                                diagram: { bg: '#faf5ff', color: '#7c3aed' },
                                                equation: { bg: '#fff7ed', color: '#c2410c' },
                                                default: { bg: '#f8fafc', color: '#475569' },
                                            };
                                            const tc = typeColors[contentType] || typeColors.default;
                                            const sourceBadge = source === 'board'
                                                ? { bg: '#f0fdf4', color: '#15803d', label: 'Board' }
                                                : { bg: '#eff6ff', color: '#1d4ed8', label: 'Screen' };
                                            return (
                                                <div key={i} style={{
                                                    border: `1px solid ${C.border}`,
                                                    borderRadius: 10,
                                                    padding: '12px 14px',
                                                    background: C.card,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: 6,
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <span style={{
                                                            fontFamily: 'monospace',
                                                            fontSize: 12,
                                                            color: C.muted,
                                                            minWidth: 40,
                                                        }}>
                                                            {fmtTs(frame.timestamp_seconds)}
                                                        </span>
                                                        <span style={{
                                                            fontSize: 10,
                                                            fontWeight: 600,
                                                            letterSpacing: '0.4px',
                                                            textTransform: 'uppercase',
                                                            padding: '2px 7px',
                                                            borderRadius: 5,
                                                            background: tc.bg,
                                                            color: tc.color,
                                                        }}>
                                                            {contentType}
                                                        </span>
                                                        <span style={{
                                                            fontSize: 10,
                                                            fontWeight: 600,
                                                            letterSpacing: '0.4px',
                                                            padding: '2px 7px',
                                                            borderRadius: 5,
                                                            background: sourceBadge.bg,
                                                            color: sourceBadge.color,
                                                        }}>
                                                            {sourceBadge.label}
                                                        </span>
                                                    </div>
                                                    {vd.title && (
                                                        <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>
                                                            {vd.title}
                                                        </div>
                                                    )}
                                                    {vd.text_content && (
                                                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                                                            {vd.text_content}
                                                        </div>
                                                    )}
                                                    {vd.equations && vd.equations.length > 0 && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                            {vd.equations.map((eq, j) => (
                                                                <div key={j} style={{
                                                                    fontFamily: 'monospace',
                                                                    fontSize: 12,
                                                                    color: '#2563eb',
                                                                    background: '#eff6ff',
                                                                    padding: '4px 8px',
                                                                    borderRadius: 5,
                                                                }}>
                                                                    {eq}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {vd.diagrams && vd.diagrams.length > 0 && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                            {vd.diagrams.map((d, j) => (
                                                                <div key={j} style={{
                                                                    fontSize: 12,
                                                                    color: '#64748b',
                                                                    fontStyle: 'italic',
                                                                }}>
                                                                    {d}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

        {exportOpen && (
            <ExportModal lectureId={id} onClose={() => setExportOpen(false)} />
        )}
        </>
    );
}
