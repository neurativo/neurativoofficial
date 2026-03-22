import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

// Public endpoint — no auth interceptor needed
const BASE_URL = import.meta.env.VITE_API_URL || '';

const C = {
    bg: 'var(--color-bg)', text: 'var(--color-text)', sec: 'var(--color-sec)', muted: 'var(--color-muted)',
    border: 'var(--color-border)', borderHov: 'var(--color-border-hov)', card: 'var(--color-card)', dark: 'var(--color-dark)',
    darkFg: 'var(--color-dark-fg)',
};

const CSS = `
  .sv * { box-sizing: border-box; }
  .sv { font-family: 'Inter', sans-serif; background: ${C.bg}; color: ${C.text}; min-height: 100vh; -webkit-font-smoothing: antialiased; }
  .sv-header { border-bottom: 1px solid ${C.border}; padding: 0 24px; height: 56px; display: flex; align-items: center; gap: 10px; background: ${C.card}; }
  .sv-logo { display: flex; align-items: center; gap: 8px; text-decoration: none; }
  .sv-logo-icon { width: 24px; height: 24px; background: ${C.dark}; border-radius: 7px; display: flex; align-items: center; justify-content: center; }
  .sv-wordmark { font-size: 14px; font-weight: 600; color: ${C.text}; letter-spacing: -0.3px; }
  .sv-badge { margin-left: 10px; font-size: 11px; color: ${C.muted}; border: 1px solid ${C.border}; border-radius: 6px; padding: 2px 8px; }
  .sv-body { max-width: 680px; margin: 0 auto; padding: 48px 24px 80px; }
  .sv-title { font-size: 28px; font-weight: 600; color: ${C.text}; letter-spacing: -0.8px; line-height: 1.25; margin: 0 0 16px; }
  .sv-pills { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 24px; }
  .sv-pill { font-size: 11px; padding: 2px 8px; border-radius: 5px; }
  .sv-pill-topic { background: #f3f0ff; color: #7c3aed; border: 1px solid #e9d5ff; }
  .sv-pill-lang { background: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; }
  .sv-pill-dur { background: #f0ede8; color: ${C.sec}; border: 1px solid ${C.borderHov}; }
  .sv-pill-date { background: ${C.bg}; color: ${C.muted}; border: 1px solid ${C.border}; }
  .sv-divider { height: 1px; background: ${C.border}; margin: 28px 0; }
  .sv-eyebrow { font-size: 11px; font-weight: 600; color: ${C.muted}; letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 16px; }
  .sv-sum-card { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 12px; padding: 16px; margin-bottom: 10px; }
  .sv-sum-title { font-size: 13px; font-weight: 600; color: ${C.text}; margin-bottom: 8px; }
  .sv-sum-highlight { font-size: 13px; color: ${C.text}; background: #f8f6f3; border-left: 2px solid ${C.borderHov}; padding: 6px 10px; border-radius: 0 6px 6px 0; line-height: 1.5; margin-bottom: 6px; }
  .sv-sum-lead { font-size: 13px; color: ${C.sec}; line-height: 1.65; margin-bottom: 6px; }
  .sv-sum-prose { font-size: 12px; color: ${C.muted}; line-height: 1.65; margin-bottom: 6px; }
  .sv-sum-concepts { display: flex; flex-wrap: wrap; gap: 4px; }
  .sv-sum-concept { font-size: 11px; color: ${C.sec}; background: ${C.bg}; border: 1px solid ${C.border}; border-radius: 5px; padding: 2px 7px; }
  .sv-transcript-toggle { display: flex; align-items: center; gap: 6px; font-size: 13px; color: ${C.sec}; background: none; border: 1px solid ${C.border}; border-radius: 9px; padding: 8px 14px; cursor: pointer; font-family: inherit; transition: border-color 0.15s; }
  .sv-transcript-toggle:hover { border-color: ${C.borderHov}; }
  .sv-transcript-list { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }
  .sv-segment { display: flex; gap: 10px; }
  .sv-seg-num { font-size: 11px; color: ${C.muted}; font-family: monospace; min-width: 22px; padding-top: 2px; text-align: right; flex-shrink: 0; }
  .sv-seg-text { font-size: 13px; color: ${C.text}; line-height: 1.65; }
  .sv-footer { border-top: 1px solid ${C.border}; padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; max-width: 680px; margin: 0 auto; }
  .sv-footer-made { font-size: 12px; color: ${C.muted}; }
  .sv-footer-cta { font-size: 13px; font-weight: 500; color: ${C.text}; text-decoration: none; display: flex; align-items: center; gap: 4px; transition: opacity 0.15s; }
  .sv-footer-cta:hover { opacity: 0.7; }
  .sv-404 { text-align: center; padding: 120px 24px; }
  .sv-404-title { font-size: 18px; font-weight: 500; color: ${C.text}; margin-bottom: 8px; }
  .sv-404-sub { font-size: 14px; color: ${C.sec}; margin-bottom: 24px; }
  .sv-btn-home { display: inline-block; padding: 10px 22px; background: ${C.dark}; color: #fafaf9; font-size: 13px; font-weight: 500; border: none; border-radius: 10px; cursor: pointer; text-decoration: none; }
`;

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
                if (/`[^`]+`/.test(c) || c.split(/\s+/).length < 5) concepts.push(c.replace(/`/g, '').trim());
                else proseLines.push(c);
                continue;
            }
            proseLines.push(l);
        }
        const fullProse = proseLines.map(l => l.replace(/\*\*(.*?)\*\*/g, '$1')).join(' ').trim();
        let lead_sentence = fullProse, prose = '';
        const fb = fullProse.indexOf('. ');
        if (fb !== -1 && fb + 1 >= 40) { lead_sentence = fullProse.slice(0, fb + 1); prose = fullProse.slice(fb + 2).trim(); }
        return { title, lead_sentence, prose, concepts, highlights };
    });
}

