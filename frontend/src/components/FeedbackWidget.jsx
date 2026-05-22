/**
 * FeedbackWidget — floating pill button + slide-up drawer.
 * Mounted globally (inside auth guard) so it's available on every page.
 * Positioned so it never overlaps critical UI: bottom-right on desktop,
 * bottom-center on mobile with pointer-events:none wrapper.
 *
 * Props: none. Reads current pathname from window.location automatically.
 */
import React, { useState, useRef, useEffect } from 'react';
import api from '../lib/api';

const TYPES = [
    { id: 'bug',     label: 'Bug',     color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
    { id: 'feature', label: 'Feature', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
    { id: 'general', label: 'General', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
];

const CSS = `
.fw-fab {
  position: fixed;
  bottom: 22px;
  right: 22px;
  z-index: 800;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 14px 9px 11px;
  background: var(--color-dark, #1a1a1a);
  color: var(--color-dark-fg, #fafaf9);
  border: none;
  border-radius: 99px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  font-family: 'Inter', sans-serif;
  box-shadow: 0 4px 16px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.10);
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
  opacity: 0.82;
  -webkit-tap-highlight-color: transparent;
}
.fw-fab:hover { opacity: 1; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.22); }
.fw-fab:active { transform: scale(0.97); }
.fw-fab svg { flex-shrink: 0; }
.fw-fab-label { white-space: nowrap; }

/* Backdrop */
.fw-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 850;
  animation: fw-fade-in 0.18s ease;
}
@keyframes fw-fade-in { from { opacity: 0; } to { opacity: 1; } }

/* Drawer — bottom-sheet on mobile, centered card on desktop */
.fw-drawer {
  position: fixed;
  z-index: 860;
  background: var(--color-card, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  box-shadow: 0 20px 60px rgba(0,0,0,0.22);
  display: flex;
  flex-direction: column;
}

/* Mobile: full-width bottom sheet */
@media (max-width: 639px) {
  .fw-drawer {
    bottom: 0;
    left: 0;
    right: 0;
    border-radius: 20px 20px 0 0;
    border-bottom: none;
    max-height: 90vh;
    animation: fw-slide-up 0.22s cubic-bezier(0.32,0.72,0,1);
  }
  @keyframes fw-slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
  .fw-fab { bottom: 16px; right: 16px; }
}

/* Desktop: centered card */
@media (min-width: 640px) {
  .fw-drawer {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 420px;
    max-width: calc(100vw - 32px);
    border-radius: 20px;
    animation: fw-pop-in 0.2s cubic-bezier(0.34,1.56,0.64,1);
  }
  @keyframes fw-pop-in { from { opacity: 0; transform: translate(-50%,-46%); } to { opacity: 1; transform: translate(-50%,-50%); } }
}

/* Drawer internals */
.fw-drawer-handle {
  width: 36px; height: 4px;
  background: var(--color-border, #e5e7eb);
  border-radius: 99px;
  margin: 10px auto 0;
  flex-shrink: 0;
}
@media (min-width: 640px) { .fw-drawer-handle { display: none; } }

.fw-drawer-header {
  display: flex; align-items: center; gap: 10px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  flex-shrink: 0;
}
.fw-drawer-icon {
  width: 34px; height: 34px;
  background: var(--color-bg, #f9f9f8);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-sec, #555);
  flex-shrink: 0;
}
.fw-drawer-title {
  flex: 1;
  font-size: 15px; font-weight: 600;
  color: var(--color-text, #111);
  letter-spacing: -0.3px;
}
.fw-drawer-close {
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer;
  color: var(--color-muted, #9ca3af);
  border-radius: 8px;
  transition: background 0.12s, color 0.12s;
  font-size: 20px; line-height: 1;
}
.fw-drawer-close:hover { background: var(--color-bg, #f9f9f8); color: var(--color-text, #111); }

.fw-drawer-body { padding: 18px 20px 20px; overflow-y: auto; flex: 1; }

/* Type chips */
.fw-type-row {
  display: flex; gap: 6px; margin-bottom: 16px;
}
.fw-type-chip {
  flex: 1;
  padding: 7px 0;
  font-size: 12px; font-weight: 500;
  border-radius: 10px;
  border: 1.5px solid var(--color-border, #e5e7eb);
  background: var(--color-bg, #f9f9f8);
  color: var(--color-sec, #555);
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s, color 0.12s;
  font-family: inherit;
  text-align: center;
}
.fw-type-chip:hover { border-color: var(--color-border-hov, #ccc); }
.fw-type-chip.active { border-color: var(--fw-chip-color); background: var(--fw-chip-bg); color: var(--fw-chip-color); font-weight: 600; }

/* Textarea */
.fw-textarea {
  width: 100%;
  padding: 11px 13px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
  font-size: 13px; line-height: 1.6;
  color: var(--color-text, #111);
  background: var(--color-bg, #f9f9f8);
  resize: none;
  outline: none;
  font-family: 'Inter', sans-serif;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
  display: block;
}
.fw-textarea:focus {
  border-color: var(--color-border-hov, #ccc);
  box-shadow: 0 0 0 3px rgba(0,0,0,0.04);
}
.fw-textarea::placeholder { color: var(--color-muted, #9ca3af); }
.fw-char-count {
  text-align: right; font-size: 11px;
  color: var(--color-muted, #9ca3af);
  margin-top: 5px;
}

/* Submit row */
.fw-submit-row {
  display: flex; gap: 8px; margin-top: 16px;
}
.fw-btn-cancel {
  padding: 9px 16px;
  font-size: 13px; font-weight: 500;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  background: var(--color-card, #fff);
  color: var(--color-sec, #555);
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.12s;
}
.fw-btn-cancel:hover { border-color: var(--color-border-hov, #ccc); }
.fw-btn-submit {
  flex: 1;
  padding: 9px 16px;
  font-size: 13px; font-weight: 600;
  border: none;
  border-radius: 10px;
  background: var(--color-dark, #1a1a1a);
  color: var(--color-dark-fg, #fafaf9);
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.12s, transform 0.1s;
}
.fw-btn-submit:hover:not(:disabled) { opacity: 0.88; }
.fw-btn-submit:active:not(:disabled) { transform: scale(0.98); }
.fw-btn-submit:disabled { opacity: 0.45; cursor: not-allowed; }

/* Success state */
.fw-success {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px; padding: 32px 20px 28px;
  text-align: center;
}
.fw-success-icon {
  width: 52px; height: 52px;
  background: rgba(16,185,129,0.1);
  border: 1.5px solid rgba(16,185,129,0.25);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 24px;
}
.fw-success-title {
  font-size: 15px; font-weight: 600;
  color: var(--color-text, #111);
  letter-spacing: -0.3px;
}
.fw-success-sub {
  font-size: 13px; color: var(--color-muted, #9ca3af);
  line-height: 1.5;
}
`;

export default function FeedbackWidget() {
    const [open, setOpen]       = useState(false);
    const [type, setType]       = useState('general');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [done, setDone]       = useState(false);
    const textareaRef           = useRef(null);

    // Focus textarea when drawer opens
    useEffect(() => {
        if (open && !done) {
            setTimeout(() => textareaRef.current?.focus(), 80);
        }
    }, [open, done]);

    // Reset on close
    function handleClose() {
        setOpen(false);
        setTimeout(() => {
            setMessage('');
            setType('general');
            setDone(false);
        }, 300);
    }

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    async function handleSubmit() {
        if (!message.trim() || loading) return;
        setLoading(true);
        try {
            await api.post('/api/v1/feedback', {
                type,
                message: message.trim(),
                page_path: window.location.pathname,
            });
            setDone(true);
            setTimeout(handleClose, 2200);
        } catch {
            // silent — just close
            handleClose();
        } finally {
            setLoading(false);
        }
    }

    const canSubmit = message.trim().length >= 3 && !loading;

    return (
        <>
            <style>{CSS}</style>

            {/* Floating button */}
            <button
                className="fw-fab"
                onClick={() => setOpen(true)}
                aria-label="Send feedback"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span className="fw-fab-label">Feedback</span>
            </button>

            {/* Backdrop + Drawer */}
            {open && (
                <>
                    <div className="fw-backdrop" onClick={handleClose} />
                    <div className="fw-drawer" role="dialog" aria-modal="true" aria-label="Send feedback">
                        <div className="fw-drawer-handle" />
                        <div className="fw-drawer-header">
                            <div className="fw-drawer-icon">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                </svg>
                            </div>
                            <span className="fw-drawer-title">Share your thoughts</span>
                            <button className="fw-drawer-close" onClick={handleClose} aria-label="Close">×</button>
                        </div>

                        {done ? (
                            <div className="fw-success">
                                <div className="fw-success-icon">✓</div>
                                <div className="fw-success-title">Thanks for the feedback!</div>
                                <div className="fw-success-sub">We read every submission and use it to improve Neurativo.</div>
                            </div>
                        ) : (
                            <div className="fw-drawer-body">
                                {/* Type chips */}
                                <div className="fw-type-row">
                                    {TYPES.map(t => (
                                        <button
                                            key={t.id}
                                            className={`fw-type-chip${type === t.id ? ' active' : ''}`}
                                            style={type === t.id ? { '--fw-chip-color': t.color, '--fw-chip-bg': t.bg } : {}}
                                            onClick={() => setType(t.id)}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Message */}
                                <textarea
                                    ref={textareaRef}
                                    className="fw-textarea"
                                    rows={4}
                                    maxLength={1000}
                                    placeholder={
                                        type === 'bug'     ? 'Describe what happened and how to reproduce it…' :
                                        type === 'feature' ? 'What would you like to see? How would it help you?' :
                                                             "What's on your mind? Any feedback is welcome…"
                                    }
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                />
                                <div className="fw-char-count">{message.length}/1000</div>

                                <div className="fw-submit-row">
                                    <button className="fw-btn-cancel" onClick={handleClose}>Cancel</button>
                                    <button
                                        className="fw-btn-submit"
                                        disabled={!canSubmit}
                                        onClick={handleSubmit}
                                    >
                                        {loading ? 'Sending…' : 'Send feedback'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </>
    );
}
