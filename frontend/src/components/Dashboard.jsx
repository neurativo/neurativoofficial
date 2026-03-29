import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useClerk } from '@clerk/react';
import api from '../lib/api';
import { useToast } from './Toast';
import ExportModal from './ExportModal';
import ImportModal from './ImportModal';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
    bg: 'var(--color-bg)', text: 'var(--color-text)', sec: 'var(--color-sec)', muted: 'var(--color-muted)',
    border: 'var(--color-border)', borderHov: 'var(--color-border-hov)', card: 'var(--color-card)', dark: 'var(--color-dark)',
    darkFg: 'var(--color-dark-fg)',
};

const CSS = `
  .db * { box-sizing: border-box; }
  .db { font-family: 'Inter', sans-serif; background: ${C.bg}; color: ${C.text}; min-height: 100vh; -webkit-font-smoothing: antialiased; }

  /* Header */
  .db-header { height: 56px; background: ${C.card}; border-bottom: 1px solid ${C.border}; display: flex; align-items: center; padding: 0 24px; gap: 12px; position: sticky; top: 0; z-index: 20; }
  .db-logo { display: flex; align-items: center; gap: 8px; text-decoration: none; }
  .db-logo-icon { width: 24px; height: 24px; background: ${C.dark}; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .db-wordmark { font-size: 14px; font-weight: 600; color: ${C.text}; letter-spacing: -0.3px; }
  .db-header-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
  .db-btn-new { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; background: ${C.dark}; color: ${C.darkFg}; font-size: 13px; font-weight: 500; border: none; border-radius: 9px; cursor: pointer; text-decoration: none; transition: opacity 0.15s; font-family: inherit; white-space: nowrap; }
  .db-btn-new:hover { opacity: 0.82; }
  .db-btn-import { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; background: none; color: ${C.sec}; font-size: 13px; font-weight: 500; border: 1px solid ${C.border}; border-radius: 9px; cursor: pointer; text-decoration: none; transition: border-color 0.15s, color 0.15s; font-family: inherit; white-space: nowrap; }
  .db-btn-import:hover { border-color: ${C.borderHov}; color: ${C.text}; }

  /* Avatar / dropdown */
  .db-avatar-wrap { position: relative; }
  .db-avatar { width: 32px; height: 32px; border-radius: 50%; background: ${C.dark}; color: ${C.darkFg}; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; transition: opacity 0.15s; font-family: inherit; }
  .db-avatar:hover { opacity: 0.8; }
  .db-dropdown { position: absolute; right: 0; top: 40px; z-index: 30; background: ${C.card}; border: 1px solid ${C.border}; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 216px; overflow: hidden; }
  .db-dropdown-head { padding: 12px 14px; border-bottom: 1px solid ${C.border}; }
  .db-dropdown-label { font-size: 11px; color: ${C.muted}; margin-bottom: 2px; }
  .db-dropdown-email { font-size: 12px; font-weight: 500; color: ${C.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .db-dropdown-item { display: block; width: 100%; text-align: left; padding: 9px 14px; font-size: 13px; color: ${C.sec}; background: none; border: none; font-family: inherit; cursor: pointer; transition: background 0.12s; text-decoration: none; }
  .db-dropdown-item:hover { background: ${C.bg}; }
  .db-dropdown-divider { height: 1px; background: ${C.border}; }
  .db-dropdown-signout { display: block; width: 100%; text-align: left; padding: 9px 14px; font-size: 13px; color: #ef4444; background: none; border: none; cursor: pointer; transition: background 0.12s; font-family: inherit; }
  .db-dropdown-signout:hover { background: #fff5f5; }

  /* Main content */
  .db-main { max-width: 980px; margin: 0 auto; padding: 36px 24px 80px; }
  .db-page-title { font-size: 22px; font-weight: 600; color: ${C.text}; letter-spacing: -0.5px; margin: 0 0 2px; }
  .db-page-sub { font-size: 13px; color: ${C.muted}; margin: 0 0 24px; }

  /* Search */
  .db-search-wrap { position: relative; margin-bottom: 10px; }
  .db-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: ${C.muted}; pointer-events: none; }
  .db-search { width: 100%; padding: 9px 12px 9px 34px; border: 1px solid ${C.border}; border-radius: 10px; font-size: 13px; color: ${C.text}; background: ${C.card}; outline: none; transition: border-color 0.15s; font-family: inherit; }
  .db-search:focus { border-color: #c0bdb8; }
  .db-search::placeholder { color: ${C.muted}; }

  /* Filters */
  .db-filters { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
  .db-filter-select { padding: 5px 10px; border: 1px solid ${C.border}; border-radius: 7px; font-size: 12px; color: ${C.sec}; background: ${C.card}; outline: none; cursor: pointer; font-family: inherit; }
  .db-filter-clear { font-size: 12px; color: ${C.sec}; background: none; border: none; cursor: pointer; text-decoration: underline; font-family: inherit; padding: 0; margin-left: 4px; }

  /* Grid */
  .db-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  @media (max-width: 860px) { .db-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 540px) { .db-grid { grid-template-columns: 1fr; } }

  /* Card */
  .db-card { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 14px; padding: 20px; cursor: pointer; position: relative; transition: border-color 0.15s, transform 0.15s; display: flex; flex-direction: column; }
  .db-card:hover { border-color: ${C.borderHov}; transform: translateY(-1px); }

  .db-card-top { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
  .db-card-title { flex: 1; font-size: 14px; font-weight: 500; color: ${C.text}; letter-spacing: -0.2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4; }
  .db-card-date { font-size: 12px; color: ${C.muted}; white-space: nowrap; flex-shrink: 0; margin-top: 2px; }

  .db-pills { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 10px; }
  .db-pill { font-size: 11px; padding: 2px 8px; border-radius: 5px; white-space: nowrap; line-height: 1.6; }
  .db-pill-topic { background: #f3f0ff; color: #7c3aed; border: 1px solid #e9d5ff; }
  .db-pill-lang { background: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; }
  .db-pill-dur { background: #f0ede8; color: ${C.sec}; border: 1px solid ${C.borderHov}; }

  .db-card-preview { font-size: 12px; color: ${C.sec}; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; flex: 1; margin-bottom: 14px; }
  .db-card-preview-empty { font-size: 12px; color: ${C.muted}; font-style: italic; flex: 1; margin-bottom: 14px; }

  .db-card-footer { display: flex; align-items: center; margin-top: auto; }
  .db-card-stat { font-size: 11px; color: ${C.muted}; flex: 1; }
  .db-menu-wrap { position: relative; }
  .db-menu-btn { width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center; color: ${C.muted}; background: none; border: none; cursor: pointer; transition: background 0.12s, color 0.12s, opacity 0.12s; opacity: 0; }
  .db-card:hover .db-menu-btn { opacity: 1; }
  .db-menu-btn:hover { background: ${C.bg}; color: ${C.text}; }
  .db-card-menu { position: absolute; right: 0; bottom: calc(100% + 4px); z-index: 20; background: ${C.card}; border: 1px solid ${C.border}; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); width: 160px; overflow: hidden; }
  .db-card-menu-item { display: block; width: 100%; text-align: left; padding: 8px 12px; font-size: 13px; color: ${C.text}; background: none; border: none; cursor: pointer; transition: background 0.1s; font-family: inherit; }
  .db-card-menu-item:hover { background: ${C.bg}; }
  .db-card-menu-item.danger { color: #ef4444; }
  .db-card-menu-item.danger:hover { background: #fff5f5; }
  .db-card-menu-divider { height: 1px; background: ${C.border}; }

  /* Skeleton */
  .db-skeleton { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 14px; padding: 20px; height: 170px; }
  .db-skeleton-line { height: 10px; background: ${C.border}; border-radius: 6px; margin-bottom: 10px; animation: db-shimmer 1.5s ease-in-out infinite; }
  @keyframes db-shimmer { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }

  /* Empty state */
  .db-empty { text-align: center; padding: 80px 24px 40px; }
  .db-empty-num { font-size: 72px; font-weight: 700; color: ${C.border}; font-family: 'Courier New', monospace; letter-spacing: -6px; line-height: 1; margin-bottom: 20px; }
  .db-empty-title { font-size: 18px; font-weight: 500; color: ${C.text}; letter-spacing: -0.4px; margin: 0 0 6px; }
  .db-empty-sub { font-size: 14px; color: ${C.sec}; margin: 0 0 24px; }
  .db-btn-start { display: inline-block; padding: 10px 22px; background: ${C.dark}; color: ${C.darkFg}; font-size: 13px; font-weight: 500; border: none; border-radius: 10px; cursor: pointer; text-decoration: none; transition: opacity 0.15s; font-family: inherit; }
  .db-btn-start:hover { opacity: 0.82; }

  /* Delete modal */
  .db-modal-overlay { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); backdrop-filter: blur(4px); }
  .db-modal { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 16px; padding: 28px; width: 100%; max-width: 400px; margin: 0 16px; }
  .db-modal-title { font-size: 16px; font-weight: 600; color: ${C.text}; letter-spacing: -0.4px; margin: 0 0 8px; }
  .db-modal-sub { font-size: 14px; color: ${C.sec}; line-height: 1.6; margin: 0 0 24px; }
  .db-modal-btns { display: flex; gap: 8px; }
  .db-btn-ghost { flex: 1; padding: 10px; background: ${C.bg}; color: ${C.text}; font-size: 13px; border: 1px solid ${C.border}; border-radius: 10px; cursor: pointer; font-family: inherit; transition: border-color 0.15s; }
  .db-btn-ghost:hover { border-color: ${C.borderHov}; }
  .db-btn-danger { flex: 1; padding: 10px; background: #ef4444; color: #fff; font-size: 13px; font-weight: 500; border: none; border-radius: 10px; cursor: pointer; transition: opacity 0.15s; font-family: inherit; }
  .db-btn-danger:hover { opacity: 0.85; }
  .db-btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
  .db-no-match { font-size: 14px; color: ${C.sec}; padding: 32px 0; text-align: center; }
  .db-no-match-clear { background: none; border: none; cursor: pointer; font-family: inherit; font-size: 13px; color: ${C.sec}; text-decoration: underline; display: block; margin: 6px auto 0; }

  /* Usage banner */
  .db-usage-banner { background: var(--color-card); border-bottom: 1px solid var(--color-border); padding: 10px 24px; }
  .db-usage-inner { max-width: 980px; margin: 0 auto; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
  .db-usage-row { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 180px; }
  .db-usage-label { font-size: 12px; color: var(--color-sec); white-space: nowrap; }
  .db-usage-bar { flex: 1; height: 4px; background: var(--color-border); border-radius: 4px; overflow: hidden; min-width: 60px; }
  .db-usage-fill-blue { height: 100%; background: #3b82f6; border-radius: 4px; transition: width 0.5s ease; }
  .db-usage-fill-blue.warn { background: #f59e0b; }
  .db-usage-fill-blue.full { background: #ef4444; }
  .db-usage-fill-purple { height: 100%; background: #7c3aed; border-radius: 4px; transition: width 0.5s ease; }
  .db-usage-fill-purple.warn { background: #f59e0b; }
  .db-usage-fill-purple.full { background: #ef4444; }
  .db-usage-count { font-size: 11px; color: var(--color-muted); font-family: monospace; white-space: nowrap; }
  .db-usage-resets { font-size: 11px; color: var(--color-muted); margin-left: auto; white-space: nowrap; }
  .db-usage-upgrade { font-size: 12px; color: var(--color-text); font-weight: 500; text-decoration: none; white-space: nowrap; }
  .db-usage-upgrade:hover { text-decoration: underline; }

  /* ── Mobile ── */
  @media (max-width: 600px) {
    .db-header { padding: 0 16px; gap: 8px; }
    .db-main { padding: 20px 16px 60px; }
    .db-page-title { font-size: 18px; }
    .db-btn-text { display: none; }
    .db-btn-import { padding: 7px 9px; }
    .db-btn-new { padding: 7px 9px; }
    .db-menu-btn { opacity: 1 !important; }
    .db-empty { padding: 40px 16px 24px; }
    .db-empty-num { font-size: 52px; letter-spacing: -4px; }
    .db-filters { gap: 6px; }
    .db-filter-select { font-size: 12px; padding: 5px 8px; }
  }

  /* Onboarding modal */
  .ob-overlay { position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.45); backdrop-filter: blur(6px); padding: 16px; }
  .ob-modal { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 20px; width: 100%; max-width: 480px; padding: 40px 36px 36px; box-shadow: 0 24px 64px rgba(0,0,0,0.14); text-align: center; }
  .ob-logo { width: 48px; height: 48px; background: ${C.dark}; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
  .ob-step-title { font-size: 20px; font-weight: 600; color: ${C.text}; letter-spacing: -0.5px; margin: 0 0 10px; }
  .ob-step-sub { font-size: 14px; color: ${C.sec}; line-height: 1.65; margin: 0 0 28px; }
  .ob-btn-primary { width: 100%; padding: 12px; background: ${C.dark}; color: #fafaf9; font-size: 14px; font-weight: 500; border: none; border-radius: 12px; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }
  .ob-btn-primary:hover { opacity: 0.82; }
  .ob-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .ob-dots { display: flex; justify-content: center; gap: 6px; margin-top: 24px; }
  .ob-dot { width: 6px; height: 6px; border-radius: 50%; background: ${C.border}; transition: background 0.2s; }
  .ob-dot.active { background: ${C.dark}; }
  .ob-mic-icon { width: 56px; height: 56px; border-radius: 50%; background: #f0fdf4; border: 1.5px solid #bbf7d0; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #16a34a; }
  .ob-mic-granted { background: #f0fdf4; border-color: #86efac; }
  .ob-mic-denied { background: #fff5f5; border-color: #fecaca; color: #ef4444; }
  .ob-mic-status { font-size: 13px; margin-top: 12px; margin-bottom: 20px; }
  .ob-checkmark { width: 56px; height: 56px; border-radius: 50%; background: #f0fdf4; border: 1.5px solid #86efac; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #16a34a; }
`;