const LANG = { en: 'English', ar: 'Arabic', zh: 'Chinese', fr: 'French', de: 'German', hi: 'Hindi', es: 'Spanish', it: 'Italian', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese', ru: 'Russian' };

const ACCENTS = [
    { border: '#c4b5fd', title: '#7c3aed', bg: '#faf5ff' },
    { border: '#93c5fd', title: '#2563eb', bg: '#eff6ff' },
    { border: '#6ee7b7', title: '#059669', bg: '#f0fdf4' },
    { border: '#fdba74', title: '#c2410c', bg: '#fff7ed' },
    { border: '#f9a8d4', title: '#be185d', bg: '#fdf2f8' },
    { border: '#86efac', title: '#15803d', bg: '#f0fdf4' },
];

function fmtDur(s) {
    if (!s) return null;
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function fmtDate(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function ShareView() {
    const { token } = useParams();
    const [lecture, setLecture]           = useState(null);
    const [loading, setLoading]           = useState(true);
    const [notFound, setNotFound]         = useState(false);
    const [showTranscript, setShowTranscript] = useState(false);

    useEffect(() => {
        fetch(`${BASE_URL}/api/v1/share/${token}`)
            .then(r => {
                if (r.status === 404) { setNotFound(true); return null; }
                return r.json();
            })
            .then(data => { if (data) setLecture(data); })
            .catch(() => setNotFound(true))
            .finally(() => setLoading(false));
    }, [token]);

    if (loading) {
        return (
            <>
                <style>{CSS}</style>
                <div className="sv">
                    <header className="sv-header">
                        <Link to="/" className="sv-logo">
                            <div className="sv-logo-icon">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fafaf9" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                            </div>
                            <span className="sv-wordmark">Neurativo</span>
                        </Link>
                    </header>
                    <div style={{ textAlign: 'center', padding: '80px 24px', fontSize: 13, color: C.muted }}>Loading…</div>
                </div>
            </>
        );
    }

    if (notFound || !lecture) {
        return (
            <>
                <style>{CSS}</style>
                <div className="sv">
                    <header className="sv-header">
                        <Link to="/" className="sv-logo">
                            <div className="sv-logo-icon">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fafaf9" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                            </div>
                            <span className="sv-wordmark">Neurativo</span>
                        </Link>
                    </header>
                    <div className="sv-404">
                        <p className="sv-404-title">This lecture is no longer available</p>
                        <p className="sv-404-sub">The share link may have been revoked or expired.</p>
                        <Link to="/" className="sv-btn-home">Go home</Link>
                    </div>
                </div>
            </>
        );
    }

    const summaryText = lecture.master_summary || lecture.summary || '';
    const sections = parseSummary(summaryText);
    const segments = lecture.transcript
        ? lecture.transcript.split('\n').filter(s => s.trim())
        : [];
    const dur = fmtDur(lecture.total_duration_seconds);
    const date = fmtDate(lecture.created_at);

    return (
        <>
            <style>{CSS}</style>
            <div className="sv">
                {/* Header */}
                <header className="sv-header">
                    <Link to="/" className="sv-logo">
                        <div className="sv-logo-icon">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fafaf9" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                        </div>
                        <span className="sv-wordmark">Neurativo</span>
                    </Link>
                    <span className="sv-badge">Shared lecture</span>
                </header>

                {/* Body */}
                <div className="sv-body">
                    <h1 className="sv-title">{lecture.title || 'Untitled Lecture'}</h1>

                    {/* Pills */}
                    <div className="sv-pills">
                        {lecture.topic    && <span className="sv-pill sv-pill-topic">{lecture.topic}</span>}
                        {lecture.language && <span className="sv-pill sv-pill-lang">{LANG[lecture.language] || lecture.language.toUpperCase()}</span>}
                        {dur              && <span className="sv-pill sv-pill-dur">{dur}</span>}
                        {date             && <span className="sv-pill sv-pill-date">{date}</span>}
                    </div>

                    <div className="sv-divider" />

                    {/* Summary */}
                    {sections.length > 0 && (
                        <>
                            <div className="sv-eyebrow">Summary</div>
                            {sections.map((s, i) => {
                                const a = ACCENTS[i % ACCENTS.length];
                                return (
                                    <div key={i} className="sv-sum-card" style={{ borderLeft: `3px solid ${a.border}` }}>
                                        <div className="sv-sum-title" style={{ color: a.title }}>{s.title}</div>
                                        {s.highlights.map((h, j) => (
                                            <div key={j} className="sv-sum-highlight" style={{ background: a.bg, borderLeftColor: a.border }}>{h}</div>
                                        ))}
                                        {s.lead_sentence && <div className="sv-sum-lead">{s.lead_sentence}</div>}
                                        {s.prose && <div className="sv-sum-prose">{s.prose}</div>}
                                        {s.concepts.length > 0 && (
                                            <div className="sv-sum-concepts">
                                                {s.concepts.map((c, j) => (
                                                    <span key={j} className="sv-sum-concept" style={{ borderColor: a.border, color: a.title }}>{c}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            <div className="sv-divider" />
                        </>
                    )}

                    {/* Transcript */}
                    {segments.length > 0 && (
                        <>
                            <div className="sv-eyebrow">Transcript</div>
                            <button className="sv-transcript-toggle" onClick={() => setShowTranscript(v => !v)}>
                                {showTranscript ? 'Hide transcript ↑' : 'Show full transcript ↓'}
                            </button>
                            {showTranscript && (
                                <div className="sv-transcript-list">
                                    {segments.map((text, i) => (
                                        <div key={i} className="sv-segment">
                                            <span className="sv-seg-num">{i + 1}</span>
                                            <span className="sv-seg-text">{text}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <footer style={{ borderTop: `1px solid ${C.border}`, padding: '20px 24px' }}>
                    <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: C.muted }}>Made with Neurativo</span>
                        <Link to="/" style={{ fontSize: 13, fontWeight: 500, color: C.text, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                            Try it free →
                        </Link>
                    </div>
                </footer>
            </div>
        </>
    );
}
