import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSEO } from '../lib/useSEO';

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  .au *, .au *::before, .au *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .au {
    height: 100vh;
    max-height: 100vh;
    display: flex;
    font-family: 'Inter', sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }

  /* ── LEFT PANEL ── */
  .au-left {
    width: 44%;
    flex-shrink: 0;
    background: #1a1a1a;
    display: flex;
    flex-direction: column;
    padding: 44px 52px;
    position: relative;
    overflow: hidden;
    height: 100vh;
  }

  /* Dot-grid texture */
  .au-left::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, rgba(250,250,249,0.04) 1px, transparent 1px);
    background-size: 24px 24px;
    pointer-events: none;
  }

  /* Vignette bottom */
  .au-left::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 220px;
    background: linear-gradient(to top, #1a1a1a 30%, transparent);
    pointer-events: none;
    z-index: 0;
  }

  .au-left-logo {
    display: flex;
    align-items: center;
    gap: 9px;
    text-decoration: none;
    position: relative;
    z-index: 1;
    flex-shrink: 0;
  }
  .au-left-logo-icon {
    width: 26px; height: 26px;
    border-radius: 7px;
    background: rgba(250,250,249,0.1);
    border: 1px solid rgba(250,250,249,0.1);
    display: flex; align-items: center; justify-content: center;
  }
  .au-left-wordmark {
    font-size: 14px; font-weight: 600;
    color: rgba(250,250,249,0.9);
    letter-spacing: -0.3px;
  }

  .au-left-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
    z-index: 1;
    padding: 48px 0 40px;
  }

  .au-left-mark {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 96px;
    line-height: 0.8;
    color: rgba(250,250,249,0.055);
    margin-bottom: -4px;
    margin-left: -5px;
    user-select: none;
    display: block;
  }

  .au-left-h1 {
    font-size: 40px;
    font-weight: 600;
    color: #fafaf9;
    letter-spacing: -1.8px;
    line-height: 1.09;
    margin-bottom: 18px;
  }

  .au-left-sub {
    font-size: 14px;
    color: rgba(250,250,249,0.4);
    line-height: 1.7;
    max-width: 310px;
    margin-bottom: 40px;
  }

  .au-left-bullets {
    display: flex;
    flex-direction: column;
    gap: 13px;
  }

  .au-left-bullet {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    font-size: 13px;
    color: rgba(250,250,249,0.5);
    line-height: 1.5;
  }

  .au-left-check {
    width: 16px; height: 16px;
    border-radius: 50%;
    border: 1px solid rgba(250,250,249,0.15);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .au-left-testimonial {
    position: relative;
    z-index: 1;
    border-top: 1px solid rgba(250,250,249,0.08);
    padding-top: 24px;
  }

  .au-left-quote {
    font-size: 13px;
    color: rgba(250,250,249,0.42);
    line-height: 1.65;
    font-style: italic;
    margin-bottom: 14px;
  }

  .au-left-attr {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .au-left-avatar {
    width: 26px; height: 26px;
    border-radius: 50%;
    background: rgba(250,250,249,0.08);
    border: 1px solid rgba(250,250,249,0.1);
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 600;
    color: rgba(250,250,249,0.4);
    flex-shrink: 0;
  }

  .au-left-attr-name {
    font-size: 12px;
    color: rgba(250,250,249,0.3);
    letter-spacing: 0;
  }

  /* ── RIGHT PANEL ── */
  .au-right {
    flex: 1;
    background: var(--color-bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 40px;
    position: relative;
    height: 100vh;
    overflow: hidden;
  }

  /* Subtle warm gradient top-right — clipped by overflow:hidden on parent */
  .au-right::before {
    content: '';
    position: absolute;
    top: 0; right: 0;
    width: 320px; height: 320px;
    background: radial-gradient(circle at top right, rgba(240,237,232,0.9) 0%, transparent 70%);
    pointer-events: none;
  }

  .au-back {
    position: absolute;
    top: 28px; left: 32px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #c8c4be;
    text-decoration: none;
    transition: color 0.15s;
    z-index: 1;
  }
  .au-back:hover { color: var(--color-text); }

  /* Mobile-only logo */
  .au-mobile-logo {
    display: none;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    margin-bottom: 36px;
    align-self: flex-start;
  }
  .au-mobile-logo-icon {
    width: 26px; height: 26px;
    border-radius: 7px;
    background: var(--color-dark);
    display: flex; align-items: center; justify-content: center;
  }
  .au-mobile-wordmark {
    font-size: 14px; font-weight: 600;
    color: var(--color-text); letter-spacing: -0.3px;
  }

  .au-form-wrap {
    width: 100%;
    max-width: 368px;
    position: relative;
    z-index: 1;
    animation: au-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes au-up {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Eyebrow */
  .au-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #a3a3a3;
    margin-bottom: 20px;
  }
  .au-eyebrow-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: #22c55e;
  }

  /* Heading */
  .au-h2 {
    font-size: 30px;
    font-weight: 600;
    color: var(--color-text);
    letter-spacing: -1.2px;
    line-height: 1.1;
    margin-bottom: 10px;
  }

  .au-sub {
    font-size: 14px;
    color: var(--color-sec);
    line-height: 1.65;
    margin-bottom: 36px;
    max-width: 320px;
  }

  /* Form */
  .au-field {
    margin-bottom: 14px;
  }

  .au-label {
    display: block;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #a3a3a3;
    margin-bottom: 7px;
  }

  .au-input-wrap {
    position: relative;
  }

  .au-input-icon {
    position: absolute;
    left: 13px;
    top: 50%;
    transform: translateY(-50%);
    color: #c8c4be;
    pointer-events: none;
    transition: color 0.15s;
  }

  .au-input {
    display: block;
    width: 100%;
    padding: 13px 16px 13px 40px;
    border: 1px solid var(--color-border);
    border-radius: 11px;
    font-size: 14px;
    color: var(--color-text);
    background: var(--color-card);
    outline: none;
    font-family: 'Inter', sans-serif;
    transition: border-color 0.15s, box-shadow 0.15s;
    -webkit-appearance: none;
    appearance: none;
  }
  .au-input::placeholder { color: #d0ccc7; }
  .au-input:focus {
    border-color: var(--color-dark);
    box-shadow: 0 0 0 3px rgba(26,26,26,0.07);
  }
  .au-input:focus + .au-input-focus-icon { color: #6b6b6b; }

  .au-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 14px 20px;
    background: var(--color-dark);
    color: var(--color-dark-fg);
    font-size: 14px;
    font-weight: 500;
    border: none;
    border-radius: 11px;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    letter-spacing: -0.1px;
    transition: opacity 0.15s, transform 0.1s;
    margin-top: 6px;
  }
  .au-btn:hover:not(:disabled) { opacity: 0.84; }
  .au-btn:active:not(:disabled) { transform: scale(0.99); }
  .au-btn:disabled { opacity: 0.38; cursor: not-allowed; }

  .au-spinner {
    width: 14px; height: 14px;
    border: 2px solid rgba(250,250,249,0.25);
    border-top-color: #fafaf9;
    border-radius: 50%;
    animation: au-spin 0.65s linear infinite;
    flex-shrink: 0;
  }
  @keyframes au-spin { to { transform: rotate(360deg); } }

  .au-hint {
    margin-top: 14px;
    font-size: 12px;
    color: #c8c4be;
    line-height: 1.65;
    text-align: center;
  }

  .au-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 28px 0;
  }
  .au-divider-line { flex: 1; height: 1px; background: var(--color-border); }
  .au-divider-txt { font-size: 11px; color: #d0ccc7; white-space: nowrap; }

  .au-error {
    padding: 11px 14px;
    background: #fff5f5;
    border: 1px solid #fecaca;
    border-radius: 10px;
    font-size: 13px;
    color: #dc2626;
    line-height: 1.5;
    margin-bottom: 18px;
  }

  .au-terms {
    font-size: 11px;
    color: #c8c4be;
    line-height: 1.7;
    text-align: center;
    margin-top: 24px;
  }
  .au-terms a { color: #a3a3a3; text-decoration: underline; text-underline-offset: 2px; }
  .au-terms a:hover { color: var(--color-text); }

  /* Success */
  .au-success { text-align: center; animation: au-up 0.4s cubic-bezier(0.22,1,0.36,1) both; }

  .au-success-ring {
    width: 56px; height: 56px;
    border-radius: 50%;
    border: 1px solid var(--color-border);
    background: var(--color-card);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 22px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.04);
  }

  .au-success-h2 {
    font-size: 22px;
    font-weight: 600;
    color: var(--color-text);
    letter-spacing: -0.8px;
    margin-bottom: 10px;
  }

  .au-success-p {
    font-size: 14px;
    color: var(--color-sec);
    line-height: 1.65;
    margin-bottom: 8px;
    max-width: 290px;
    margin-left: auto; margin-right: auto;
  }

  .au-success-email { color: var(--color-text); font-weight: 500; }

  .au-success-divider { height: 1px; background: var(--color-border); margin: 24px 0; }

  .au-resend {
    font-size: 13px;
    color: #a3a3a3;
    background: none;
    border: none;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    text-decoration: underline;
    text-underline-offset: 2px;
    transition: color 0.15s;
  }
  .au-resend:hover { color: var(--color-text); }

  /* Stats strip */
  .au-stats {
    position: absolute;
    bottom: 28px;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .au-stat { font-size: 11px; color: #d0ccc7; }
  .au-stat-sep { font-size: 11px; color: #e8e4de; }

  /* ── MOBILE ── */
  @media (max-width: 768px) {
    .au { flex-direction: column; height: 100dvh; }
    .au-left { display: none; }
    .au-right {
      height: 100dvh;
      padding: 72px 28px 60px;
      justify-content: flex-start;
      align-items: stretch;
      overflow-y: auto;
    }
    .au-back { top: 20px; left: 20px; }
    .au-mobile-logo { display: flex; }
    .au-form-wrap { max-width: 100%; }
    .au-h2 { font-size: 26px; letter-spacing: -1px; }
    .au-stats { position: static; margin-top: 36px; justify-content: center; flex-wrap: wrap; }
    .au-right::before { display: none; }
  }
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const LogoIcon = ({ color = '#fafaf9' }) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
    </svg>
);

const MailIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
    </svg>
);

const ArrowIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/>
        <polyline points="12 5 19 12 12 19"/>
    </svg>
);

const BackIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6"/>
    </svg>
);

const CheckIcon = ({ size = 22, color = '#1a1a1a' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
    </svg>
);

const BulletCheck = () => (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(250,250,249,0.4)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
    </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────
export default function AuthScreen() {
    const [email, setEmail]         = useState('');
    const [loading, setLoading]     = useState(false);
    const [magicSent, setMagicSent] = useState(false);
    const [error, setError]         = useState(null);
    const [focused, setFocused]     = useState(false);

    useSEO({ title: 'Sign In', description: 'Sign in to Neurativo — your AI-powered lecture assistant. Free to start, no password needed.', canonicalPath: '/auth' });

    // Lock page scroll while auth screen is mounted
    React.useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email.trim()) return;
        setError(null);
        setLoading(true);
        const { error: err } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: { emailRedirectTo: window.location.origin + '/app' },
        });
        setLoading(false);
        if (err) setError(err.message);
        else setMagicSent(true);
    };

    const bullets = [
        'Transcribed live — every word, as it happens',
        'Summaries built section by section, automatically',
        'Ask questions — AI answers from your own notes',
    ];

    return (
        <>
            <style>{CSS}</style>
            <div className="au">

                {/* ── LEFT PANEL ── */}
                <div className="au-left">
                    <Link to="/" className="au-left-logo">
                        <div className="au-left-logo-icon"><LogoIcon /></div>
                        <span className="au-left-wordmark">Neurativo</span>
                    </Link>

                    <div className="au-left-body">
                        <span className="au-left-mark">"</span>
                        <h1 className="au-left-h1">
                            Never miss<br />
                            what matters<br />
                            in a lecture.
                        </h1>
                        <p className="au-left-sub">
                            Real-time transcription and AI summaries
                            that build themselves as your professor speaks.
                        </p>
                        <div className="au-left-bullets">
                            {bullets.map(b => (
                                <div key={b} className="au-left-bullet">
                                    <div className="au-left-check"><BulletCheck /></div>
                                    {b}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="au-left-testimonial">
                        <p className="au-left-quote">
                            "I stopped worrying about missing key points halfway
                            through my first lecture. Neurativo just handles it."
                        </p>
                        <div className="au-left-attr">
                            <div className="au-left-avatar">A</div>
                            <span className="au-left-attr-name">Alex M. · 3rd year Biology</span>
                        </div>
                    </div>
                </div>

                {/* ── RIGHT PANEL ── */}
                <div className="au-right">
                    <Link to="/" className="au-back">
                        <BackIcon />
                        neurativo.com
                    </Link>

                    {/* Mobile logo — hidden on desktop */}
                    <Link to="/" className="au-mobile-logo">
                        <div className="au-mobile-logo-icon">
                            <LogoIcon color="#fafaf9" />
                        </div>
                        <span className="au-mobile-wordmark">Neurativo</span>
                    </Link>

                    <div className="au-form-wrap">
                        {magicSent ? (
                            /* ── SUCCESS STATE ── */
                            <div className="au-success">
                                <div className="au-success-ring">
                                    <CheckIcon size={20} color="#1a1a1a" />
                                </div>
                                <h2 className="au-success-h2">Check your inbox</h2>
                                <p className="au-success-p">
                                    We sent a sign-in link to{' '}
                                    <span className="au-success-email">{email}</span>.
                                    Click it to continue — no password needed.
                                </p>
                                <div className="au-success-divider" />
                                <p style={{ fontSize: '13px', color: '#a3a3a3', marginBottom: '10px' }}>
                                    Didn't receive it? Check your spam folder or
                                </p>
                                <button
                                    className="au-resend"
                                    onClick={() => { setMagicSent(false); setEmail(''); setError(null); }}
                                >
                                    try a different email address
                                </button>
                            </div>
                        ) : (
                            /* ── FORM STATE ── */
                            <>
                                <div className="au-eyebrow">
                                    <span className="au-eyebrow-dot" />
                                    Free to start
                                </div>

                                <h2 className="au-h2">
                                    Sign in to<br />Neurativo
                                </h2>

                                <p className="au-sub">
                                    New here? Just enter your email — we'll create
                                    your account automatically.
                                </p>

                                {error && <div className="au-error">{error}</div>}

                                <form onSubmit={handleSubmit}>
                                    <div className="au-field">
                                        <label className="au-label" htmlFor="au-email">
                                            Email address
                                        </label>
                                        <div className="au-input-wrap">
                                            <span className="au-input-icon" style={{ color: focused ? '#6b6b6b' : '#c8c4be' }}>
                                                <MailIcon />
                                            </span>
                                            <input
                                                id="au-email"
                                                className="au-input"
                                                type="email"
                                                value={email}
                                                onChange={e => setEmail(e.target.value)}
                                                placeholder="you@university.edu"
                                                required
                                                autoFocus
                                                autoComplete="email"
                                                onFocus={() => setFocused(true)}
                                                onBlur={() => setFocused(false)}
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        className="au-btn"
                                        disabled={loading || !email.trim()}
                                    >
                                        {loading ? (
                                            <><div className="au-spinner" />Sending link…</>
                                        ) : (
                                            <>Continue with email <ArrowIcon /></>
                                        )}
                                    </button>
                                </form>

                                <p className="au-hint">
                                    No password needed — we'll send a magic link<br />
                                    that signs you in instantly.
                                </p>

                                <p className="au-terms">
                                    By continuing you agree to our{' '}
                                    <Link to="/terms">Terms of Service</Link> and{' '}
                                    <Link to="/privacy">Privacy Policy</Link>.
                                </p>
                            </>
                        )}
                    </div>

                    {/* Social proof strip */}
                    <div className="au-stats">
                        <span className="au-stat">10,000+ lectures</span>
                        <span className="au-stat-sep">·</span>
                        <span className="au-stat">40+ universities</span>
                        <span className="au-stat-sep">·</span>
                        <span className="au-stat">Free to start</span>
                    </div>
                </div>

            </div>
        </>
    );
}
