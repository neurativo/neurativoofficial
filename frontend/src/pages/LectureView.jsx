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
  .lv-transcript-list { flex: 1; overflow-y: auto; padding: 0 0; display: flex; flex-direction: column; }
  .lv-segment { display: flex; gap: 14px; padding: 10px 20px; border-bottom: 1px solid ${C.border}; transition: background 0.15s; }
  .lv-segment:last-child { border-bottom: none; }
  .lv-seg-num { font-size: 10px; color: ${C.muted}; font-family: 'JetBrains Mono', monospace; min-width: 42px; padding-top: 3px; flex-shrink: 0; line-height: 1.6; text-align: right; }
  .lv-seg-text { font-size: 14px; color: ${C.sec}; line-height: 1.75; flex: 1; }
  .lv-seg-live { border-left: 3px solid #6366f1; padding-left: 17px; }
  .lv-seg-live .lv-seg-text { color: ${C.text}; font-weight: 500; }
  @keyframes lv-chunk-in { from { opacity: 0; } to { opacity: 1; } }
  .lv-chunk-enter { animation: lv-chunk-in 0.25s ease; }
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

  /* Share modal */
  .lv-share-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
  .lv-share-box { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 14px; width: 100%; max-width: 400px; padding: 24px; box-shadow: 0 8px 32px rgba(0,0,0,0.18); }
  .lv-share-title { font-size: 15px; font-weight: 600; color: ${C.text}; margin: 0 0 20px; letter-spacing: -0.3px; }
  .lv-share-label { font-size: 11px; font-weight: 600; color: ${C.muted}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .lv-share-toggle { display: flex; border: 1px solid ${C.border}; border-radius: 9px; overflow: hidden; margin-bottom: 18px; }
  .lv-share-opt { flex: 1; padding: 8px 10px; font-size: 12px; font-weight: 500; background: none; border: none; cursor: pointer; color: ${C.muted}; font-family: inherit; transition: background 0.12s, color 0.12s; text-align: center; }
  .lv-share-opt.active { background: ${C.dark}; color: #fafaf9; }
  .lv-share-expiry { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 18px; }
  .lv-share-exp-btn { padding: 5px 11px; font-size: 12px; font-weight: 500; border: 1px solid ${C.border}; border-radius: 7px; background: none; cursor: pointer; color: ${C.sec}; font-family: inherit; transition: all 0.12s; }
  .lv-share-exp-btn.active { border-color: ${C.dark}; background: ${C.dark}; color: #fafaf9; }
  .lv-share-url-row { display: flex; gap: 7px; margin-bottom: 18px; }
  .lv-share-url { flex: 1; padding: 8px 11px; background: ${C.bg}; border: 1px solid ${C.border}; border-radius: 8px; font-size: 11px; color: ${C.muted}; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lv-share-copy { padding: 8px 14px; background: ${C.dark}; color: #fafaf9; border: none; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit; white-space: nowrap; }
  .lv-share-copy:hover { opacity: 0.85; }
  .lv-share-qr { display: flex; justify-content: center; margin-bottom: 18px; }
  .lv-share-qr img { border-radius: 8px; border: 1px solid ${C.border}; }
  .lv-share-actions { display: flex; gap: 8px; justify-content: space-between; align-items: center; }
  .lv-share-revoke { font-size: 12px; color: #ef4444; background: none; border: 1px solid #ef444433; border-radius: 8px; padding: 8px 14px; cursor: pointer; font-family: inherit; transition: background 0.12s; }
  .lv-share-revoke:hover { background: #ef44440f; }
  .lv-share-gen { padding: 9px 20px; background: ${C.dark}; color: #fafaf9; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; }
  .lv-share-gen:hover { opacity: 0.85; }
  .lv-share-gen:disabled { opacity: 0.45; cursor: default; }
  .lv-share-close { position: absolute; top: 16px; right: 16px; background: none; border: none; cursor: pointer; color: ${C.muted}; padding: 4px; }
  .lv-share-mode-note { font-size: 11px; color: ${C.muted}; margin-bottom: 18px; line-height: 1.5; }

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
    .lv-tabs { padding: 0 12px; }
    .lv-tab { padding: 12px 10px 10px; font-size: 12px; }
    .lv-tab-body { padding: 14px; }
    .lv-qa-bar { padding: 10px 12px; gap: 6px; }
    .lv-qa-input { padding: 9px 10px; font-size: 13px; }
    .lv-qa-send { padding: 9px 12px; font-size: 13px; }
    .lv-stat-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
    .lv-left { height: 38vh; }
  }

  /* Smart Explain */
  .lv-explain-btn { position: fixed; z-index: 50; padding: 5px 10px; background: ${C.dark}; color: ${C.darkFg}; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.18); font-family: inherit; animation: lv-chunk-in 0.15s ease; transform: translate(-50%, -100%); white-space: nowrap; }
  .lv-explain-btn:hover { opacity: 0.85; }
  .lv-explain-overlay { position: fixed; inset: 0; z-index: 60; display: flex; justify-content: flex-end; }
  .lv-explain-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.25); backdrop-filter: blur(2px); }
  .lv-explain-panel { position: relative; width: 100%; max-width: 480px; background: ${C.card}; height: 100%; box-shadow: -4px 0 32px rgba(0,0,0,0.12); display: flex; flex-direction: column; border-left: 1px solid ${C.border}; animation: lv-slide-right 0.28s ease; }
  @keyframes lv-slide-right { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: translateX(0); } }
  .lv-explain-header { height: 52px; padding: 0 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid ${C.border}; flex-shrink: 0; }
  .lv-explain-title { font-size: 14px; font-weight: 700; color: ${C.text}; font-family: 'Outfit', sans-serif; display: flex; align-items: center; gap: 8px; }
  .lv-explain-dot { width: 8px; height: 8px; border-radius: 50%; background: ${C.dark}; }
  .lv-explain-close { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; color: ${C.muted}; border-radius: 6px; transition: color 0.12s, background 0.12s; }
  .lv-explain-close:hover { color: ${C.text}; background: ${C.border}; }
  .lv-explain-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 18px; }
  .lv-explain-section-label { font-size: 10px; font-weight: 700; color: ${C.muted}; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px; }
  .lv-explain-text { font-size: 14px; color: ${C.text}; line-height: 1.75; }
  .lv-explain-analogy { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px; }
  .lv-explain-analogy-text { font-size: 13px; color: ${C.sec}; line-height: 1.7; font-style: italic; }
  .lv-explain-step { display: flex; gap: 12px; padding: 10px 12px; background: ${C.bg}; border: 1px solid ${C.border}; border-radius: 8px; }
  .lv-explain-step-num { font-size: 10px; font-weight: 700; color: ${C.muted}; font-family: 'JetBrains Mono', monospace; padding-top: 2px; flex-shrink: 0; min-width: 20px; }
  .lv-explain-step-text { font-size: 13px; color: ${C.sec}; line-height: 1.65; }
  .lv-explain-spinner { width: 32px; height: 32px; border: 3px solid ${C.border}; border-top-color: ${C.dark}; border-radius: 50%; animation: lv-spin 0.7s linear infinite; }
  @keyframes lv-spin { to { transform: rotate(360deg); } }
`;

// ─── Accent palette (cycles per card) ────────────────────────────────────────
const ACCENTS_LIGHT = [
    { border: '#c4b5fd', title: '#7c3aed', bg: '#faf5ff' }, // violet
    { border: '#93c5fd', title: '#2563eb', bg: '#eff6ff' }, // blue
    { border: '#6ee7b7', title: '#059669', bg: '#f0fdf4' }, // emerald
    { border: '#fdba74', title: '#c2410c', bg: '#fff7ed' }, // orange
    { border: '#f9a8d4', title: '#be185d', bg: '#fdf2f8' }, // pink
    { border: '#86efac', title: '#15803d', bg: '#f0fdf4' }, // green
];
const ACCENTS_DARK = [
    { border: '#7c3aed', title: '#c4b5fd', bg: '#1e1338' }, // violet
    { border: '#2563eb', title: '#93c5fd', bg: '#0f1e38' }, // blue
    { border: '#059669', title: '#6ee7b7', bg: '#0a2218' }, // emerald
    { border: '#c2410c', title: '#fdba74', bg: '#291508' }, // orange
    { border: '#be185d', title: '#f9a8d4', bg: '#25081e' }, // pink
    { border: '#15803d', title: '#86efac', bg: '#0c1f10' }, // green
];

function useIsDark() {
    const [dark, setDark] = React.useState(() => document.documentElement.classList.contains('dark'));
    React.useEffect(() => {
        const obs = new MutationObserver(() =>
            setDark(document.documentElement.classList.contains('dark'))
        );
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => obs.disconnect();
    }, []);
    return dark;
}

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

// ─── Share Modal ──────────────────────────────────────────────────────────────
const EXPIRY_OPTIONS = [
    { label: 'Never', value: null },
    { label: '1 day', value: 1 },
    { label: '7 days', value: 7 },
    { label: '30 days', value: 30 },
];

function ShareModal({ lectureId, initialToken, onClose, addToast }) {
    const [mode, setMode]           = useState('full');
    const [expiryDays, setExpiryDays] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [shareUrl, setShareUrl]   = useState(
        initialToken ? window.location.origin + '/share/' + initialToken : ''
    );
    const [revoking, setRevoking]   = useState(false);

    const expiryIso = expiryDays
        ? new Date(Date.now() + expiryDays * 86400000).toISOString()
        : null;

    async function generate() {
        setGenerating(true);
        try {
            const res = await (await import('../lib/api')).default.post(
                `/api/v1/lectures/${lectureId}/share`,
                { mode, expires_at: expiryIso }
            );
            const url = window.location.origin + res.data.share_url;
            setShareUrl(url);
        } catch {
            addToast({ type: 'error', message: 'Failed to generate share link' });
        } finally {
            setGenerating(false);
        }
    }

    async function copyLink() {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            addToast({ type: 'success', message: 'Link copied!' });
        } catch {
            addToast({ type: 'success', message: shareUrl });
        }
    }

    async function revoke() {
        setRevoking(true);
        try {
            await (await import('../lib/api')).default.post(`/api/v1/lectures/${lectureId}/unshare`);
            setShareUrl('');
            addToast({ type: 'success', message: 'Share link revoked' });
        } catch {
            addToast({ type: 'error', message: 'Failed to revoke' });
        } finally {
            setRevoking(false);
        }
    }

    return (
        <div className="lv-share-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="lv-share-box" style={{ position: 'relative' }}>
                <button className="lv-share-close" onClick={onClose} aria-label="Close">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>

                <div className="lv-share-title">Share lecture</div>

                {/* Mode toggle */}
                <div className="lv-share-label">Content</div>
                <div className="lv-share-toggle" style={{ marginBottom: 6 }}>
                    <button className={`lv-share-opt${mode === 'full' ? ' active' : ''}`} onClick={() => setMode('full')}>Full (transcript + summary)</button>
                    <button className={`lv-share-opt${mode === 'summary_only' ? ' active' : ''}`} onClick={() => setMode('summary_only')}>Summary only</button>
                </div>
                <div className="lv-share-mode-note">
                    {mode === 'summary_only' ? 'Viewers will see the summary and key concepts — transcript is hidden.' : 'Viewers can read the full transcript and summary.'}
                </div>

                {/* Expiry */}
                <div className="lv-share-label">Expires</div>
                <div className="lv-share-expiry">
                    {EXPIRY_OPTIONS.map(opt => (
                        <button
                            key={opt.label}
                            className={`lv-share-exp-btn${expiryDays === opt.value ? ' active' : ''}`}
                            onClick={() => setExpiryDays(opt.value)}
                        >{opt.label}</button>
                    ))}
                </div>

                {/* Generate button */}
                <button className="lv-share-gen" onClick={generate} disabled={generating} style={{ width: '100%', marginBottom: 18 }}>
                    {generating ? 'Generating…' : shareUrl ? 'Update link' : 'Generate link'}
                </button>

                {/* URL + copy */}
                {shareUrl && (
                    <>
                        <div className="lv-share-url-row">
                            <div className="lv-share-url" title={shareUrl}>{shareUrl}</div>
                            <button className="lv-share-copy" onClick={copyLink}>Copy</button>
                        </div>
                        {/* QR code */}
                        <div className="lv-share-qr">
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(shareUrl)}&bgcolor=ffffff&color=1a1a1a&margin=6`}
                                alt="QR code"
                                width={140}
                                height={140}
                            />
                        </div>
                        {/* Revoke */}
                        <div className="lv-share-actions">
                            <button className="lv-share-revoke" onClick={revoke} disabled={revoking}>
                                {revoking ? 'Revoking…' : 'Revoke link'}
                            </button>
                            <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                                {expiryDays ? `Expires in ${expiryDays}d` : 'No expiry'}
                            </span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LectureView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const addToast = useToast();
    const isDark = useIsDark();

    const [lecture, setLecture]         = useState(null);
    const [loading, setLoading]         = useState(true);
    const [exportOpen, setExportOpen]   = useState(false);
    const [shareOpen, setShareOpen]     = useState(false);
    const [activeTab, setActiveTab]     = useState('summary');
    const [qaHistory, setQaHistory]     = useState([]);
    const [qaQuestion, setQaQuestion]   = useState('');
    const [qaLoading, setQaLoading]     = useState(false);
    const [stats, setStats]             = useState(null);
    const [visualFrames, setVisualFrames] = useState(null); // null = not fetched
    const qaEndRef = useRef(null);
    const [selInfo, setSelInfo]           = useState({ text: '', x: 0, y: 0, show: false });
    const [explainPanel, setExplainPanel] = useState({ show: false, loading: false, data: null });
    const transcriptRef = useRef(null);

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

    const segments = lecture?.transcript
        ? lecture.transcript.split('\n').filter(s => s.trim())
        : [];

    const wordCount = segments.reduce((n, s) => n + s.split(/\s+/).filter(Boolean).length, 0);
    const summaryText = lecture?.master_summary || lecture?.summary || '';
    const summarySections = parseSummary(summaryText);
    const topicCount = summarySections.reduce((n, s) => n + s.concepts.length, 0);
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
                        <button className="lv-btn-ghost" onClick={() => setShareOpen(true)}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                            <span className="lv-btn-text">Share</span>
                        </button>
                    </div>
                </nav>

                {/* ── Two-panel body ── */}
                <div className="lv-body">
                    {/* Left: transcript */}
                    <div className="lv-left" ref={transcriptRef} onMouseUp={handleTextSelection}>
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
                                    : summarySections.map((s, i) => {
                                        const palette = isDark ? ACCENTS_DARK : ACCENTS_LIGHT;
                                        return <SummaryCard key={i} section={s} accent={palette[i % palette.length]} index={i} total={summarySections.length} />;
                                    })
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
                                            const typeColors = isDark ? {
                                                slide: { bg: '#0f1e38', color: '#93c5fd' },
                                                code: { bg: '#0a2218', color: '#6ee7b7' },
                                                diagram: { bg: '#1e1338', color: '#c4b5fd' },
                                                equation: { bg: '#291508', color: '#fdba74' },
                                                default: { bg: '#1e1e1e', color: '#a0a0a0' },
                                            } : {
                                                slide: { bg: '#eff6ff', color: '#2563eb' },
                                                code: { bg: '#f0fdf4', color: '#16a34a' },
                                                diagram: { bg: '#faf5ff', color: '#7c3aed' },
                                                equation: { bg: '#fff7ed', color: '#c2410c' },
                                                default: { bg: '#f8fafc', color: '#475569' },
                                            };
                                            const tc = typeColors[contentType] || typeColors.default;
                                            const sourceBadge = source === 'board'
                                                ? isDark ? { bg: '#0a2218', color: '#6ee7b7', label: 'Board' } : { bg: '#f0fdf4', color: '#15803d', label: 'Board' }
                                                : isDark ? { bg: '#0f1e38', color: '#93c5fd', label: 'Screen' } : { bg: '#eff6ff', color: '#1d4ed8', label: 'Screen' };
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
                                                        <div style={{ fontSize: 12, color: C.sec, lineHeight: 1.6 }}>
                                                            {vd.text_content}
                                                        </div>
                                                    )}
                                                    {vd.equations && vd.equations.length > 0 && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                            {vd.equations.map((eq, j) => (
                                                                <div key={j} style={{
                                                                    fontFamily: 'monospace',
                                                                    fontSize: 12,
                                                                    color: isDark ? '#93c5fd' : '#2563eb',
                                                                    background: isDark ? '#0f1e38' : '#eff6ff',
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

        {exportOpen && (
            <ExportModal lectureId={id} onClose={() => setExportOpen(false)} />
        )}
        {shareOpen && (
            <ShareModal
                lectureId={id}
                initialToken={lecture?.share_token}
                onClose={() => setShareOpen(false)}
                addToast={addToast}
            />
        )}
        </>
    );
}
