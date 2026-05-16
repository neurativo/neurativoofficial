import React, { useState, useEffect } from 'react';
import api from '../lib/api';

const CSS = `
  .bam-overlay {
    position: fixed; inset: 0; z-index: 200;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.45); backdrop-filter: blur(6px);
    padding: 16px;
    animation: bam-in 0.15s ease;
  }
  @keyframes bam-in { from { opacity: 0; } to { opacity: 1; } }
  .bam-box {
    background: var(--color-card, #fff);
    border: 1px solid var(--color-border, #f0ede8);
    border-radius: 20px;
    width: 100%; max-width: 440px;
    padding: 0;
    box-shadow: 0 24px 64px rgba(0,0,0,0.14);
    animation: bam-up 0.2s ease;
    overflow: hidden;
  }
  @keyframes bam-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  .bam-header {
    padding: 20px 20px 14px;
    border-bottom: 1px solid var(--color-border, #f0ede8);
    display: flex; align-items: center; gap: 10px;
  }
  .bam-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 100px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.4px;
    background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d;
  }
  .bam-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; }
  .bam-header-title { flex: 1; font-size: 15px; font-weight: 600; color: var(--color-text, #1a1a1a); letter-spacing: -0.3px; }
  .bam-close {
    width: 30px; height: 30px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    background: none; border: none; cursor: pointer;
    color: var(--color-muted, #a3a3a3); font-size: 18px; line-height: 1;
    transition: background 0.12s, color 0.12s; font-family: inherit;
    flex-shrink: 0;
  }
  .bam-close:hover { background: var(--color-bg, #fafaf9); color: var(--color-text, #1a1a1a); }
  .bam-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .bam-field { display: flex; flex-direction: column; gap: 5px; }
  .bam-label { font-size: 12px; font-weight: 500; color: var(--color-sec, #6b6b6b); }
  .bam-input {
    padding: 9px 12px; border: 1px solid var(--color-border, #f0ede8);
    border-radius: 10px; font-size: 13px; color: var(--color-text, #1a1a1a);
    background: var(--color-bg, #fafaf9); outline: none; font-family: inherit;
    transition: border-color 0.15s;
  }
  .bam-input:focus { border-color: var(--color-border-hov, #c8c4be); }
  .bam-textarea {
    padding: 9px 12px; border: 1px solid var(--color-border, #f0ede8);
    border-radius: 10px; font-size: 13px; color: var(--color-text, #1a1a1a);
    background: var(--color-bg, #fafaf9); outline: none; font-family: inherit;
    resize: vertical; min-height: 80px; transition: border-color 0.15s; line-height: 1.6;
  }
  .bam-textarea:focus { border-color: var(--color-border-hov, #c8c4be); }
  .bam-char { font-size: 11px; color: var(--color-muted, #a3a3a3); text-align: right; }
  .bam-submit {
    width: 100%; padding: 11px 0;
    background: var(--color-dark, #1a1a1a); color: #fafaf9;
    border: none; border-radius: 12px; font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: inherit; transition: opacity 0.15s;
    letter-spacing: -0.1px;
  }
  .bam-submit:hover { opacity: 0.85; }
  .bam-submit:disabled { opacity: 0.45; cursor: not-allowed; }
  .bam-state { padding: 32px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .bam-state-icon { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px; }
  .bam-state-icon.pending { background: #fef3c7; }
  .bam-state-icon.approved { background: #f0fdf4; border: 1.5px solid #bbf7d0; }
  .bam-state-icon.rejected { background: #f5f5f4; }
  .bam-state-title { font-size: 16px; font-weight: 600; color: var(--color-text, #1a1a1a); letter-spacing: -0.4px; }
  .bam-state-sub { font-size: 13px; color: var(--color-sec, #6b6b6b); line-height: 1.65; max-width: 300px; }
  .bam-state-days { font-size: 13px; font-weight: 600; color: #15803d; }
  .bam-btn-outline {
    padding: 9px 20px; border: 1px solid var(--color-border, #f0ede8);
    border-radius: 10px; font-size: 13px; font-weight: 500;
    color: var(--color-text, #1a1a1a); background: none;
    cursor: pointer; font-family: inherit; transition: border-color 0.15s;
    text-decoration: none; display: inline-block;
  }
  .bam-btn-outline:hover { border-color: var(--color-border-hov, #c8c4be); }
  .bam-error { font-size: 12px; color: #ef4444; }
`;

