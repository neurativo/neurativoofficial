import React from 'react';
import { Link } from 'react-router-dom';

const FOOTER_CSS = `
  .site-footer {
    border-top: 1px solid #f0ede8; padding: 36px 40px;
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 24px;
    font-family: 'Inter', sans-serif;
  }
  .site-footer-brand { display: flex; align-items: center; gap: 8px; text-decoration: none; }
  .site-footer-name { font-size: 14px; font-weight: 600; color: #1a1a1a; letter-spacing: -0.3px; }
  .site-footer-lnks { display: flex; gap: 24px; align-items: center; }
  .site-footer-lnk { font-size: 13px; color: #a3a3a3; text-decoration: none; transition: color 0.15s; }
  .site-footer-lnk:hover { color: #1a1a1a; }
  .site-footer-copy { font-size: 12px; color: #a3a3a3; text-align: right; }

  @media (max-width: 640px) {
    .site-footer { grid-template-columns: 1fr; text-align: center; justify-items: center; padding: 28px 24px; gap: 16px; }
    .site-footer-copy { text-align: center; }
  }

  .dark .site-footer { border-top-color: var(--color-border, #2a2a2a); }
  .dark .site-footer-name { color: var(--color-text, #f5f5f4); }
  .dark .site-footer-lnk { color: var(--color-muted, #a3a3a3); }
  .dark .site-footer-lnk:hover { color: var(--color-text, #f5f5f4); }
  .dark .site-footer-copy { color: var(--color-muted, #a3a3a3); }
`;

export default function Footer() {
    return (
        <>
            <style>{FOOTER_CSS}</style>
            <footer className="site-footer">
                <Link to="/" className="site-footer-brand">
                    <img src="/logo.png" alt="Neurativo" style={{ width: 26, height: 26, borderRadius: 6 }} />
                    <span className="site-footer-name">Neurativo</span>
                </Link>
                <div className="site-footer-lnks">
                    <Link to="/features" className="site-footer-lnk">Features</Link>
                    <Link to="/pricing" className="site-footer-lnk">Pricing</Link>
                    <Link to="/about" className="site-footer-lnk">About</Link>
                    <Link to="/privacy" className="site-footer-lnk">Privacy</Link>
                    <Link to="/terms" className="site-footer-lnk">Terms</Link>
                </div>
                <div className="site-footer-copy">© {new Date().getFullYear()} Neurativo. All rights reserved.</div>
            </footer>
        </>
    );
}
