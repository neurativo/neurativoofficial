import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SignIn, SignUp } from '@clerk/react';

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthModalCtx = createContext(null);

export function useAuthModal() {
    return useContext(AuthModalCtx);
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  .am-backdrop {
    position: fixed; inset: 0; z-index: 9000;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
    animation: am-fade-in 0.18s ease both;
  }
  @keyframes am-fade-in { from { opacity: 0; } to { opacity: 1; } }

  .am-box {
    position: relative;
    display: flex;
    width: 100%;
    max-width: 860px;
    max-height: 90vh;
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 32px 80px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.08);
    animation: am-slide-up 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes am-slide-up { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: none; } }

  /* ── LEFT PANEL ── */
  .am-left {
    width: 42%;
    flex-shrink: 0;
    background: #1a1a1a;
    display: flex;
    flex-direction: column;
    padding: 40px 44px;
    position: relative;
    overflow: hidden;
  }
  .am-left::before {
    content: '';
    position: absolute; inset: 0;
    background-image: radial-gradient(circle, rgba(250,250,249,0.04) 1px, transparent 1px);
    background-size: 24px 24px;
    pointer-events: none;
  }
  .am-left::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 180px;
    background: linear-gradient(to top, #1a1a1a 30%, transparent);
    pointer-events: none;
  }

  .am-left-logo {
    display: flex; align-items: center; gap: 9px;
    position: relative; z-index: 1; flex-shrink: 0;
  }
  .am-left-logo-icon {
    width: 26px; height: 26px; border-radius: 7px;
    background: rgba(250,250,249,0.1);
    border: 1px solid rgba(250,250,249,0.1);
    display: flex; align-items: center; justify-content: center;
  }
  .am-left-wordmark {
    font-size: 14px; font-weight: 600;
    color: rgba(250,250,249,0.9); letter-spacing: -0.3px;
  }

  .am-left-body {
    flex: 1; display: flex; flex-direction: column;
    justify-content: center; position: relative; z-index: 1;
    padding: 36px 0 32px;
  }
  .am-left-mark {
    font-family: Georgia, serif; font-size: 80px; line-height: 0.8;
    color: rgba(250,250,249,0.055); margin-bottom: -4px; margin-left: -4px;
    user-select: none; display: block;
  }
  .am-left-h1 {
    font-size: 30px; font-weight: 600; color: #fafaf9;
    letter-spacing: -1.4px; line-height: 1.1; margin-bottom: 14px;
  }
  .am-left-sub {
    font-size: 13px; color: rgba(250,250,249,0.38);
    line-height: 1.7; max-width: 260px; margin-bottom: 32px;
  }
  .am-left-bullets { display: flex; flex-direction: column; gap: 11px; }
  .am-left-bullet {
    display: flex; align-items: flex-start; gap: 10px;
    font-size: 12px; color: rgba(250,250,249,0.45); line-height: 1.5;
  }
  .am-left-check {
    width: 15px; height: 15px; border-radius: 50%;
    border: 1px solid rgba(250,250,249,0.15);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-top: 1px;
  }

  .am-left-footer {
    position: relative; z-index: 1;
    border-top: 1px solid rgba(250,250,249,0.08); padding-top: 20px;
  }
  .am-left-quote {
    font-size: 12px; color: rgba(250,250,249,0.38);
    line-height: 1.65; font-style: italic; margin-bottom: 12px;
  }
  .am-left-attr { display: flex; align-items: center; gap: 9px; }
  .am-left-avatar {
    width: 24px; height: 24px; border-radius: 50%;
    background: rgba(250,250,249,0.08);
    border: 1px solid rgba(250,250,249,0.1);
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 600; color: rgba(250,250,249,0.4);
  }
  .am-left-attr-name { font-size: 11px; color: rgba(250,250,249,0.28); }

  /* ── RIGHT PANEL ── */
  .am-right {
    flex: 1;
    background: var(--color-bg, #fff);
    display: flex; align-items: center; justify-content: center;
    padding: 40px 36px;
    overflow-y: auto;
    position: relative;
  }
  .am-right::before {
    content: '';
    position: absolute; top: 0; right: 0;
    width: 260px; height: 260px;
    background: radial-gradient(circle at top right, rgba(240,237,232,0.85) 0%, transparent 70%);
    pointer-events: none;
  }

  /* Close button */
  .am-close {
    position: absolute; top: 14px; right: 14px; z-index: 10;
    width: 32px; height: 32px; border-radius: 8px;
    background: rgba(0,0,0,0.06); border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: #999; transition: background 0.15s, color 0.15s;
  }
  .am-close:hover { background: rgba(0,0,0,0.1); color: #444; }

  /* ── MOBILE ── */
  @media (max-width: 640px) {
    .am-backdrop { align-items: flex-end; padding: 0; }
    .am-box {
      flex-direction: column; border-radius: 20px 20px 0 0;
      max-height: 92dvh; max-width: 100%;
    }
    .am-left { display: none; }
    .am-right { padding: 32px 24px 40px; }
  }
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const LogoIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(250,250,249,0.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
    </svg>
);

const BulletCheck = () => (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(250,250,249,0.4)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
    </svg>
);

const CloseIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
);

// Clerk appearance config — matches Neurativo's design
const clerkAppearance = {
    variables: {
        colorPrimary: '#1a1a1a',
        colorTextOnPrimaryBackground: '#fafaf9',
        colorBackground: 'transparent',
        colorInputBackground: 'var(--color-card, #fff)',
        colorInputText: 'var(--color-text, #1a1a1a)',
        borderRadius: '11px',
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
    },
    elements: {
        card: { boxShadow: 'none', background: 'transparent', padding: 0 },
        headerTitle: { fontSize: '26px', fontWeight: '600', letterSpacing: '-1px', color: 'var(--color-text, #1a1a1a)' },
        headerSubtitle: { color: 'var(--color-sec, #888)', fontSize: '13px' },
        formButtonPrimary: {
            background: '#1a1a1a', color: '#fafaf9', fontSize: '14px',
            fontWeight: '500', borderRadius: '11px', padding: '13px 20px',
            '&:hover': { opacity: 0.84 },
        },
        formFieldInput: {
            borderRadius: '11px', fontSize: '14px',
            border: '1px solid var(--color-border, #e8e4de)',
            background: 'var(--color-card, #fff)',
            color: 'var(--color-text, #1a1a1a)',
        },
        footerActionLink: { color: '#1a1a1a', fontWeight: '500' },
        dividerLine: { background: 'var(--color-border, #e8e4de)' },
        dividerText: { color: 'var(--color-sec, #aaa)', fontSize: '12px' },
        socialButtonsBlockButton: {
            border: '1px solid var(--color-border, #e8e4de)',
            borderRadius: '11px', fontSize: '13px',
        },
        identityPreviewText: { color: 'var(--color-text, #1a1a1a)' },
    },
};

const BULLETS = [
    'Transcribed live — every word, as it happens',
    'Summaries built section by section, automatically',
    'Ask questions — AI answers from your own notes',
];

// ─── Modal UI ─────────────────────────────────────────────────────────────────
function Modal({ mode, onClose }) {
    // Close on Escape
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <>
            <style>{CSS}</style>
            <div className="am-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
                <div className="am-box">

                    {/* ── LEFT PANEL ── */}
                    <div className="am-left">
                        <div className="am-left-logo">
                            <div className="am-left-logo-icon"><LogoIcon /></div>
                            <span className="am-left-wordmark">Neurativo</span>
                        </div>
                        <div className="am-left-body">
                            <span className="am-left-mark">"</span>
                            <h2 className="am-left-h1">
                                Never miss<br />
                                what matters<br />
                                in a lecture.
                            </h2>
                            <p className="am-left-sub">
                                Real-time transcription and AI summaries
                                that build as your professor speaks.
                            </p>
                            <div className="am-left-bullets">
                                {BULLETS.map(b => (
                                    <div key={b} className="am-left-bullet">
                                        <div className="am-left-check"><BulletCheck /></div>
                                        {b}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="am-left-footer">
                            <p className="am-left-quote">
                                "I stopped worrying about missing key points halfway
                                through my first lecture. Neurativo just handles it."
                            </p>
                            <div className="am-left-attr">
                                <div className="am-left-avatar">A</div>
                                <span className="am-left-attr-name">Alex M. · 3rd year Biology</span>
                            </div>
                        </div>
                    </div>

                    {/* ── RIGHT PANEL ── */}
                    <div className="am-right">
                        <button className="am-close" onClick={onClose} aria-label="Close">
                            <CloseIcon />
                        </button>

                        {mode === 'signup' ? (
                            <SignUp
                                routing="virtual"
                                afterSignUpUrl="/app"
                                appearance={clerkAppearance}
                            />
                        ) : (
                            <SignIn
                                routing="virtual"
                                afterSignInUrl="/app"
                                appearance={clerkAppearance}
                            />
                        )}
                    </div>

                </div>
            </div>
        </>
    );
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthModalProvider({ children }) {
    const [state, setState] = useState({ open: false, mode: 'signin' });

    const openSignIn  = useCallback(() => setState({ open: true, mode: 'signin' }), []);
    const openSignUp  = useCallback(() => setState({ open: true, mode: 'signup' }), []);
    const closeModal  = useCallback(() => setState(s => ({ ...s, open: false })), []);

    // Lock body scroll while open
    useEffect(() => {
        if (state.open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [state.open]);

    return (
        <AuthModalCtx.Provider value={{ openSignIn, openSignUp, closeModal }}>
            {children}
            {state.open && <Modal mode={state.mode} onClose={closeModal} />}
        </AuthModalCtx.Provider>
    );
}
