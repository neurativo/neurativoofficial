import React from 'react';

// Real Neurativo logo — matches favicon.svg exactly
export function NeurativoLogo({ size = 26 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"
            style={{ borderRadius: 7, flexShrink: 0 }}>
            <rect width="32" height="32" rx="8" fill="#1a1a1a"/>
            <path d="M18 4L8 18h7v10l9-12h-7L18 4z" fill="#fafaf9"/>
        </svg>
    );
}

const CSS = `
  .tn-nav {
    position: sticky; top: 0; z-index: 50; height: 60px;
    background: rgba(250,250,249,0.88); backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border-bottom: 1px solid rgba(240,237,232,0.8);
    display: flex; align-items: center; padding: 0 32px; gap: 10px;
  }
  .tn-logo { font-size: 15px; font-weight: 600; text-decoration: none; color: #1a1a1a; display: flex; align-items: center; gap: 8px; }
  .tn-badge { font-size: 11px; font-weight: 500; color: #6b6b6b; background: rgba(240,237,232,0.9); border-radius: 6px; padding: 2px 7px; }
  .tn-sep { color: #d4d0cb; font-size: 14px; }
  .tn-org { font-size: 13px; color: #6b6b6b; }
  .tn-right { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  .tn-btn-ghost { font-size: 13px; color: #6b6b6b; background: none; border: none; cursor: pointer; padding: 7px 13px; border-radius: 8px; text-decoration: none; transition: background .15s, color .15s; font-family: inherit; }
  .tn-btn-ghost:hover { background: #f0ede8; color: #1a1a1a; }
  .tn-btn-dark { font-size: 13px; font-weight: 500; color: #fafaf9; background: #1a1a1a; border: none; cursor: pointer; padding: 7px 16px; border-radius: 10px; text-decoration: none; transition: opacity .15s; }
  .tn-btn-dark:hover { opacity: .8; }
`;

export default function TeamsNav({ orgName, right }) {
    return (
        <>
            <style>{CSS}</style>
            <nav className="tn-nav">
                <a href="/" className="tn-logo">
                    <NeurativoLogo size={26} />
                    Neurativo
                    <span className="tn-badge">Teams</span>
                </a>
                {orgName && (
                    <>
                        <span className="tn-sep">/</span>
                        <span className="tn-org">{orgName}</span>
                    </>
                )}
                {right && <div className="tn-right">{right}</div>}
            </nav>
        </>
    );
}
