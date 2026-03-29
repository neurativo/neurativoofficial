import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSignIn, useSignUp } from '@clerk/react';
import { Link } from 'react-router-dom';

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthModalCtx = createContext(null);
export function useAuthModal() { return useContext(AuthModalCtx); }

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  .am * { box-sizing: border-box; margin: 0; padding: 0; }

  /* Backdrop */
  .am-backdrop {
    position: fixed; inset: 0; z-index: 9000;
    background: rgba(0,0,0,0.48);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    animation: am-fade 0.16s ease both;
  }
  @keyframes am-fade { from { opacity: 0 } to { opacity: 1 } }

  /* Modal box */
  .am-box {
    position: relative;
    display: flex;
    width: 100%; max-width: 800px;
    border-radius: 20px; overflow: hidden;
    box-shadow: 0 32px 80px rgba(0,0,0,0.26), 0 0 0 1px rgba(0,0,0,0.07);
    animation: am-up 0.22s cubic-bezier(0.22,1,0.36,1) both;
    max-height: min(88vh, 680px);
  }
  @keyframes am-up {
    from { opacity:0; transform: translateY(14px) scale(0.985) }
    to   { opacity:1; transform: none }
  }

  /* ── Left panel ── */
  .am-left {
    width: 380px; flex-shrink: 0;
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
    bottom: 0; left: 0; right: 0; height: 140px;
    background: linear-gradient(to top, #111 40%, transparent);
    pointer-events: none;
  }
  .am-logo {
    display: flex; align-items: center; gap: 9px;
    position: relative; z-index: 1;
  }
  .am-logo-box {
    width: 28px; height: 28px; border-radius: 8px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.1);
    display: flex; align-items: center; justify-content: center;
  }
  .am-logo-text {
    font-size: 14px; font-weight: 600;
    color: rgba(255,255,255,0.88); letter-spacing: -0.3px;
  }
  .am-left-body {
    flex: 1; display: flex; flex-direction: column;
    justify-content: center; position: relative; z-index: 1; padding: 28px 0;
  }
  .am-illo {
    font-family: Georgia, serif; font-size: 64px; line-height: 0.8;
    color: rgba(255,255,255,0.05); margin-left: -3px; margin-bottom: -4px;
    user-select: none;
  }
  .am-left-h {
    font-size: 24px; font-weight: 600; color: #fff;
    letter-spacing: -1.1px; line-height: 1.13; margin-bottom: 11px;
  }
  .am-left-sub {
    font-size: 12.5px; color: rgba(255,255,255,0.35);
    line-height: 1.7; margin-bottom: 26px;
  }
  .am-list { display: flex; flex-direction: column; gap: 9px; }
  .am-list-item {
    display: flex; align-items: flex-start; gap: 9px;
    font-size: 12px; color: rgba(255,255,255,0.42); line-height: 1.55;
  }
  .am-list-dot {
    width: 15px; height: 15px; border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.13);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-top: 1px;
  }
  .am-testimonial {
    position: relative; z-index: 1;
    border-top: 1px solid rgba(255,255,255,0.07); padding-top: 18px;
  }
  .am-quote {
    font-size: 12px; font-style: italic;
    color: rgba(255,255,255,0.3); line-height: 1.65; margin-bottom: 11px;
  }
  .am-attr { display: flex; align-items: center; gap: 8px; }
  .am-avatar {
    width: 22px; height: 22px; border-radius: 50%;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.1);
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 600; color: rgba(255,255,255,0.38);
  }
  .am-attr-name { font-size: 11px; color: rgba(255,255,255,0.25); }

  /* ── Right panel ── */
  .am-right {
    flex: 1; min-width: 0;
    background: var(--color-bg, #fff);
    display: flex; align-items: center; justify-content: center;
    padding: 48px 44px;
    position: relative; overflow-y: auto;
  }
  .am-right::before {
    content: ''; position: absolute; top: 0; right: 0;
    width: 220px; height: 220px;
    background: radial-gradient(circle at top right, rgba(238,234,229,0.65) 0%, transparent 65%);
    pointer-events: none;
  }

  /* Close button */
  .am-close {
    position: absolute; top: 14px; right: 14px; z-index: 10;
    width: 30px; height: 30px; border-radius: 8px;
    background: var(--color-border, #e8e4de);
    border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: #999; transition: background 0.12s, color 0.12s;
  }
  .am-close:hover { background: #d5d0c9; color: #444; }

  /* Form */
  .am-form { width: 100%; max-width: 320px; position: relative; z-index: 1; }

  .am-eyebrow {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 10.5px; font-weight: 500; letter-spacing: 0.8px;
    text-transform: uppercase; color: #aaa; margin-bottom: 16px;
  }
  .am-eyebrow-dot { width: 5px; height: 5px; border-radius: 50%; background: #22c55e; }

  .am-h {
    font-size: 24px; font-weight: 600;
    color: var(--color-text, #1a1a1a);
    letter-spacing: -1px; line-height: 1.12; margin-bottom: 6px;
  }
  .am-desc {
    font-size: 13px; color: var(--color-sec, #888);
    line-height: 1.6; margin-bottom: 24px;
  }

  /* Error */
  .am-err {
    padding: 10px 13px; border-radius: 10px; margin-bottom: 14px;
    background: #fff5f5; border: 1px solid #fecaca;
    font-size: 12px; color: #dc2626; line-height: 1.5;
  }

  /* Google button */
  .am-google {
    width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;
    padding: 11px 16px;
    background: var(--color-card, #fff);
    border: 1.5px solid var(--color-border, #e2ddd8);
    border-radius: 11px; cursor: pointer;
    font-size: 13.5px; font-weight: 500;
    color: var(--color-text, #1a1a1a);
    font-family: 'Inter', sans-serif;
    transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
    margin-bottom: 18px;
    -webkit-appearance: none;
  }
  .am-google:hover:not(:disabled) {
    background: var(--color-bg, #faf9f8);
    border-color: #bbb8b4;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  .am-google:active:not(:disabled) { transform: scale(0.995); }
  .am-google:disabled { opacity: 0.45; cursor: not-allowed; }

  /* Divider */
  .am-div {
    display: flex; align-items: center; gap: 10px; margin-bottom: 18px;
  }
  .am-div-line { flex: 1; height: 1px; background: var(--color-border, #e8e4de); }
  .am-div-txt { font-size: 11px; color: #ccc; white-space: nowrap; }

  /* Label */
  .am-label {
    display: block; font-size: 11px; font-weight: 500;
    letter-spacing: 0.7px; text-transform: uppercase;
    color: #aaa; margin-bottom: 6px;
  }

  /* Input */
  .am-inp-wrap { position: relative; margin-bottom: 10px; }
  .am-inp-icon {
    position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
    color: #ccc; pointer-events: none; transition: color 0.12s;
  }
  .am-inp-wrap:focus-within .am-inp-icon { color: #777; }
  .am-input {
    display: block; width: 100%;
    padding: 11px 14px 11px 38px;
    border: 1.5px solid var(--color-border, #e2ddd8);
    border-radius: 11px; font-size: 14px;
    color: var(--color-text, #1a1a1a);
    background: var(--color-card, #fff);
    outline: none; font-family: 'Inter', sans-serif;
    transition: border-color 0.12s, box-shadow 0.12s;
    -webkit-appearance: none;
  }
  .am-input::placeholder { color: #ccc; }
  .am-input:focus {
    border-color: #1a1a1a;
    box-shadow: 0 0 0 3px rgba(26,26,26,0.07);
  }
  .am-input:disabled { opacity: 0.5; }

  /* Submit */
  .am-submit {
    width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 12px 20px; margin-top: 4px;
    background: #1a1a1a; color: #fafaf9;
    font-size: 14px; font-weight: 500;
    border: none; border-radius: 11px; cursor: pointer;
    font-family: 'Inter', sans-serif; letter-spacing: -0.1px;
    transition: opacity 0.12s, transform 0.1s;
    -webkit-appearance: none;
  }
  .am-submit:hover:not(:disabled) { opacity: 0.82; }
  .am-submit:active:not(:disabled) { transform: scale(0.99); }
  .am-submit:disabled { opacity: 0.35; cursor: not-allowed; }

  /* Spinner */
  .am-spin {
    width: 13px; height: 13px; border-radius: 50%; flex-shrink: 0;
    border: 2px solid rgba(255,255,255,0.22);
    border-top-color: #fafaf9;
    animation: am-spinner 0.6s linear infinite;
  }
  .am-spin-dark {
    border-color: rgba(0,0,0,0.1);
    border-top-color: #666;
  }
  @keyframes am-spinner { to { transform: rotate(360deg) } }

  /* Toggle */
  .am-toggle {
    margin-top: 20px; text-align: center;
    font-size: 13px; color: var(--color-sec, #888);
  }
  .am-toggle-btn {
    background: none; border: none; cursor: pointer; padding: 0; margin-left: 4px;
    font-size: 13px; font-weight: 500;
    color: var(--color-text, #1a1a1a);
    font-family: 'Inter', sans-serif;
    text-decoration: underline; text-underline-offset: 2px;
    transition: opacity 0.12s;
  }
  .am-toggle-btn:hover { opacity: 0.6; }

  /* Terms */
  .am-terms {
    margin-top: 16px; text-align: center;
    font-size: 11px; color: #c8c4be; line-height: 1.65;
  }
  .am-terms a { color: #aaa; text-decoration: underline; text-underline-offset: 2px; }
  .am-terms a:hover { color: var(--color-text, #1a1a1a); }

  /* Sent state */
  .am-sent { text-align: center; }
  .am-sent-ring {
    width: 50px; height: 50px; border-radius: 50%;
    border: 1px solid var(--color-border, #e8e4de);
    background: var(--color-card, #fff);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 18px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  }
  .am-sent-h {
    font-size: 19px; font-weight: 600; letter-spacing: -0.5px;
    color: var(--color-text,#1a1a1a); margin-bottom: 8px;
  }
  .am-sent-p { font-size: 13px; color: var(--color-sec,#888); line-height: 1.65; margin-bottom: 6px; }
  .am-sent-email { font-weight: 500; color: var(--color-text,#1a1a1a); }
  .am-sent-hr { height: 1px; background: var(--color-border,#e8e4de); margin: 18px 0; }
  .am-resend {
    font-size: 13px; color: #aaa; background: none; border: none;
    cursor: pointer; font-family: 'Inter', sans-serif;
    text-decoration: underline; text-underline-offset: 2px;
    transition: color 0.12s;
  }
  .am-resend:hover { color: var(--color-text,#1a1a1a); }

  /* ─── Responsive ─── */

  /* Hide left panel on narrow screens */
  @media (max-width: 700px) {
    .am-left { display: none; }
    .am-box { max-width: 440px; }
    .am-right { padding: 44px 36px; }
  }

  /* Mobile bottom sheet */
  @media (max-width: 480px) {
    .am-backdrop {
      align-items: flex-end;
      padding: 0;
    }
    .am-box {
      border-radius: 20px 20px 0 0;
      max-width: 100%;
      max-height: 92dvh;
    }
    .am-right {
      padding: 36px 24px 44px;
      align-items: flex-start;
      justify-content: flex-start;
    }
    .am-form { max-width: 100%; }
    .am-h { font-size: 22px; }
    .am-close { top: 12px; right: 12px; }
  }

  /* Very small screens */
  @media (max-width: 360px) {
    .am-right { padding: 30px 20px 40px; }
  }

  /* Large screens — give left panel more breathing room */
  @media (min-width: 900px) {
    .am-box { max-width: 860px; }
    .am-left { width: 400px; padding: 44px 48px; }
    .am-right { padding: 52px 48px; }
    .am-left-h { font-size: 26px; }
    .am-illo { font-size: 72px; }
  }
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const LogoSVG = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="rgba(255,255,255,0.85)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
    </svg>
);
const CheckSmall = () => (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none"
        stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
    </svg>
);
const CloseX = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
);
const MailSVG = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
    </svg>
);
const ArrowRight = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
);
const CheckLarge = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
    </svg>
);
const GoogleSVG = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
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
            <div className="am-sent-ring"><CheckLarge /></div>
            <h3 className="am-sent-h">Check your inbox</h3>
            <p className="am-sent-p">
                We sent a sign-in link to{' '}
                <span className="am-sent-email">{email}</span>.{' '}
                Click it to continue — no password needed.
            </p>
            <div className="am-sent-hr" />
            <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>
                Didn't get it? Check spam or
            </p>
            <button className="am-resend" onClick={onReset}>try a different email</button>
        </div>
    );
}

// ─── Auth form ────────────────────────────────────────────────────────────────
function AuthForm({ mode, onToggle }) {
    const { signIn, isLoaded: signInLoaded } = useSignIn();
    const { signUp, isLoaded: signUpLoaded  } = useSignUp();

    const [email,    setEmail]    = useState('');
    const [stage,    setStage]    = useState('idle');
    const [loading,  setLoading]  = useState(false);
    const [gLoading, setGLoading] = useState(false);
    const [error,    setError]    = useState(null);

    useEffect(() => {
        setStage('idle'); setEmail(''); setError(null);
    }, [mode]);

    // ── Google OAuth — Clerk v6 uses signIn.sso() ─────────────────────────────
    const handleGoogle = async () => {
        if (gLoading) return;
        setError(null);
        setGLoading(true);
        try {
            if (!signIn) throw new Error('Auth not ready — please refresh and try again.');
            const { error: ssoErr } = await signIn.sso({
                strategy: 'oauth_google',
                redirectUrl: `${window.location.origin}/sso-callback`,
            });
            if (ssoErr) throw ssoErr;
            // page will redirect — gLoading stays true intentionally
        } catch (err) {
            console.error('[Neurativo] Google OAuth error:', err);
            const msg =
                err?.longMessage ||
                err?.errors?.[0]?.longMessage ||
                err?.errors?.[0]?.message ||
                err?.message ||
                'Google sign-in failed. Please try again.';
            setError(msg);
            setGLoading(false);
        }
    };

    // ── Email magic link — Clerk v6 API ───────────────────────────────────────
    const handleEmail = async (e) => {
        e.preventDefault();
        if (!email.trim() || loading) return;
        setError(null);
        setLoading(true);
        try {
            if (mode === 'signin') {
                // v6: create sign-in then send link via emailLink.sendLink()
                await signIn.create({ identifier: email.trim() });
                const { error: linkErr } = await signIn.emailLink.sendLink({
                    verificationUrl: `${window.location.origin}/app`,
                    emailAddress: email.trim(),
                });
                if (linkErr) throw linkErr;
            } else {
                // v6: create sign-up then call signUp.sendEmailLink()
                const { error: createErr } = await signUp.create({ emailAddress: email.trim() });
                if (createErr) throw createErr;
                const { error: linkErr } = await signUp.sendEmailLink({
                    verificationUrl: `${window.location.origin}/app`,
                });
                if (linkErr) throw linkErr;
            }
            setStage('sent');
        } catch (err) {
            console.error('[Neurativo] Email link error:', err);
            const code = err?.code || err?.errors?.[0]?.code;
            if (code === 'form_identifier_not_found') {
                setError('No account found with that email. Try signing up instead.');
            } else if (code === 'form_identifier_exists') {
                setError('Email already registered. Try signing in instead.');
            } else {
                const msg =
                    err?.longMessage ||
                    err?.errors?.[0]?.longMessage ||
                    err?.message ||
                    'Something went wrong. Please try again.';
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    };

    if (stage === 'sent') {
        return (
            <div className="am-form">
                <SentState email={email} onReset={() => { setStage('idle'); setEmail(''); setError(null); }} />
            </div>
        );
    }

    return (
        <div className="am-form">
            <div className="am-eyebrow">
                <span className="am-eyebrow-dot" />
                {mode === 'signin' ? 'Welcome back' : 'Free to start'}
            </div>

            <h2 className="am-h">
                {mode === 'signin' ? <>Sign in to<br />Neurativo</> : <>Create your<br />account</>}
            </h2>
            <p className="am-desc">
                {mode === 'signin'
                    ? "Enter your email — we'll send you a magic link."
                    : "Just enter your email to get started. No password needed."}
            </p>

            {error && <div className="am-err">{error}</div>}

            {/* Google */}
            <button
                className="am-google"
                type="button"
                onClick={handleGoogle}
                disabled={gLoading}
            >
                {gLoading
                    ? <><div className="am-spin am-spin-dark" /> Connecting to Google…</>
                    : <><GoogleSVG /> Continue with Google</>
                }
            </button>

            {/* Divider */}
            <div className="am-div">
                <div className="am-div-line" />
                <span className="am-div-txt">or continue with email</span>
                <div className="am-div-line" />
            </div>

            {/* Email form */}
            <form onSubmit={handleEmail} noValidate>
                <label className="am-label" htmlFor="am-email">Email address</label>
                <div className="am-inp-wrap">
                    <span className="am-inp-icon"><MailSVG /></span>
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
                        disabled={loading}
                    />
                </div>

                <button
                    type="submit"
                    className="am-submit"
                    disabled={loading || !email.trim()}
                >
                    {loading
                        ? <><div className="am-spin" /> Sending link…</>
                        : <>{mode === 'signin' ? 'Sign in with email' : 'Create account'} <ArrowRight /></>
                    }
                </button>
            </form>

            {/* Mode toggle */}
            <p className="am-toggle">
                {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
                <button className="am-toggle-btn" type="button" onClick={onToggle}>
                    {mode === 'signin' ? 'Sign up free' : 'Sign in'}
                </button>
            </p>

            <p className="am-terms">
                By continuing you agree to our{' '}
                <Link to="/terms">Terms</Link> and{' '}
                <Link to="/privacy">Privacy Policy</Link>.
            </p>
        </div>
    );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────
function Modal({ initialMode, onClose }) {
    const [mode, setMode] = useState(initialMode);

    useEffect(() => { setMode(initialMode); }, [initialMode]);

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div className="am">
            <style>{CSS}</style>
            <div
                className="am-backdrop"
                onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
            >
                <div className="am-box">

                    {/* Left branding */}
                    <div className="am-left">
                        <div className="am-logo">
                            <div className="am-logo-box"><LogoSVG /></div>
                            <span className="am-logo-text">Neurativo</span>
                        </div>
                        <div className="am-left-body">
                            <span className="am-illo">"</span>
                            <h2 className="am-left-h">
                                Never miss<br />
                                what matters<br />
                                in a lecture.
                            </h2>
                            <p className="am-left-sub">
                                Real-time transcription and AI summaries
                                that build as your professor speaks.
                            </p>
                            <div className="am-list">
                                {BULLETS.map(b => (
                                    <div key={b} className="am-list-item">
                                        <div className="am-list-dot"><CheckSmall /></div>
                                        {b}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="am-testimonial">
                            <p className="am-quote">
                                "I stopped worrying about missing key points halfway
                                through my first lecture. Neurativo just handles it."
                            </p>
                            <div className="am-attr">
                                <div className="am-avatar">A</div>
                                <span className="am-attr-name">Alex M. · 3rd year Biology</span>
                            </div>
                        </div>
                    </div>

                    {/* Right form */}
                    <div className="am-right">
                        <button className="am-close" onClick={onClose} aria-label="Close">
                            <CloseX />
                        </button>
                        <AuthForm
                            mode={mode}
                            onToggle={() => setMode(m => m === 'signin' ? 'signup' : 'signin')}
                        />
                    </div>

                </div>
            </div>
        </div>
    );
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthModalProvider({ children }) {
    const [state, setState] = useState({ open: false, mode: 'signin' });

    const openSignIn = useCallback(() => setState({ open: true, mode: 'signin' }), []);
    const openSignUp = useCallback(() => setState({ open: true, mode: 'signup' }), []);
    const closeModal = useCallback(() => setState(s => ({ ...s, open: false })), []);

    useEffect(() => {
        document.body.style.overflow = state.open ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [state.open]);

    return (
        <AuthModalCtx.Provider value={{ openSignIn, openSignUp, closeModal }}>
            {children}
            {state.open && <Modal initialMode={state.mode} onClose={closeModal} />}
        </AuthModalCtx.Provider>
    );
}
