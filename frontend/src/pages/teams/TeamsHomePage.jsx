import React from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '@clerk/react';

const CSS = `
  .th *, .th *::before, .th *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .th { font-family: 'Inter', sans-serif; background: #fafaf9; color: #1a1a1a; min-height: 100vh; -webkit-font-smoothing: antialiased; }

  .th-nav {
    position: sticky; top: 0; z-index: 50; height: 60px;
    background: rgba(250,250,249,0.92); backdrop-filter: blur(16px);
    border-bottom: 1px solid #f0ede8;
    display: flex; align-items: center; padding: 0 40px; gap: 16px;
  }
  .th-logo { font-size: 15px; font-weight: 600; color: #1a1a1a; text-decoration: none; display: flex; align-items: center; gap: 8px; }
  .th-logo-icon { width: 26px; height: 26px; background: #1a1a1a; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .th-logo-icon svg { width: 14px; height: 14px; }
  .th-logo-badge { font-size: 11px; font-weight: 500; color: #6b6b6b; background: #f0ede8; border-radius: 6px; padding: 2px 7px; }
  .th-nav-right { margin-left: auto; display: flex; gap: 8px; }
  .th-btn-ghost { font-size: 13px; color: #6b6b6b; background: none; border: none; cursor: pointer; padding: 7px 14px; border-radius: 8px; text-decoration: none; transition: background .15s; }
  .th-btn-ghost:hover { background: #f0ede8; color: #1a1a1a; }
  .th-btn-dark { font-size: 13px; font-weight: 500; color: #fafaf9; background: #1a1a1a; border: none; cursor: pointer; padding: 7px 16px; border-radius: 10px; text-decoration: none; transition: opacity .15s; }
  .th-btn-dark:hover { opacity: .8; }

  .th-hero { text-align: center; padding: 100px 24px 80px; max-width: 700px; margin: 0 auto; }
  .th-hero-eyebrow { font-size: 12px; font-weight: 500; color: #6b6b6b; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 20px; }
  .th-hero-title { font-size: clamp(36px, 6vw, 58px); font-weight: 700; line-height: 1.1; letter-spacing: -1.5px; margin-bottom: 20px; }
  .th-hero-sub { font-size: 18px; color: #6b6b6b; line-height: 1.6; margin-bottom: 36px; }
  .th-hero-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .th-btn-lg { font-size: 15px; font-weight: 500; padding: 13px 28px; border-radius: 12px; border: none; cursor: pointer; text-decoration: none; transition: opacity .15s; display: inline-block; }
  .th-btn-lg-dark { background: #1a1a1a; color: #fafaf9; }
  .th-btn-lg-dark:hover { opacity: .8; }
  .th-btn-lg-outline { background: transparent; color: #1a1a1a; border: 1.5px solid #e5e2dd; }
  .th-btn-lg-outline:hover { border-color: #1a1a1a; }

  .th-pricing { padding: 80px 24px; background: #fff; border-top: 1px solid #f0ede8; border-bottom: 1px solid #f0ede8; }
  .th-pricing-title { text-align: center; font-size: 28px; font-weight: 700; letter-spacing: -.5px; margin-bottom: 8px; }
  .th-pricing-sub { text-align: center; color: #6b6b6b; font-size: 15px; margin-bottom: 48px; }
  .th-pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; max-width: 820px; margin: 0 auto; }
  .th-card { border: 1.5px solid #f0ede8; border-radius: 16px; padding: 28px; background: #fafaf9; }
  .th-card-label { font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: .08em; color: #6b6b6b; margin-bottom: 10px; }
  .th-card-price { font-size: 34px; font-weight: 700; letter-spacing: -1px; margin-bottom: 4px; }
  .th-card-price span { font-size: 15px; font-weight: 400; color: #6b6b6b; }
  .th-card-desc { font-size: 13px; color: #6b6b6b; margin-bottom: 20px; line-height: 1.5; }
  .th-card-features { list-style: none; display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }
  .th-card-features li { font-size: 13px; color: #1a1a1a; display: flex; align-items: center; gap: 8px; }
  .th-card-features li::before { content: '✓'; color: #22c55e; font-weight: 700; flex-shrink: 0; }
  .th-card-btn { display: block; text-align: center; padding: 10px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; text-decoration: none; transition: opacity .15s; cursor: pointer; border: none; }
  .th-card-btn-dark { background: #1a1a1a; color: #fafaf9; }
  .th-card-btn-dark:hover { opacity: .8; }
  .th-card-btn-outline { background: transparent; color: #1a1a1a; border: 1.5px solid #e5e2dd; }
  .th-card-btn-outline:hover { border-color: #1a1a1a; }

  .th-enterprise { max-width: 820px; margin: 32px auto 0; padding: 24px 28px; border: 1.5px solid #f0ede8; border-radius: 16px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; background: #fafaf9; }
  .th-enterprise-text h3 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
  .th-enterprise-text p { font-size: 13px; color: #6b6b6b; }
  .th-enterprise-cta { margin-left: auto; flex-shrink: 0; }

  .th-features { max-width: 900px; margin: 0 auto; padding: 80px 24px; }
  .th-features-title { text-align: center; font-size: 28px; font-weight: 700; letter-spacing: -.5px; margin-bottom: 48px; }
  .th-features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; }
  .th-feature { padding: 20px; border: 1.5px solid #f0ede8; border-radius: 12px; }
  .th-feature-icon { width: 36px; height: 36px; background: #f0ede8; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; font-size: 18px; }
  .th-feature h4 { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
  .th-feature p { font-size: 13px; color: #6b6b6b; line-height: 1.5; }

  .th-footer { text-align: center; padding: 32px 24px; border-top: 1px solid #f0ede8; font-size: 12px; color: #a3a3a3; }
  .th-footer a { color: #6b6b6b; text-decoration: none; }
  .th-footer a:hover { color: #1a1a1a; }
`;