// ─── Theme toggle ─────────────────────────────────────────────────────────────
function ThemeToggle() {
    const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
    const toggle = () => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle('dark', next);
        localStorage.setItem('neurativo_theme', next ? 'dark' : 'light');
    };
    return (
        <button
            onClick={toggle}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{ width: 32, height: 32, borderRadius: 9, background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-sec)', transition: 'border-color 0.15s, color 0.15s', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-border-hov)'; e.currentTarget.style.color = 'var(--color-text)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-sec)'; }}
        >
            {dark
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
            }
        </button>
    );
}

// ─── OnboardingModal ───────────────────────────────────────────────────────────
function OnboardingModal({ onDone }) {
    const navigate = useNavigate();
    const [step, setStep] = useState(0); // 0 | 1

    const finish = () => {
        localStorage.setItem('neurativo_onboarded', '1');
        onDone();
        navigate('/record');
    };

    const steps = [
        // Step 0 — Welcome
        <div key="0">
            <div className="ob-logo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fafaf9" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
            </div>
            <h2 className="ob-step-title">Welcome to Neurativo</h2>
            <p className="ob-step-sub">Your AI-powered lecture assistant. Record any class, meeting, or talk and get an instant transcript, smart summary, and Q&A — in real time.</p>
            <button className="ob-btn-primary" onClick={() => setStep(1)}>Get started →</button>
        </div>,

        // Step 1 — Ready
        <div key="1">
            <div className="ob-checkmark">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </div>
            <h2 className="ob-step-title">You're all set!</h2>
            <p className="ob-step-sub">Hit record, speak naturally, and watch Neurativo transcribe and summarise your lecture in real time.</p>
            <button className="ob-btn-primary" onClick={finish}>Start recording now →</button>
        </div>,
    ];

    return (
        <div className="ob-overlay">
            <div className="ob-modal">
                {steps[step]}
                <div className="ob-dots">
                    {[0, 1].map(i => <div key={i} className={`ob-dot${step === i ? ' active' : ''}`} />)}
                </div>
            </div>
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function smartDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function fmtDur(s) {
    if (!s) return '';
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
function langName(code) {
    const map = { en: 'English', ar: 'Arabic', zh: 'Chinese', fr: 'French', de: 'German', hi: 'Hindi', es: 'Spanish', it: 'Italian', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese', ru: 'Russian' };
    return map[code] || (code || '').toUpperCase();
}

// ─── UserMenu ─────────────────────────────────────────────────────────────────
function UserMenu({ user, onSignOut }) {
    const [open, setOpen] = useState(false);
    const initials = (user?.email?.[0] || '?').toUpperCase();
    return (
        <div className="db-avatar-wrap">
            <button className="db-avatar" onClick={() => setOpen(o => !o)}>{initials}</button>
            {open && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 29 }} onClick={() => setOpen(false)} />
                    <div className="db-dropdown">
                        <div className="db-dropdown-head">
                            <div className="db-dropdown-label">Signed in as</div>
                            <div className="db-dropdown-email">{user?.email}</div>
                        </div>
                        <Link to="/profile" className="db-dropdown-item" onClick={() => setOpen(false)}>Profile</Link>
                        <div className="db-dropdown-divider" />
                        <button className="db-dropdown-signout" onClick={onSignOut}>Sign out</button>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── LectureCard ──────────────────────────────────────────────────────────────
function LectureCard({ lecture, onDelete, onShare, onExport }) {
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const preview = lecture.summary_preview;
    const hasSummary = preview && preview.trim().length > 0;
    const displayPreview = hasSummary ? preview.slice(0, 90) : null;

    const statParts = [];
    if (lecture.total_chunks > 0) statParts.push(`${lecture.total_chunks} chunks`);
    if (lecture.total_sections > 0) statParts.push(`${lecture.total_sections} sections`);

    return (
        <div className="db-card" onClick={() => navigate(`/lecture/${lecture.id}`)}>
            {/* Top row: title + date */}
            <div className="db-card-top">
                <div className="db-card-title">{lecture.title || 'Untitled Lecture'}</div>
                <div className="db-card-date">{smartDate(lecture.created_at)}</div>
            </div>

            {/* Pills */}
            <div className="db-pills">
                {lecture.topic && <span className="db-pill db-pill-topic">{lecture.topic}</span>}
                {lecture.language && <span className="db-pill db-pill-lang">{langName(lecture.language)}</span>}
                {lecture.total_duration_seconds > 0 && <span className="db-pill db-pill-dur">{fmtDur(lecture.total_duration_seconds)}</span>}
            </div>

            {/* Preview */}
            {hasSummary
                ? <div className="db-card-preview">{displayPreview}{preview.length > 90 ? '…' : ''}</div>
                : <div className="db-card-preview-empty">Summary generating…</div>
            }

            {/* Footer */}
            <div className="db-card-footer">
                <div className="db-card-stat">{statParts.join(' · ')}</div>
                <div className="db-menu-wrap" ref={menuRef} onClick={e => e.stopPropagation()}>
                    <button className="db-menu-btn" onClick={() => setMenuOpen(o => !o)}>
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
                        </svg>
                    </button>
                    {menuOpen && (
                        <div className="db-card-menu">
                            <button className="db-card-menu-item" onClick={() => { setMenuOpen(false); navigate(`/lecture/${lecture.id}`); }}>Open</button>
                            <button className="db-card-menu-item" onClick={() => { setMenuOpen(false); onExport(lecture.id); }}>Export PDF</button>
                            <button className="db-card-menu-item" onClick={() => { setMenuOpen(false); onShare(lecture.id); }}>Share</button>
                            <div className="db-card-menu-divider" />
                            <button className="db-card-menu-item danger" onClick={() => { setMenuOpen(false); onDelete(lecture.id); }}>Delete</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard({ user }) {
    const navigate = useNavigate();
    const addToast  = useToast();
    const { signOut } = useClerk();

    const [lectures, setLectures] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [usage, setUsage]       = useState(null);
    const [search, setSearch]     = useState('');
    const [topicFilter, setTopicFilter] = useState('');
    const [langFilter,  setLangFilter]  = useState('');
    const [sortBy,    setSortBy]    = useState('newest'); // newest | oldest | az
    const [deleteId,  setDeleteId]  = useState(null);
    const [deleting,  setDeleting]  = useState(false);
    const [exportId,  setExportId]  = useState(null);
    const [importOpen, setImportOpen] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);

    const searchRef = useRef(null);

    const handleSignOut = async () => {
        await signOut();
        navigate('/auth');
    };

    useEffect(() => {
        api.get('/api/v1/usage').then(res => setUsage(res.data)).catch(() => {});
    }, []);

    useEffect(() => {
        api.get('/api/v1/lectures?limit=50')
            .then(res => {
                const list = Array.isArray(res.data) ? res.data
                           : Array.isArray(res.data?.lectures) ? res.data.lectures : [];
                setLectures(list);
                if (list.length === 0 && !localStorage.getItem('neurativo_onboarded')) {
                    setShowOnboarding(true);
                }
            })
            .catch(() => setLectures([]))
            .finally(() => setLoading(false));
    }, []);

    // Keyboard shortcuts: Escape clears, / focuses search, n = new lecture
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') { setSearch(''); setTopicFilter(''); setLangFilter(''); searchRef.current?.blur(); }
            if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
                e.preventDefault();
                searchRef.current?.focus();
            }
            if (e.key === 'n' && document.activeElement?.tagName !== 'INPUT') {
                navigate('/record');
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [navigate]);

    const handleDelete = async () => {
        if (!deleteId) return;
        setDeleting(true);
        try {
            await api.delete(`/api/v1/lectures/${deleteId}`);
            setLectures(p => p.filter(l => l.id !== deleteId));
            addToast({ type: 'success', message: 'Lecture deleted' });
        } catch {
            addToast({ type: 'error', message: 'Failed to delete lecture' });
        }
        setDeleting(false);
        setDeleteId(null);
    };

    const handleShare = async (id) => {
        try {
            const res = await api.post(`/api/v1/lectures/${id}/share`);
            const shareUrl = window.location.origin + res.data.share_url;
            await navigator.clipboard.writeText(shareUrl);
            addToast({ type: 'success', message: 'Link copied!' });
        } catch {
            addToast({ type: 'error', message: 'Failed to generate share link' });
        }
    };

    const handleExport = (id) => setExportId(id);

    // Derived
    const topics    = [...new Set(lectures.map(l => l.topic).filter(Boolean))];
    const languages = [...new Set(lectures.map(l => l.language).filter(Boolean))];
    const hasFilters = topicFilter || langFilter;

    const filtered = lectures
        .filter(l => {
            const q = search.trim().toLowerCase();
            const matchSearch = !q ||
                (l.title    || '').toLowerCase().includes(q) ||
                (l.topic    || '').toLowerCase().includes(q) ||
                (l.language || '').toLowerCase().includes(q);
            const matchTopic = !topicFilter || l.topic    === topicFilter;
            const matchLang  = !langFilter  || l.language === langFilter;
            return matchSearch && matchTopic && matchLang;
        })
        .sort((a, b) => {
            if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
            if (sortBy === 'az')     return (a.title || '').localeCompare(b.title || '');
            return new Date(b.created_at) - new Date(a.created_at); // newest
        });

    const lectureWord = lectures.length === 1 ? 'lecture' : 'lectures';

    return (
        <>
            <style>{CSS}</style>
            <div className="db">
                {/* ── Header ── */}
                <header className="db-header">
                    <Link to="/" className="db-logo">
                        <div className="db-logo-icon">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fafaf9" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                            </svg>
                        </div>
                        <span className="db-wordmark">Neurativo</span>
                    </Link>
                    <div className="db-header-right">
                        <ThemeToggle />
                        <button className="db-btn-import" onClick={() => setImportOpen(true)}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                            <span className="db-btn-text">Import</span>
                        </button>
                        <button className="db-btn-new" onClick={() => navigate('/record')}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/>
                            </svg>
                            <span className="db-btn-text">New Lecture</span>
                        </button>
                        <UserMenu user={user} onSignOut={handleSignOut} />
                    </div>
                </header>

                {/* ── Free plan usage banner ── */}
                {usage && usage.plan_tier === 'free' && (
                    <div className="db-usage-banner">
                        <div className="db-usage-inner">
                            <div className="db-usage-row">
                                <span className="db-usage-label">Live lectures</span>
                                <div className="db-usage-bar">
                                    <div
                                        className={`db-usage-fill-blue${usage.lectures_this_month >= usage.lectures_limit ? ' full' : usage.lectures_this_month >= usage.lectures_limit * 0.8 ? ' warn' : ''}`}
                                        style={{ width: `${Math.min(100, (usage.lectures_this_month / usage.lectures_limit) * 100)}%` }}
                                    />
                                </div>
                                <span className="db-usage-count">{usage.lectures_this_month} / {usage.lectures_limit}</span>
                            </div>
                            <div className="db-usage-row">
                                <span className="db-usage-label">Imports</span>
                                <div className="db-usage-bar">
                                    <div
                                        className={`db-usage-fill-purple${usage.uploads_this_month >= usage.uploads_limit ? ' full' : usage.uploads_this_month >= usage.uploads_limit * 0.8 ? ' warn' : ''}`}
                                        style={{ width: `${Math.min(100, (usage.uploads_this_month / usage.uploads_limit) * 100)}%` }}
                                    />
                                </div>
                                <span className="db-usage-count">{usage.uploads_this_month} / {usage.uploads_limit}</span>
                            </div>
                            {usage.month_resets_at && (
                                <span className="db-usage-resets">
                                    Resets {new Date(usage.month_resets_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                <main className="db-main">
                    <h1 className="db-page-title">Your lectures</h1>
                    <p className="db-page-sub">{loading ? '' : `${lectures.length} ${lectureWord}`}</p>

                    {/* Search */}
                    <div className="db-search-wrap">
                        <span className="db-search-icon">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                        </span>
                        <input
                            ref={searchRef}
                            className="db-search"
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') { setSearch(''); e.target.blur(); } }}
                            placeholder="Search by title, topic or language…"
                        />
                    </div>

                    {/* Filters */}
                    <div className="db-filters">
                        {topics.length > 0 && (
                            <select className="db-filter-select" value={topicFilter} onChange={e => setTopicFilter(e.target.value)}>
                                <option value="">All topics</option>
                                {topics.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        )}
                        {languages.length > 0 && (
                            <select className="db-filter-select" value={langFilter} onChange={e => setLangFilter(e.target.value)}>
                                <option value="">All languages</option>
                                {languages.map(l => <option key={l} value={l}>{langName(l)}</option>)}
                            </select>
                        )}
                        <select className="db-filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ marginLeft: 'auto' }}>
                            <option value="newest">Newest first</option>
                            <option value="oldest">Oldest first</option>
                            <option value="az">A → Z</option>
                        </select>
                        {hasFilters && (
                            <button className="db-filter-clear" onClick={() => { setTopicFilter(''); setLangFilter(''); }}>
                                Clear filters
                            </button>
                        )}
                    </div>

                    {/* Content */}
                    {loading ? (
                        <div className="db-grid">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="db-skeleton">
                                    <div className="db-skeleton-line" style={{ width: '55%', marginBottom: 12 }} />
                                    <div className="db-skeleton-line" style={{ width: '80%' }} />
                                    <div className="db-skeleton-line" style={{ width: '65%' }} />
                                    <div className="db-skeleton-line" style={{ width: '90%' }} />
                                </div>
                            ))}
                        </div>
                    ) : lectures.length === 0 ? (
                        <div className="db-empty">
                            <div className="db-empty-num">00</div>
                            <p className="db-empty-title">No lectures yet</p>
                            <p className="db-empty-sub">Start recording your first lecture</p>
                            <button className="db-btn-start" onClick={() => navigate('/record')}>New Lecture</button>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="db-no-match">
                            No lectures match your search
                            <button className="db-no-match-clear" onClick={() => { setSearch(''); setTopicFilter(''); setLangFilter(''); }}>
                                Clear all filters
                            </button>
                        </div>
                    ) : (
                        <div className="db-grid">
                            {filtered.map(l => (
                                <LectureCard
                                    key={l.id}
                                    lecture={l}
                                    onDelete={id => setDeleteId(id)}
                                    onShare={handleShare}
                                    onExport={handleExport}
                                />
                            ))}
                        </div>
                    )}
                </main>

                {/* Onboarding modal */}
                {showOnboarding && (
                    <OnboardingModal onDone={() => setShowOnboarding(false)} />
                )}

                {/* Import modal */}
                {importOpen && (
                    <ImportModal onClose={() => setImportOpen(false)} />
                )}

                {/* Export modal */}
                {exportId && (
                    <ExportModal lectureId={exportId} onClose={() => setExportId(null)} />
                )}

                {/* Delete modal */}
                {deleteId && (
                    <div className="db-modal-overlay" onClick={() => !deleting && setDeleteId(null)}>
                        <div className="db-modal" onClick={e => e.stopPropagation()}>
                            <p className="db-modal-title">Delete this lecture?</p>
                            <p className="db-modal-sub">This will permanently delete the transcript, summary, and all associated data. This cannot be undone.</p>
                            <div className="db-modal-btns">
                                <button className="db-btn-ghost" onClick={() => setDeleteId(null)} disabled={deleting}>Cancel</button>
                                <button className="db-btn-danger" onClick={handleDelete} disabled={deleting}>
                                    {deleting ? 'Deleting…' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
