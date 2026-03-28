import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSignIn, useSignUp } from '@clerk/react';
import { Link } from 'react-router-dom';

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthModalCtx = createContext(null);
export function useAuthModal() { return useContext(AuthModalCtx); }

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  /* ── Backdrop ── */
  .am-backdrop {
    position: fixed; inset: 0; z-index: 9000;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
    animation: am-fade 0.15s ease both;
  }
  @keyframes am-fade { from { opacity: 0 } to { opacity: 1 } }

  /* ── Box ── */
  .am-box {
    position: relative;
    display: flex;
    width: 100%; max-width: 820px;
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 40px 100px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.06);
    animation: am-up 0.2s cubic-bezier(0.22,1,0.36,1) both;
    max-height: 90vh;
  }
  @keyframes am-up {
    from { opacity:0; transform: translateY(16px) scale(0.98) }
    to   { opacity:1; transform: none }
  }

  /* ── Left panel ── */
  .am-left {
    width: 40%; flex-shrink: 0;
    background: #111;
    display: flex; flex-direction: column;
    padding: 40px 44px;
    position: relative; overflow: hidden;
  }
  .am-left::before {
    content: ''; position: absolute; inset: 0;
    background-image: radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px);
    background-size: 22px 22px; pointer-events: none;
  }
  .am-left::after {
    content: ''; position: absolute;
    bottom: 0; left: 0; right: 0; height: 160px;
    background: linear-gradient(to top, #111 40%, transparent);
    pointer-events: none;
  }
  .am-left-logo {
    display: flex; align-items: center; gap: 9px;
    position: relative; z-index: 1;
  }
  .am-left-logo-box {
    width: 28px; height: 28px; border-radius: 8px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.1);
    display: flex; align-items: center; justify-content: center;
  }
  .am-left-logo-text {
    font-size: 14px; font-weight: 600;
    color: rgba(255,255,255,0.88); letter-spacing: -0.3px;
  }
  .am-left-body {
    flex: 1; display: flex; flex-direction: column;
    justify-content: center;
    position: relative; z-index: 1;
    padding: 32px 0;
  }
  .am-left-illo {
    font-family: Georgia, serif; font-size: 72px; line-height: 0.8;
    color: rgba(255,255,255,0.05); margin-left: -4px; margin-bottom: -6px;
    user-select: none;
  }
  .am-left-h {
    font-size: 26px; font-weight: 600; color: #fff;
    letter-spacing: -1.2px; line-height: 1.12; margin-bottom: 12px;
  }
  .am-left-sub {
    font-size: 13px; color: rgba(255,255,255,0.35);
    line-height: 1.7; margin-bottom: 28px;
  }
  .am-left-list { display: flex; flex-direction: column; gap: 10px; }
  .am-left-item {
    display: flex; align-items: flex-start; gap: 10px;
    font-size: 12px; color: rgba(255,255,255,0.42); line-height: 1.55;
  }
  .am-left-dot {
    width: 16px; height: 16px; border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.14);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-top: 1px;
  }
  .am-left-testimonial {
    position: relative; z-index: 1;
    border-top: 1px solid rgba(255,255,255,0.07);
    padding-top: 20px;
  }
  .am-left-quote {
    font-size: 12px; font-style: italic;
    color: rgba(255,255,255,0.32); line-height: 1.65; margin-bottom: 12px;
  }
  .am-left-attr { display: flex; align-items: center; gap: 9px; }
  .am-left-avatar {
    width: 24px; height: 24px; border-radius: 50%;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.1);
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 600; color: rgba(255,255,255,0.4);
  }
  .am-left-attr-name { font-size: 11px; color: rgba(255,255,255,0.26); }

  /* ── Right panel ── */
  .am-right {
    flex: 1; background: var(--color-bg, #fff);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 48px 44px; position: relative; overflow-y: auto;
  }
  .am-right::before {
    content: ''; position: absolute; top: 0; right: 0;
    width: 240px; height: 240px;
    background: radial-gradient(circle at top right, rgba(238,234,229,0.7) 0%, transparent 65%);
    pointer-events: none;
  }

  /* Close */
  .am-close {
    position: absolute; top: 16px; right: 16px; z-index: 2;
    width: 30px; height: 30px; border-radius: 8px;
    background: var(--color-border, #e8e4de);
    border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: #999; transition: background 0.12s, color 0.12s;
  }
  .am-close:hover { background: #d9d4cd; color: #444; }

  /* Form wrap */
  .am-form-wrap {
    width: 100%; max-width: 340px; position: relative; z-index: 1;
  }

  /* Eyebrow */
  .am-eyebrow {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 500; letter-spacing: 0.9px;
    text-transform: uppercase; color: #aaa; margin-bottom: 18px;
  }
  .am-eyebrow-dot {
    width: 5px; height: 5px; border-radius: 50%; background: #22c55e;
  }

  /* Heading */
  .am-heading {
    font-size: 26px; font-weight: 600;
    color: var(--color-text, #1a1a1a);
    letter-spacing: -1.1px; line-height: 1.1; margin-bottom: 6px;
  }
  .am-sub {
    font-size: 13px; color: var(--color-sec, #888);
    line-height: 1.6; margin-bottom: 28px;
  }

  /* Error */
  .am-error {
    padding: 10px 13px; border-radius: 10px;
    background: #fff5f5; border: 1px solid #fecaca;
    font-size: 12px; color: #dc2626;
    line-height: 1.5; margin-bottom: 16px;
  }

  /* Google button */
  .am-google-btn {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    width: 100%; padding: 12px 16px;
    background: var(--color-card, #fff);
    border: 1px solid var(--color-border, #e8e4de);
    border-radius: 11px; cursor: pointer;
    font-size: 13.5px; font-weight: 500;
    color: var(--color-text, #1a1a1a);
    font-family: 'Inter', sans-serif;
    transition: background 0.12s, border-color 0.12s;
    margin-bottom: 20px;
  }
  .am-google-btn:hover { background: var(--color-bg, #faf9f7); border-color: #c8c4be; }
  .am-google-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .am-google-icon { flex-shrink: 0; }

  /* Divider */
  .am-divider {
    display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
  }
  .am-divider-line { flex: 1; height: 1px; background: var(--color-border, #e8e4de); }
  .am-divider-txt { font-size: 11px; color: #ccc; }

  /* Label */
  .am-label {
    display: block; font-size: 11px; font-weight: 500;
    letter-spacing: 0.7px; text-transform: uppercase;
    color: #aaa; margin-bottom: 7px;
  }

  /* Input wrap */
  .am-input-wrap { position: relative; margin-bottom: 12px; }
  .am-input-icon {
    position: absolute; left: 13px; top: 50%; transform: translateY(-50%);
    color: #ccc; pointer-events: none; transition: color 0.12s;
  }
  .am-input-wrap:focus-within .am-input-icon { color: #888; }
  .am-input {
    display: block; width: 100%;
    padding: 12px 16px 12px 40px;
    border: 1px solid var(--color-border, #e8e4de);
    border-radius: 11px; font-size: 14px;
    color: var(--color-text, #1a1a1a);
    background: var(--color-card, #fff);
    outline: none; font-family: 'Inter', sans-serif;
    transition: border-color 0.12s, box-shadow 0.12s;
    -webkit-appearance: none;
  }
  .am-input::placeholder { color: #d0ccc7; }
  .am-input:focus {
    border-color: #1a1a1a;
    box-shadow: 0 0 0 3px rgba(26,26,26,0.07);
  }

  /* Submit button */
  .am-submit {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; padding: 13px 20px;
    background: #1a1a1a; color: #fafaf9;
    font-size: 14px; font-weight: 500;
    border: none; border-radius: 11px; cursor: pointer;
    font-family: 'Inter', sans-serif;
    transition: opacity 0.12s;
    margin-top: 4px;
  }
  .am-submit:hover:not(:disabled) { opacity: 0.82; }
  .am-submit:disabled { opacity: 0.38; cursor: not-allowed; }

  /* Spinner */
  .am-spinner {
    width: 14px; height: 14px;
    border: 2px solid rgba(250,250,249,0.25);
    border-top-color: #fafaf9;
    border-radius: 50%;
    animation: am-spin 0.6s linear infinite; flex-shrink: 0;
  }
  @keyframes am-spin { to { transform: rotate(360deg) } }

  /* Toggle */
  .am-toggle {
    margin-top: 22px; text-align: center;
    font-size: 13px; color: var(--color-sec, #888);
  }
  .am-toggle-btn {
    background: none; border: none; cursor: pointer;
    font-size: 13px; font-weight: 500;
    color: var(--color-text, #1a1a1a);
    font-family: 'Inter', sans-serif;
    text-decoration: underline; text-underline-offset: 2px;
    padding: 0; margin-left: 4px;
    transition: opacity 0.12s;
  }
  .am-toggle-btn:hover { opacity: 0.65; }

  /* Terms */
  .am-terms {
    margin-top: 18px; text-align: center;
    font-size: 11px; color: #c8c4be; line-height: 1.65;
  }
  .am-terms a { color: #aaa; text-decoration: underline; text-underline-offset: 2px; }
  .am-terms a:hover { color: var(--color-text, #1a1a1a); }

  /* ── Sent state ── */
  .am-sent { text-align: center; animation: am-up 0.3s cubic-bezier(0.22,1,0.36,1) both; }
  .am-sent-ring {
    width: 52px; height: 52px; border-radius: 50%;
    border: 1px solid var(--color-border, #e8e4de);
    background: var(--color-card, #fff);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 20px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.05);
  }
  .am-sent-h { font-size: 20px; font-weight: 600; letter-spacing: -0.6px; color: var(--color-text,#1a1a1a); margin-bottom: 8px; }
  .am-sent-p { font-size: 13px; color: var(--color-sec,#888); line-height: 1.65; margin-bottom: 6px; }
  .am-sent-email { font-weight: 500; color: var(--color-text,#1a1a1a); }
  .am-sent-divider { height: 1px; background: var(--color-border,#e8e4de); margin: 20px 0; }
  .am-resend {
    font-size: 13px; color: #aaa; background: none; border: none;
    cursor: pointer; font-family: 'Inter', sans-serif;
    text-decoration: underline; text-underline-offset: 2px;
    transition: color 0.12s;
  }
  .am-resend:hover { color: var(--color-text,#1a1a1a); }

  /* ── Mobile ── */
  @media (max-width: 600px) {
    .am-backdrop { align-items: flex-end; padding: 0; }
    .am-box { border-radius: 20px 20px 0 0; max-width: 100%; max-height: 88dvh; }
    .am-left { display: none; }
    .am-right { padding: 36px 24px 40px; }
  }
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const LogoIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
    </svg>
);

const CheckDot = () => (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
    </svg>
);

const CloseIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
);

const MailIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
    </svg>
);

const ArrowIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
);

const CheckIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
    </svg>
);

const GoogleIcon = () => (
    <svg className="am-google-icon" width="18" height="18" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
);

const BULLETS = [
    'Transcribed live — every word, as it happens',
    'Summaries built section by section, automatically',
    'Ask questions — AI answers from your own notes',
];

// ─── Sent state ───────────────────────────────────────────────────────────────
function SentState({ email, onReset }) {
    return (
        <div className="am-sent">
            <div className="am-sent-ring"><CheckIcon /></div>
            <h3 className="am-sent-h">Check your inbox</h3>
            <p className="am-sent-p">
                We sent a sign-in link to{' '}
                <span className="am-sent-email">{email}</span>.
                Click it to continue — no password needed.
            </p>
            <div className="am-sent-divider"/>
            <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>
                Didn't receive it? Check spam or
            </p>
            <button className="am-resend" onClick={onReset}>try a different email</button>
        </div>
    );
}

// ─── Auth form ────────────────────────────────────────────────────────────────
function AuthForm({ mode, onModeToggle }) {
    const { signIn, isLoaded: siLoaded } = useSignIn();
    const { signUp, isLoaded: suLoaded } = useSignUp();

    const [email,   setEmail]   = useState('');
    const [stage,   setStage]   = useState('idle');   // idle | sent
    const [loading, setLoading] = useState(false);
    const [gLoading, setGLoading] = useState(false);
    const [error,   setError]   = useState(null);

    // Reset to idle whenever mode changes
    useEffect(() => { setStage('idle'); setEmail(''); setError(null); }, [mode]);

    const handleEmail = async (e) => {
        e.preventDefault();
        if (!email.trim() || loading) return;
        setError(null);
        setLoading(true);
        try {
            if (mode === 'signin') {
                await signIn.create({
                    identifier: email.trim(),
                    strategy: 'email_link',
                    redirectUrl: `${window.location.origin}/app`,
                });
            } else {
                await signUp.create({ emailAddress: email.trim() });
                await signUp.prepareEmailAddressVerification({
                    strategy: 'email_link',
                    redirectUrl: `${window.location.origin}/app`,
                });
            }
            setStage('sent');
        } catch (err) {
            const code = err.errors?.[0]?.code;
            if (code === 'form_identifier_not_found') {
                setError('No account found with that email. Try signing up instead.');
            } else if (code === 'form_identifier_exists') {
                setError('Email already registered. Try signing in instead.');
            } else {
                setError(err.errors?.[0]?.longMessage || 'Something went wrong. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGoogle = async () => {
        if (gLoading) return;
        setError(null);
        setGLoading(true);
        try {
            // signIn handles both new + existing users via Google OAuth
            await signIn.authenticateWithRedirect({
                strategy: 'oauth_google',
                redirectUrl: `${window.location.origin}/sso-callback`,
                redirectUrlComplete: `${window.location.origin}/app`,
            });
        } catch (err) {
            setError(err.errors?.[0]?.longMessage || 'Google sign-in failed. Please try again.');
            setGLoading(false);
        }
    };

    const isReady = siLoaded && suLoaded;

    if (stage === 'sent') {
        return <SentState email={email} onReset={() => { setStage('idle'); setEmail(''); setError(null); }} />;
    }

    return (
        <div className="am-form-wrap">
            <div className="am-eyebrow">
                <span className="am-eyebrow-dot"/>
                {mode === 'signin' ? 'Welcome back' : 'Free to start'}
            </div>

            <h2 className="am-heading">
                {mode === 'signin' ? 'Sign in to\nNeurativo' : 'Create your\naccount'}
            </h2>
            <p className="am-sub">
                {mode === 'signin'
                    ? 'Enter your email — we\'ll send you a magic link.'
                    : 'New here? Just enter your email to get started.'}
            </p>

            {error && <div className="am-error">{error}</div>}

            {/* Google */}
            <button
                className="am-google-btn"
                onClick={handleGoogle}
                disabled={!isReady || gLoading}
                type="button"
            >
                {gLoading
                    ? <><div className="am-spinner" style={{ borderTopColor: '#888', borderColor: '#ddd' }}/> Connecting…</>
                    : <><GoogleIcon /> Continue with Google</>
                }
            </button>

            {/* Divider */}
            <div className="am-divider">
                <div className="am-divider-line"/>
                <span className="am-divider-txt">or</span>
                <div className="am-divider-line"/>
            </div>

            {/* Email form */}
            <form onSubmit={handleEmail}>
                <label className="am-label" htmlFor="am-email">Email address</label>
                <div className="am-input-wrap">
                    <span className="am-input-icon"><MailIcon/></span>
                    <input
                        id="am-email"
                        className="am-input"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@university.edu"
                        required
                        autoFocus
                        autoComplete="email"
                        disabled={!isReady || loading}
                    />
                </div>
                <button
                    type="submit"
                    className="am-submit"
                    disabled={!isReady || loading || !email.trim()}
                >
                    {loading
                        ? <><div className="am-spinner"/>Sending link…</>
                        : <>Continue with email <ArrowIcon/></>
                    }
                </button>
            </form>

            {/* Toggle */}
            <p className="am-toggle">
                {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
                <button className="am-toggle-btn" onClick={onModeToggle} type="button">
                    {mode === 'signin' ? 'Sign up' : 'Sign in'}
                </button>
            </p>

            {/* Terms */}
            <p className="am-terms">
                By continuing you agree to our{' '}
                <Link to="/terms">Terms of Service</Link> and{' '}
                <Link to="/privacy">Privacy Policy</Link>.
            </p>
        </div>
    );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────
function Modal({ initialMode, onClose }) {
    const [mode, setMode] = useState(initialMode);

    useEffect(() => { setMode(initialMode); }, [initialMode]);

    // Close on Escape
    useEffect(() => {
        const h = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);

    return (
        <>
            <style>{CSS}</style>
            <div
                className="am-backdrop"
                onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
            >
                <div className="am-box">

                    {/* Left branding panel */}
                    <div className="am-left">
                        <div className="am-left-logo">
                            <div className="am-left-logo-box"><LogoIcon/></div>
                            <span className="am-left-logo-text">Neurativo</span>
                        </div>
                        <div className="am-left-body">
                            <span className="am-left-illo">"</span>
                            <h2 className="am-left-h">
                                Never miss<br/>
                                what matters<br/>
                                in a lecture.
                            </h2>
                            <p className="am-left-sub">
                                Real-time transcription and AI summaries
                                that build as your professor speaks.
                            </p>
                            <div className="am-left-list">
                                {BULLETS.map(b => (
                                    <div key={b} className="am-left-item">
                                        <div className="am-left-dot"><CheckDot/></div>
                                        {b}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="am-left-testimonial">
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

                    {/* Right form panel */}
                    <div className="am-right">
                        <button className="am-close" onClick={onClose} aria-label="Close">
                            <CloseIcon/>
                        </button>
                        <AuthForm
                            mode={mode}
                            onModeToggle={() => setMode(m => m === 'signin' ? 'signup' : 'signin')}
                        />
                    </div>

                </div>
            </div>
        </>
    );
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthModalProvider({ children }) {
    const [state, setState] = useState({ open: false, mode: 'signin' });

    const openSignIn  = useCallback(() => setState({ open: true,  mode: 'signin' }), []);
    const openSignUp  = useCallback(() => setState({ open: true,  mode: 'signup' }), []);
    const closeModal  = useCallback(() => setState(s => ({ ...s, open: false })),    []);

    useEffect(() => {
        document.body.style.overflow = state.open ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [state.open]);

    return (
        <AuthModalCtx.Provider value={{ openSignIn, openSignUp, closeModal }}>
            {children}
            {state.open && (
                <Modal initialMode={state.mode} onClose={closeModal} />
            )}
        </AuthModalCtx.Provider>
    );
}