export default function TeamsHomePage() {
    const { isSignedIn } = useUser();

    return (
        <div className="th">
            <style>{CSS}</style>

            {/* Nav */}
            <nav className="th-nav">
                <a href="https://neurativo.com" className="th-logo">
                    <div className="th-logo-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                        </svg>
                    </div>
                    Neurativo
                    <span className="th-logo-badge">Teams</span>
                </a>
                <div className="th-nav-right">
                    {isSignedIn ? (
                        <Link to="/new" className="th-btn-dark">Create organization</Link>
                    ) : (
                        <>
                            <a href="https://neurativo.com" className="th-btn-ghost">Back to Neurativo</a>
                            <Link to="/new" className="th-btn-dark">Get started</Link>
                        </>
                    )}
                </div>
            </nav>

            {/* Hero */}
            <section className="th-hero">
                <div className="th-hero-eyebrow">Neurativo Teams</div>
                <h1 className="th-hero-title">AI-powered learning<br />for your entire team</h1>
                <p className="th-hero-sub">
                    Give your team access to live lecture recording, real-time transcription,
                    AI summaries, and Q&amp;A — all from one dashboard.
                </p>
                <div className="th-hero-cta">
                    <Link to="/new" className="th-btn-lg th-btn-lg-dark">Create your organization</Link>
                    <a href="https://neurativo.com" className="th-btn-lg th-btn-lg-outline">See individual plans</a>
                </div>
            </section>

            {/* Pricing */}
            <section className="th-pricing">
                <h2 className="th-pricing-title">Simple per-seat pricing</h2>
                <p className="th-pricing-sub">Mix student and pro seats in one organization. Pay only for what you need.</p>
                <div className="th-pricing-grid">
                    <div className="th-card">
                        <div className="th-card-label">Student seat</div>
                        <div className="th-card-price">$15 <span>/ seat / month</span></div>
                        <div className="th-card-desc">Everything the individual Student plan includes, managed centrally.</div>
                        <ul className="th-card-features">
                            <li>Unlimited live recordings (3h max)</li>
                            <li>20 uploads per month</li>
                            <li>AI section summaries</li>
                            <li>PDF export</li>
                            <li>Domain-aware Q&amp;A</li>
                            <li>Sharing</li>
                        </ul>
                        <Link to="/new" className="th-card-btn th-card-btn-outline">Get started</Link>
                    </div>
                    <div className="th-card" style={{ borderColor: '#1a1a1a' }}>
                        <div className="th-card-label">Pro seat</div>
                        <div className="th-card-price">$22 <span>/ seat / month</span></div>
                        <div className="th-card-desc">Full pro access for power users — researchers, instructors, senior staff.</div>
                        <ul className="th-card-features">
                            <li>Unlimited recordings &amp; uploads</li>
                            <li>AI section summaries</li>
                            <li>PDF export + bulk export</li>
                            <li>Speaker diarization</li>
                            <li>Flashcards + spaced repetition</li>
                            <li>API access</li>
                            <li>Priority processing</li>
                        </ul>
                        <Link to="/new" className="th-card-btn th-card-btn-dark">Get started</Link>
                    </div>
                </div>

                {/* Enterprise */}
                <div className="th-enterprise">
                    <div className="th-enterprise-text">
                        <h3>50+ seats? Let's talk.</h3>
                        <p>Custom contracts, volume pricing, and dedicated onboarding for large organizations.</p>
                    </div>
                    <div className="th-enterprise-cta">
                        <a href="mailto:teams@neurativo.com" className="th-card-btn th-card-btn-outline" style={{ display: 'inline-block', padding: '10px 20px' }}>
                            Contact us →
                        </a>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="th-features">
                <h2 className="th-features-title">Everything you need to manage your team</h2>
                <div className="th-features-grid">
                    <div className="th-feature">
                        <div className="th-feature-icon">👥</div>
                        <h4>Invite members</h4>
                        <p>Email invites, shareable links, or auto-join by company email domain.</p>
                    </div>
                    <div className="th-feature">
                        <div className="th-feature-icon">🎛️</div>
                        <h4>Per-seat tiers</h4>
                        <p>Assign student or pro seats to each member individually — change anytime.</p>
                    </div>
                    <div className="th-feature">
                        <div className="th-feature-icon">📊</div>
                        <h4>Seat dashboard</h4>
                        <p>See who's active, how many seats are used, and manage everything in one place.</p>
                    </div>
                    <div className="th-feature">
                        <div className="th-feature-icon">🔐</div>
                        <h4>Domain allowlist</h4>
                        <p>Anyone with your company email automatically gets a seat when they sign up.</p>
                    </div>
                    <div className="th-feature">
                        <div className="th-feature-icon">⚡</div>
                        <h4>Instant activation</h4>
                        <p>Members' plan upgrades activate the moment they accept their invite.</p>
                    </div>
                    <div className="th-feature">
                        <div className="th-feature-icon">🤖</div>
                        <h4>Full Neurativo features</h4>
                        <p>Live recording, real-time transcription, AI Q&amp;A, PDF reports, and more.</p>
                    </div>
                </div>
            </section>

            <footer className="th-footer">
                <p>
                    <a href="https://neurativo.com">neurativo.com</a> &nbsp;·&nbsp;
                    <a href="https://neurativo.com/terms">Terms</a> &nbsp;·&nbsp;
                    <a href="https://neurativo.com/privacy">Privacy</a> &nbsp;·&nbsp;
                    <a href="mailto:support@neurativo.com">support@neurativo.com</a>
                </p>
            </footer>
        </div>
    );
}
