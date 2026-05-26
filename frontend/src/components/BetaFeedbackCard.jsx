import React, { useState } from 'react';
import api from '../lib/api';

const CSS = `
  .bfc-wrap {
    position: fixed; bottom: 24px; right: 24px; z-index: 820;
    width: 300px;
    background: var(--color-card, #fff);
    border: 1px solid var(--color-border, #f0ede8);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.12);
    padding: 0;
    overflow: hidden;
    animation: bfc-slide-up 0.3s cubic-bezier(0.22,1,0.36,1);
    font-family: 'Inter', sans-serif;
  }
  @media (max-width: 420px) {
    .bfc-wrap { left: 12px; right: 12px; bottom: 12px; width: auto; border-radius: 14px; }
  }
  @keyframes bfc-slide-up {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .bfc-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px 10px;
    border-bottom: 1px solid var(--color-border, #f0ede8);
  }
  .bfc-title { font-size: 13px; font-weight: 600; color: var(--color-text, #1a1a1a); letter-spacing: -0.2px; }
  .bfc-close {
    width: 26px; height: 26px; border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    background: none; border: none; cursor: pointer;
    color: var(--color-muted, #a3a3a3); font-size: 16px; line-height: 1;
    transition: background 0.12s, color 0.12s; font-family: inherit; flex-shrink: 0;
  }
  .bfc-close:hover { background: var(--color-bg, #fafaf9); color: var(--color-text, #1a1a1a); }
  .bfc-body { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .bfc-stars { display: flex; gap: 4px; }
  .bfc-star {
    font-size: 22px; cursor: pointer; transition: transform 0.1s;
    color: #d1d5db; line-height: 1; background: none; border: none;
    padding: 0; font-family: inherit;
  }
  .bfc-star:hover, .bfc-star.active { color: #f59e0b; transform: scale(1.15); }
  .bfc-textarea {
    width: 100%; padding: 8px 10px;
    border: 1px solid var(--color-border, #f0ede8);
    border-radius: 9px; font-size: 12px; color: var(--color-text, #1a1a1a);
    background: var(--color-bg, #fafaf9); outline: none; font-family: inherit;
    resize: none; height: 56px; transition: border-color 0.15s; line-height: 1.55;
  }
  .bfc-textarea:focus { border-color: var(--color-border-hov, #c8c4be); }
  .bfc-textarea::placeholder { color: var(--color-muted, #a3a3a3); }
  .bfc-footer { display: flex; gap: 6px; padding: 0 14px 14px; }
  .bfc-btn-skip {
    flex: 1; padding: 8px 0; border: 1px solid var(--color-border, #f0ede8);
    border-radius: 9px; font-size: 12px; font-weight: 500;
    color: var(--color-sec, #6b6b6b); background: none;
    cursor: pointer; font-family: inherit; transition: border-color 0.15s;
  }
  .bfc-btn-skip:hover { border-color: var(--color-border-hov, #c8c4be); color: var(--color-text, #1a1a1a); }
  .bfc-btn-send {
    flex: 2; padding: 8px 0; border: none; border-radius: 9px;
    font-size: 12px; font-weight: 600;
    background: var(--color-dark, #1a1a1a); color: #fafaf9;
    cursor: pointer; font-family: inherit; transition: opacity 0.15s;
  }
  .bfc-btn-send:hover { opacity: 0.85; }
  .bfc-btn-send:disabled { opacity: 0.4; cursor: not-allowed; }
  .bfc-thanks {
    padding: 20px 14px; text-align: center;
    font-size: 13px; color: var(--color-sec, #6b6b6b);
    display: flex; flex-direction: column; align-items: center; gap: 8px;
  }
  .bfc-thanks-icon { font-size: 24px; }
  .bfc-thanks-title { font-size: 14px; font-weight: 600; color: var(--color-text, #1a1a1a); }
`;

export default function BetaFeedbackCard({ lectureId, onDismiss }) {
    const [rating, setRating] = useState(0);
    const [hovered, setHovered] = useState(0);
    const [comment, setComment] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    function dismiss() {
        localStorage.setItem('fbk_' + lectureId, '1');
        onDismiss();
    }

    async function handleSend() {
        if (!rating) return;
        setSending(true);
        try {
            await api.post('/api/v1/beta/feedback', {
                lecture_id: lectureId,
                rating,
                comment: comment.trim() || null,
            });
            localStorage.setItem('fbk_' + lectureId, '1');
            setSent(true);
            setTimeout(onDismiss, 1800);
        } catch {
            // silent — don't block UX on feedback failure
            dismiss();
        } finally {
            setSending(false);
        }
    }

    return (
        <>
            <style>{CSS}</style>
            <div className="bfc-wrap">
                {!sent ? (
                    <>
                        <div className="bfc-header">
                            <span className="bfc-title">How was this lecture?</span>
                            <button className="bfc-close" onClick={dismiss} aria-label="Close">&times;</button>
                        </div>
                        <div className="bfc-body">
                            <div className="bfc-stars">
                                {[1, 2, 3, 4, 5].map(n => (
                                    <button
                                        key={n}
                                        className={`bfc-star${(hovered || rating) >= n ? ' active' : ''}`}
                                        onMouseEnter={() => setHovered(n)}
                                        onMouseLeave={() => setHovered(0)}
                                        onClick={() => setRating(n)}
                                        aria-label={`${n} star${n !== 1 ? 's' : ''}`}
                                    >★</button>
                                ))}
                            </div>
                            <textarea
                                className="bfc-textarea"
                                placeholder="Any thoughts? (optional)"
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                maxLength={500}
                            />
                        </div>
                        <div className="bfc-footer">
                            <button className="bfc-btn-skip" onClick={dismiss}>Skip</button>
                            <button className="bfc-btn-send" onClick={handleSend} disabled={!rating || sending}>
                                {sending ? 'Sending…' : 'Send →'}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="bfc-thanks">
                        <span className="bfc-thanks-icon">🙏</span>
                        <div className="bfc-thanks-title">Thanks for your feedback!</div>
                        <p>It helps us improve Neurativo.</p>
                    </div>
                )}
            </div>
        </>
    );
}
