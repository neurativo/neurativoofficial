/**
 * WhatsNewModal
 * -------------
 * Polls for unseen feature releases on mount.
 * Shows each release as a full-screen modal (ChatGPT/Claude style).
 * Dismisses each one in sequence; after the last one closes it disappears.
 *
 * Features per release card:
 *   - Gradient header with app name + "What's new" label
 *   - Feature list: icon · title · description · optional badge
 *   - CTA button (optional) and "Got it" dismiss
 *   - Dot pagination when multiple unseen releases
 *
 * No props required — reads auth from Clerk via useUser.
 */
import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';

// ── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
/* Backdrop */
.wn-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  animation: wn-fade 0.2s ease;
}
@keyframes wn-fade { from { opacity: 0; } to { opacity: 1; } }

/* Card */
.wn-card {
  background: var(--color-card, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 24px;
  box-shadow: 0 32px 80px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.10);
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  display: flex; flex-direction: column;
  overflow: hidden;
  animation: wn-pop 0.25s cubic-bezier(0.34,1.4,0.64,1);
}
@keyframes wn-pop {
  from { opacity: 0; transform: scale(0.92) translateY(12px); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}

/* Header gradient */
.wn-header {
  padding: 32px 28px 28px;
  background: linear-gradient(135deg, #0f0f0f 0%, #1e1a2e 50%, #0f1929 100%);
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}
.wn-header::before {
  content: '';
  position: absolute;
  top: -60px; right: -60px;
  width: 200px; height: 200px;
  background: radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 70%);
  pointer-events: none;
}
.wn-header::after {
  content: '';
  position: absolute;
  bottom: -40px; left: -40px;
  width: 160px; height: 160px;
  background: radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 70%);
  pointer-events: none;
}
.wn-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 99px;
  font-size: 11px; font-weight: 600;
  color: rgba(255,255,255,0.7);
  letter-spacing: 0.3px;
  margin-bottom: 14px;
  position: relative; z-index: 1;
}
.wn-badge-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: #10b981;
  animation: wn-pulse 1.8s ease-in-out infinite;
}
@keyframes wn-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }

.wn-title {
  font-size: 26px; font-weight: 800;
  color: #fff;
  letter-spacing: -0.6px;
  line-height: 1.15;
  position: relative; z-index: 1;
  margin-bottom: 6px;
}
.wn-subtitle {
  font-size: 14px;
  color: rgba(255,255,255,0.55);
  line-height: 1.5;
  position: relative; z-index: 1;
}