export default function BetaApplyModal({ onClose, user, initialApplication }) {
    const [view, setView] = useState('loading'); // loading | form | pending | approved | rejected
    const [fullName, setFullName] = useState(user?.displayName || '');
    const [subject, setSubject] = useState('');
    const [useCase, setUseCase] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [daysLeft, setDaysLeft] = useState(null);

    useEffect(() => {
        if (initialApplication) {
            applyApplicationState(initialApplication);
        } else {
            // Fetch own application
            api.get('/api/v1/beta/me')
                .then(res => {
                    if (res.data) {
                        applyApplicationState(res.data);
                    } else {
                        setView('form');
                    }
                })
                .catch(() => setView('form'));
        }
    }, []);

    function applyApplicationState(app) {
        if (!app) { setView('form'); return; }
        if (app.status === 'approved') {
            if (app.expires_at) {
                const diff = new Date(app.expires_at) - new Date();
                const days = Math.max(0, Math.ceil(diff / 86400000));
                setDaysLeft(days);
            }
            setView('approved');
        } else if (app.status === 'rejected') {
            setView('rejected');
        } else {
            setView('pending');
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!subject.trim()) { setError('Please tell us what you study.'); return; }
        setSubmitting(true);
        setError('');
        try {
            await api.post('/api/v1/beta/apply', {
                full_name: fullName.trim() || null,
                subject: subject.trim(),
                use_case: useCase.trim() || null,
            });
            setView('pending');
        } catch (err) {
            if (err.response?.status === 409) {
                setView('pending');
            } else {
                setError(err.response?.data?.detail || 'Something went wrong. Please try again.');
            }
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <>
            <style>{CSS}</style>
            <div className="bam-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
                <div className="bam-box">
                    <div className="bam-header">
                        <span className="bam-badge">
                            <span className="bam-badge-dot" />
                            Beta
                        </span>
                        <span className="bam-header-title">Join the Beta</span>
                        <button className="bam-close" onClick={onClose} aria-label="Close">&times;</button>
                    </div>

                    {view === 'loading' && (
                        <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'var(--color-muted, #a3a3a3)' }}>
                            Loading…
                        </div>
                    )}

                    {view === 'form' && (
                        <form className="bam-body" onSubmit={handleSubmit}>
                            <div className="bam-field">
                                <label className="bam-label">Your name</label>
                                <input
                                    className="bam-input"
                                    type="text"
                                    placeholder="Alex Johnson"
                                    value={fullName}
                                    onChange={e => setFullName(e.target.value)}
                                    maxLength={100}
                                />
                            </div>
                            <div className="bam-field">
                                <label className="bam-label">What do you study? *</label>
                                <input
                                    className="bam-input"
                                    type="text"
                                    placeholder="e.g. Computer Science, Medicine, Law…"
                                    value={subject}
                                    onChange={e => setSubject(e.target.value)}
                                    maxLength={120}
                                    required
                                />
                            </div>
                            <div className="bam-field">
                                <label className="bam-label">Why do you want access? (optional)</label>
                                <textarea
                                    className="bam-textarea"
                                    placeholder="Tell us how Neurativo would help you in your studies…"
                                    value={useCase}
                                    onChange={e => setUseCase(e.target.value)}
                                    maxLength={300}
                                />
                                <span className="bam-char">{useCase.length} / 300</span>
                            </div>
                            {error && <p className="bam-error">{error}</p>}
                            <button type="submit" className="bam-submit" disabled={submitting || !subject.trim()}>
                                {submitting ? 'Sending…' : 'Send Application →'}
                            </button>
                        </form>
                    )}

                    {view === 'pending' && (
                        <div className="bam-state">
                            <div className="bam-state-icon pending">⏳</div>
                            <div className="bam-state-title">Application received</div>
                            <p className="bam-state-sub">We'll review it within 24 hours and notify you by email.</p>
                            <button className="bam-btn-outline" onClick={onClose}>Got it</button>
                        </div>
                    )}

                    {view === 'approved' && (
                        <div className="bam-state">
                            <div className="bam-state-icon approved">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </div>
                            <div className="bam-state-title">You're in the beta!</div>
                            <p className="bam-state-sub">Student plan is active on your account.</p>
                            {daysLeft !== null && (
                                <p className="bam-state-days">{daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining</p>
                            )}
                            <a href="/app" className="bam-btn-outline">Open dashboard</a>
                        </div>
                    )}

                    {view === 'rejected' && (
                        <div className="bam-state">
                            <div className="bam-state-icon rejected">🙏</div>
                            <div className="bam-state-title">Thanks for applying</div>
                            <p className="bam-state-sub">All beta spots are filled for now. We'll keep your application on file for future rounds.</p>
                            <button className="bam-btn-outline" onClick={onClose}>Close</button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
