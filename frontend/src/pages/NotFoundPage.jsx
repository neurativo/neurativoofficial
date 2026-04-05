import React from 'react';
import { Link } from 'react-router-dom';
import { useSEO } from '../lib/useSEO';

const CSS = `
  .nf {
    min-height: 100vh;
    background: var(--color-bg, #faf9f7);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Inter', sans-serif;
    -webkit-font-smoothing: antialiased;
    padding: 24px;
  }

  .nf-inner {
    text-align: center;
    max-width: 420px;
    width: 100%;
  }

  /* Logo */
  .nf-logo {
    display: inline-flex; align-items: center; gap: 9px;
    text-decoration: none; margin-bottom: 48px;
  }
  .nf-logo-box {
    width: 28px; height: 28px; border-radius: 8px;
    background: var(--color-dark, #1a1a1a);
    display: flex; align-items: center; justify-content: center;
  }
  .nf-logo-text {
    font-size: 14px; font-weight: 600;
    color: var(--color-text, #1a1a1a); letter-spacing: -0.3px;
  }

  /* 404 number */
  .nf-code {
    font-size: 96px; font-weight: 700;
    color: var(--color-text, #1a1a1a);
    letter-spacing: -6px; line-height: 1;
    margin-bottom: 4px;
    font-variant-numeric: tabular-nums;
  }

  .nf-divider {
    width: 32px; height: 2px;
    background: var(--color-border, #e8e4de);
    margin: 20px auto;
    border-radius: 2px;
  }

  .nf-title {
    font-size: 18px; font-weight: 600;
    color: var(--color-text, #1a1a1a);
    letter-spacing: -0.5px; margin-bottom: 10px;
  }

  .nf-desc {
    font-size: 14px; color: var(--color-sec, #888);
    line-height: 1.65; margin-bottom: 32px;
  }

  /* Buttons */
  .nf-btns {
    display: flex; align-items: center; justify-content: center;
    gap: 10px; flex-wrap: wrap;
  }

  .nf-btn-dark {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 11px 20px;
    background: var(--color-dark, #1a1a1a); color: var(--color-dark-fg, #fafaf9);
    font-size: 13.5px; font-weight: 500;
    border-radius: 10px; text-decoration: none;
    font-family: 'Inter', sans-serif;
    transition: opacity 0.12s;
    border: none; cursor: pointer;
  }
  .nf-btn-dark:hover { opacity: 0.8; }

  .nf-btn-ghost {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 11px 20px;
    background: transparent;
    color: var(--color-sec, #888);
    font-size: 13.5px; font-weight: 500;
    border-radius: 10px; text-decoration: none;
    font-family: 'Inter', sans-serif;
    border: 1.5px solid var(--color-border, #e8e4de);
    transition: border-color 0.12s, color 0.12s;
  }
  .nf-btn-ghost:hover {
    border-color: #bbb;
    color: var(--color-text, #1a1a1a);
  }

  /* Footer note */
  .nf-note {
    margin-top: 40px;
    font-size: 11px; color: var(--color-muted, #a3a3a3);
  }

  @media (max-width: 400px) {
    .nf-code { font-size: 72px; letter-spacing: -4px; }
    .nf-btns { flex-direction: column; }
    .nf-btn-dark, .nf-btn-ghost { width: 100%; justify-content: center; }
  }
`;

const LogoIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="var(--color-dark-fg, #fafaf9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
    </svg>
);

const ArrowIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/>
        <polyline points="12 5 19 12 12 19"/>
    </svg>
);

export default function NotFoundPage() {
    useSEO({ title: 'Page Not Found', description: 'This page does not exist.', canonicalPath: '/404' });

    return (
        <>
            <style>{CSS}</style>
            <div className="nf">
                <div className="nf-inner">
                    <Link to="/" className="nf-logo">
                        <div className="nf-logo-box"><LogoIcon /></div>
                        <span className="nf-logo-text">Neurativo</span>
                    </Link>

                    <div className="nf-code">404</div>
                    <div className="nf-divider" />
                    <h1 className="nf-title">Page not found</h1>
                    <p className="nf-desc">
                        The page you're looking for doesn't exist or has been moved.
                    </p>

                    <div className="nf-btns">
                        <Link to="/" className="nf-btn-dark">
                            Go home <ArrowIcon />
                        </Link>
                        <Link to="/app" className="nf-btn-ghost">
                            Dashboard
                        </Link>
                    </div>

                    <p className="nf-note">neurativo.com</p>
                </div>
            </div>
        </>
    );
}