/* Body */
.wn-body {
  padding: 24px 28px 0;
  overflow-y: auto;
  flex: 1;
}
.wn-body::-webkit-scrollbar { width: 4px; }
.wn-body::-webkit-scrollbar-thumb { background: var(--color-border, #e5e7eb); border-radius: 4px; }

/* Feature items */
.wn-feature {
  display: flex; align-items: flex-start; gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid var(--color-border, #f0f0ef);
}
.wn-feature:last-child { border-bottom: none; }

.wn-feature-icon {
  width: 40px; height: 40px; flex-shrink: 0;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px;
  background: var(--color-bg, #f9f9f8);
  border: 1px solid var(--color-border, #e5e7eb);
}
.wn-feature-content { flex: 1; min-width: 0; }
.wn-feature-row { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
.wn-feature-title {
  font-size: 14px; font-weight: 600;
  color: var(--color-text, #111);
  letter-spacing: -0.2px;
}
.wn-feature-badge {
  display: inline-block;
  padding: 1px 7px; border-radius: 99px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.2px;
}
.wn-feature-badge.new      { background: rgba(99,102,241,0.1); color: #6366f1; }
.wn-feature-badge.improved { background: rgba(16,185,129,0.1); color: #10b981; }
.wn-feature-badge.beta     { background: rgba(245,158,11,0.1); color: #f59e0b; }
.wn-feature-desc {
  font-size: 13px;
  color: var(--color-sec, #6b7280);
  line-height: 1.55;
}

/* Footer */
.wn-footer {
  padding: 20px 28px 24px;
  display: flex; flex-direction: column; gap: 10px;
  flex-shrink: 0;
  border-top: 1px solid var(--color-border, #f0f0ef);
}

/* Pagination dots */
.wn-dots {
  display: flex; justify-content: center; gap: 6px;
}
.wn-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--color-border, #e5e7eb);
  transition: background 0.2s, width 0.2s;
}
.wn-dot.active {
  background: var(--color-text, #111);
  width: 18px; border-radius: 3px;
}

/* CTA + Dismiss buttons */
.wn-cta {
  width: 100%;
  padding: 12px 20px;
  font-size: 14px; font-weight: 600;
  border: none; border-radius: 12px;
  background: var(--color-dark, #111);
  color: var(--color-dark-fg, #fafaf9);
  cursor: pointer; font-family: inherit;
  transition: opacity 0.15s, transform 0.1s;
  letter-spacing: -0.2px;
}
.wn-cta:hover  { opacity: 0.88; }
.wn-cta:active { transform: scale(0.98); }

.wn-dismiss {
  width: 100%;
  padding: 10px 20px;
  font-size: 13px; font-weight: 500;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
  background: transparent;
  color: var(--color-sec, #6b7280);
  cursor: pointer; font-family: inherit;
  transition: border-color 0.15s, color 0.15s;
}
.wn-dismiss:hover { border-color: var(--color-border-hov, #ccc); color: var(--color-text, #111); }

@media (max-width: 520px) {
  .wn-card { border-radius: 20px; }
  .wn-header { padding: 24px 20px 22px; }
  .wn-title { font-size: 22px; }
  .wn-body { padding: 20px 20px 0; }
  .wn-footer { padding: 16px 20px 20px; }
}
`;

// ── Badge colors ──────────────────────────────────────────────────────────────
function FeatureBadge({ badge }) {
    if (!badge) return null;
    const cls = badge.toLowerCase();
    return <span className={`wn-feature-badge ${cls}`}>{badge}</span>;
}

// ── Single release card ───────────────────────────────────────────────────────
function ReleaseCard({ release, index, total, onDismiss, onCta }) {
    const features = release.features || [];

    return (
        <div className="wn-card">
            {/* Header */}
            <div className="wn-header">
                <div className="wn-badge">
                    <div className="wn-badge-dot" />
                    What&apos;s new in Neurativo
                </div>
                <div className="wn-title">{release.title}</div>
                {release.subtitle && (
                    <div className="wn-subtitle">{release.subtitle}</div>
                )}
            </div>

            {/* Feature list */}
            <div className="wn-body">
                {features.map((f, i) => (
                    <div className="wn-feature" key={i}>
                        <div className="wn-feature-icon">{f.icon || '✦'}</div>
                        <div className="wn-feature-content">
                            <div className="wn-feature-row">
                                <span className="wn-feature-title">{f.title}</span>
                                {f.badge && <FeatureBadge badge={f.badge} />}
                            </div>
                            <div className="wn-feature-desc">{f.description}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="wn-footer">
                {total > 1 && (
                    <div className="wn-dots">
                        {Array.from({ length: total }).map((_, i) => (
                            <div key={i} className={`wn-dot${i === index ? ' active' : ''}`} />
                        ))}
                    </div>
                )}

                {release.cta_url && release.cta_label && (
                    <button
                        className="wn-cta"
                        onClick={() => onCta(release)}
                    >
                        {release.cta_label}
                    </button>
                )}

                <button className="wn-dismiss" onClick={onDismiss}>
                    {index < total - 1 ? 'Next →' : 'Got it, thanks!'}
                </button>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WhatsNewModal() {
    const [releases, setReleases] = useState([]);
    const [idx, setIdx]           = useState(0);
    const [visible, setVisible]   = useState(false);

    useEffect(() => {
        api.get('/api/v1/releases/unseen')
            .then(r => {
                const list = r.data?.releases || [];
                if (list.length > 0) {
                    setReleases(list);
                    setVisible(true);
                }
            })
            .catch(() => {});
    }, []);

    // Close on Escape
    useEffect(() => {
        if (!visible) return;
        const h = (e) => { if (e.key === 'Escape') handleDismiss(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [visible, idx]);

    const handleDismiss = useCallback(async () => {
        const rel = releases[idx];
        if (rel) {
            try {
                await api.post(`/api/v1/releases/${rel.id}/dismiss`);
            } catch {}
        }
        if (idx < releases.length - 1) {
            setIdx(i => i + 1);
        } else {
            setVisible(false);
        }
    }, [releases, idx]);

    const handleCta = useCallback((release) => {
        if (release.cta_url) {
            window.open(release.cta_url, '_blank', 'noopener');
        }
        handleDismiss();
    }, [handleDismiss]);

    if (!visible || releases.length === 0) return null;

    return (
        <>
            <style>{CSS}</style>
            <div className="wn-backdrop" onClick={handleDismiss}>
                <div onClick={e => e.stopPropagation()}>
                    <ReleaseCard
                        key={releases[idx]?.id}
                        release={releases[idx]}
                        index={idx}
                        total={releases.length}
                        onDismiss={handleDismiss}
                        onCta={handleCta}
                    />
                </div>
            </div>
        </>
    );
}
