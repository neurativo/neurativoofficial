import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { supabase } from '../lib/supabase';

const CSS = `
  .pp * { box-sizing: border-box; }
  .pp {
    font-family: 'Inter', sans-serif; background: var(--color-bg); color: var(--color-text);
    min-height: 100vh; -webkit-font-smoothing: antialiased;
  }

  /* Header */
  .pp-header {
    height: 56px; background: var(--color-card); border-bottom: 1px solid var(--color-border);
    display: flex; align-items: center; padding: 0 24px; gap: 12px;
    position: sticky; top: 0; z-index: 20;
  }
  .pp-logo { display: flex; align-items: center; gap: 8px; text-decoration: none; }
  .pp-logo-icon {
    width: 24px; height: 24px; background: var(--color-dark); border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
  }
  .pp-wordmark { font-size: 14px; font-weight: 600; color: var(--color-text); letter-spacing: -0.3px; }
  .pp-back {
    margin-left: auto; display: flex; align-items: center; gap: 5px;
    font-size: 13px; color: var(--color-muted); text-decoration: none; transition: color 0.15s;
  }
  .pp-back:hover { color: var(--color-text); }

  /* Main */
  .pp-main { max-width: 640px; margin: 0 auto; padding: 40px 24px 80px; }
  .pp-page-title { font-size: 22px; font-weight: 600; letter-spacing: -0.5px; margin: 0 0 2px; }
  .pp-page-sub { font-size: 13px; color: var(--color-muted); margin: 0 0 36px; }

  /* Section */
  .pp-section { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 16px; margin-bottom: 16px; overflow: hidden; }
  .pp-section-head { padding: 18px 20px 14px; border-bottom: 1px solid var(--color-border); }
  .pp-section-title { font-size: 13px; font-weight: 600; color: var(--color-text); letter-spacing: -0.2px; }
  .pp-section-sub { font-size: 12px; color: var(--color-muted); margin-top: 2px; }
  .pp-section-body { padding: 20px; }

  /* Avatar */
  .pp-avatar-row { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
  .pp-avatar {
    width: 56px; height: 56px; border-radius: 50%; background: var(--color-dark);
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; font-weight: 600; color: var(--color-dark-fg); flex-shrink: 0;
  }
  .pp-avatar-info { flex: 1; }
  .pp-avatar-name { font-size: 15px; font-weight: 500; color: var(--color-text); letter-spacing: -0.2px; }
  .pp-avatar-email { font-size: 12px; color: var(--color-muted); margin-top: 2px; }

  /* Form fields */
  .pp-field { margin-bottom: 14px; }
  .pp-label { display: block; font-size: 12px; font-weight: 500; color: var(--color-sec); margin-bottom: 6px; }
  .pp-input {
    width: 100%; padding: 9px 12px; border: 1px solid var(--color-border); border-radius: 10px;
    font-size: 13px; color: var(--color-text); background: var(--color-bg); outline: none;
    transition: border-color 0.15s; font-family: inherit;
  }
  .pp-input:focus { border-color: var(--color-border-hov); background: var(--color-card); }
  .pp-input:disabled { color: var(--color-muted); cursor: not-allowed; }

  /* Save button */
  .pp-btn-save {
    padding: 9px 20px; background: var(--color-dark); color: var(--color-dark-fg); font-size: 13px;
    font-weight: 500; border: none; border-radius: 10px; cursor: pointer;
    transition: opacity 0.15s; font-family: inherit;
  }
  .pp-btn-save:hover { opacity: 0.82; }
  .pp-btn-save:disabled { opacity: 0.45; cursor: not-allowed; }
  .pp-save-msg { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #22c55e; margin-left: 12px; }

  /* Stats grid */
  .pp-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .pp-stat { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 12px; padding: 16px; text-align: center; }
  .pp-stat-n { font-size: 24px; font-weight: 600; color: var(--color-text); letter-spacing: -1px; font-family: monospace; }
  .pp-stat-l { font-size: 11px; color: var(--color-muted); margin-top: 4px; }

  /* Usage bar */
  .pp-usage-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .pp-usage-label { font-size: 13px; color: var(--color-sec); }
  .pp-usage-count { font-size: 13px; font-weight: 500; color: var(--color-text); font-family: monospace; }
  .pp-bar-bg { width: 100%; height: 6px; background: var(--color-border); border-radius: 99px; overflow: hidden; }
  .pp-bar-fill { height: 100%; background: var(--color-dark); border-radius: 99px; transition: width 0.6s ease; }
  .pp-bar-fill.warn { background: #f59e0b; }
  .pp-bar-fill.full { background: #ef4444; }
  .pp-usage-note { font-size: 11px; color: var(--color-muted); margin-top: 6px; }

  /* Toggle */
  .pp-toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--color-border); }
  .pp-toggle-row:last-child { border-bottom: none; padding-bottom: 0; }
  .pp-toggle-info { flex: 1; }
  .pp-toggle-title { font-size: 13px; font-weight: 500; color: var(--color-text); }
  .pp-toggle-desc { font-size: 12px; color: var(--color-muted); margin-top: 2px; }
  .pp-toggle {
    position: relative; width: 38px; height: 22px; flex-shrink: 0; cursor: pointer;
    background: var(--color-border); border-radius: 11px; border: none; transition: background 0.2s;
  }
  .pp-toggle.on { background: var(--color-dark); }
  .pp-toggle::after {
    content: ''; position: absolute; left: 3px; top: 3px;
    width: 16px; height: 16px; background: var(--color-card); border-radius: 50%;
    transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }
  .pp-toggle.on::after { transform: translateX(16px); }

  /* Danger zone */
  .pp-danger-section { background: var(--color-card); border: 1px solid #fecaca; border-radius: 16px; margin-bottom: 16px; overflow: hidden; }
  .pp-danger-head { padding: 18px 20px 14px; border-bottom: 1px solid #fecaca; }
  .pp-danger-title { font-size: 13px; font-weight: 600; color: #ef4444; }
  .pp-danger-body { padding: 20px; }
  .pp-danger-desc { font-size: 13px; color: var(--color-sec); line-height: 1.6; margin-bottom: 16px; }
  .pp-btn-delete {
    padding: 9px 20px; background: var(--color-card); color: #ef4444; font-size: 13px;
    font-weight: 500; border: 1px solid #fecaca; border-radius: 10px;
    cursor: pointer; transition: background 0.15s; font-family: inherit;
  }
  .pp-btn-delete:hover { background: #fff5f5; }

  /* Delete confirmation modal */
  .pp-modal-overlay {
    position: fixed; inset: 0; z-index: 50; display: flex; align-items: center;
    justify-content: center; background: rgba(0,0,0,0.35); backdrop-filter: blur(4px);
  }
  .pp-modal {
    background: var(--color-card); border: 1px solid var(--color-border); border-radius: 16px; padding: 28px;
    width: 100%; max-width: 400px; margin: 0 16px;
  }
  .pp-modal-title { font-size: 16px; font-weight: 600; color: var(--color-text); margin: 0 0 8px; letter-spacing: -0.3px; }
  .pp-modal-sub { font-size: 14px; color: var(--color-sec); line-height: 1.6; margin: 0 0 16px; }
  .pp-modal-confirm-label { font-size: 12px; color: var(--color-sec); margin-bottom: 6px; font-weight: 500; }
  .pp-modal-confirm-input {
    width: 100%; padding: 9px 12px; border: 1px solid var(--color-border); border-radius: 10px;
    font-size: 13px; color: var(--color-text); background: var(--color-bg); outline: none;
    transition: border-color 0.15s; font-family: inherit; margin-bottom: 16px;
  }
  .pp-modal-confirm-input:focus { border-color: #fecaca; }
  .pp-modal-btns { display: flex; gap: 8px; }
  .pp-modal-cancel {
    flex: 1; padding: 10px; background: var(--color-bg); color: var(--color-text); font-size: 13px;
    border: 1px solid var(--color-border); border-radius: 10px; cursor: pointer; font-family: inherit;
  }
  .pp-modal-delete {
    flex: 1; padding: 10px; background: #ef4444; color: #fff; font-size: 13px;
    font-weight: 500; border: none; border-radius: 10px; cursor: pointer;
    transition: opacity 0.15s; font-family: inherit;
  }
  .pp-modal-delete:disabled { opacity: 0.45; cursor: not-allowed; }

  /* Plan limits table */
  .pp-limits-title { font-size: 11px; font-weight: 600; color: var(--color-muted); letter-spacing: 0.06em; text-transform: uppercase; margin: 0 0 12px; }
  .pp-limits-table { width: 100%; border-collapse: collapse; }
  .pp-limits-table tr { border-bottom: 1px solid var(--color-border); }
  .pp-limits-table tr:last-child { border-bottom: none; }
  .pp-limits-table td { padding: 9px 0; font-size: 13px; }
  .pp-limits-table td:first-child { color: var(--color-sec); }
  .pp-limits-table td:last-child { color: var(--color-text); font-weight: 500; text-align: right; }
  .pp-upgrade-link { display: inline-block; margin-top: 16px; font-size: 13px; font-weight: 500; color: var(--color-text); text-decoration: none; }
  .pp-upgrade-link:hover { text-decoration: underline; }

  /* Loading skeleton */
  .pp-skeleton { height: 14px; background: var(--color-border); border-radius: 6px; animation: pp-shimmer 1.5s ease-in-out infinite; }
  @keyframes pp-shimmer { 0%,100%{opacity:0.5} 50%{opacity:1} }

  @media (max-width: 600px) {
    .pp-main { padding: 24px 16px 60px; }
    .pp-header { padding: 0 16px; }
    .pp-page-title { font-size: 18px; }
    .pp-section-body { padding: 16px; }
    .pp-section-head { padding: 14px 16px 12px; }
    .pp-danger-body { padding: 16px; }
    .pp-danger-head { padding: 14px 16px 12px; }
  }
  @media (max-width: 540px) {
    .pp-stats { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 360px) {
    .pp-stats { grid-template-columns: 1fr; }
  }
`;

export default function ProfilePage({ user }) {
    const navigate = useNavigate();

    const [profile, setProfile]       = useState(null);
    const [usage,   setUsage]         = useState(null);
    const [loading, setLoading]       = useState(true);
    const [darkMode, setDarkMode]     = useState(() => document.documentElement.classList.contains('dark'));

    const [displayName, setDisplayName]           = useState('');
    const [prefLang,    setPrefLang]              = useState('en');
    const [pdfAuto,     setPdfAuto]               = useState(true);
    const [saving,      setSaving]                = useState(false);
    const [savedMsg,    setSavedMsg]              = useState(false);

    const [showDeleteModal, setShowDeleteModal]   = useState(false);
    const [deleteConfirm,   setDeleteConfirm]     = useState('');
    const [deleting,        setDeleting]          = useState(false);

    useEffect(() => {
        Promise.all([
            api.get('/api/v1/profile'),
            api.get('/api/v1/usage'),
        ]).then(([pRes, uRes]) => {
            const p = pRes.data;
            setProfile(p);
            setDisplayName(p.display_name || '');
            setPrefLang(p.preferred_language || 'en');
            setPdfAuto(p.pdf_auto_download !== false);
            setUsage(uRes.data);
        }).catch(() => {}).finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.patch('/api/v1/profile', {
                display_name: displayName,
                preferred_language: prefLang,
                pdf_auto_download: pdfAuto,
            });
            setSavedMsg(true);
            setTimeout(() => setSavedMsg(false), 2400);
        } catch {}
        setSaving(false);
    };

    const handleDeleteAccount = async () => {
        if (deleteConfirm !== 'DELETE') return;
        setDeleting(true);
        try {
            await api.delete('/api/v1/profile');
            await supabase.auth.signOut();
            navigate('/', { replace: true });
        } catch {
            setDeleting(false);
        }
    };

    const toggleDarkMode = () => {
        const next = !darkMode;
        setDarkMode(next);
        document.documentElement.classList.toggle('dark', next);
        localStorage.setItem('neurativo_theme', next ? 'dark' : 'light');
    };

    const initials = (profile?.display_name || user?.email || '?')[0].toUpperCase();
    const usagePct = usage ? Math.min(100, (usage.lectures_this_month / usage.limit) * 100) : 0;
    const usageClass = usagePct >= 100 ? 'full' : usagePct >= 80 ? 'warn' : '';

    // Total lectures from usage + analytics
    const totalLectures  = usage ? usage.lectures_this_month : 0;
    const hoursRecorded  = profile ? Math.round((profile.total_hours_recorded || 0) * 10) / 10 : 0;
    const wordsTranscribed = profile ? (profile.total_words_transcribed || 0) : 0;

    return (
        <>
            <style>{CSS}</style>
            <div className="pp">
                {/* Header */}
                <header className="pp-header">
                    <Link to="/" className="pp-logo">
                        <div className="pp-logo-icon">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-dark-fg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                            </svg>
                        </div>
                        <span className="pp-wordmark">Neurativo</span>
                    </Link>
                    <Link to="/app" className="pp-back">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                        Dashboard
                    </Link>
                </header>

                <main className="pp-main">
                    <h1 className="pp-page-title">Profile</h1>
                    <p className="pp-page-sub">Manage your account and preferences</p>

                    {/* Avatar + identity */}
                    <div className="pp-section">
                        <div className="pp-section-head">
                            <div className="pp-section-title">Account</div>
                        </div>
                        <div className="pp-section-body">
                            <div className="pp-avatar-row">
                                <div className="pp-avatar">{initials}</div>
                                <div className="pp-avatar-info">
                                    <div className="pp-avatar-name">{profile?.display_name || user?.email?.split('@')[0] || 'User'}</div>
                                    <div className="pp-avatar-email">{user?.email}</div>
                                </div>
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Display name</label>
                                <input
                                    className="pp-input"
                                    type="text"
                                    value={displayName}
                                    onChange={e => setDisplayName(e.target.value)}
                                    placeholder="Your name"
                                    disabled={loading}
                                />
                            </div>
                            <div className="pp-field">
                                <label className="pp-label">Email</label>
                                <input className="pp-input" type="email" value={user?.email || ''} disabled />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <button className="pp-btn-save" onClick={handleSave} disabled={saving || loading}>
                                    {saving ? 'Saving…' : 'Save changes'}
                                </button>
                                {savedMsg && (
                                    <span className="pp-save-msg">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                        Saved
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Usage */}
                    <div className="pp-section">
                        <div className="pp-section-head">
                            <div className="pp-section-title">Usage this month</div>
                            <div className="pp-section-sub">{usage ? (usage.plan_tier || 'free').charAt(0).toUpperCase() + (usage.plan_tier || 'free').slice(1) : 'Free'} plan · resets on the 1st</div>
                        </div>
                        <div className="pp-section-body">
                            {loading ? (
                                <div className="pp-skeleton" style={{ width: '100%', height: 6, marginBottom: 8 }} />
                            ) : (
                                <>
                                    <div className="pp-usage-row">
                                        <span className="pp-usage-label">Live lectures</span>
                                        <span className="pp-usage-count">
                                            {usage?.lectures_this_month ?? 0} / {usage?.lectures_limit != null ? usage.lectures_limit : '∞'}
                                        </span>
                                    </div>
                                    <div className="pp-bar-bg">
                                        <div className={`pp-bar-fill ${usageClass}`} style={{ width: `${usagePct}%` }} />
                                    </div>
                                    {usage?.uploads_limit != null && (
                                        <>
                                            <div className="pp-usage-row" style={{ marginTop: 14 }}>
                                                <span className="pp-usage-label">Audio imports</span>
                                                <span className="pp-usage-count">{usage.uploads_this_month ?? 0} / {usage.uploads_limit}</span>
                                            </div>
                                            <div className="pp-bar-bg">
                                                <div
                                                    className={`pp-bar-fill${(usage.uploads_this_month / usage.uploads_limit) >= 1 ? ' full' : (usage.uploads_this_month / usage.uploads_limit) >= 0.8 ? ' warn' : ''}`}
                                                    style={{ width: `${Math.min(100, (usage.uploads_this_month / usage.uploads_limit) * 100)}%`, background: '#7c3aed' }}
                                                />
                                            </div>
                                        </>
                                    )}
                                    <p className="pp-usage-note" style={{ marginTop: 8 }}>
                                        {usage?.remaining > 0
                                            ? `${usage.remaining} live lecture${usage.remaining === 1 ? '' : 's'} remaining this month`
                                            : usage?.lectures_limit != null
                                            ? 'Live lecture limit reached this month'
                                            : 'Unlimited live lectures on your plan'}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Plan limits */}
                    {usage && (
                        <div className="pp-section">
                            <div className="pp-section-head">
                                <div className="pp-section-title">Your plan limits</div>
                                <div className="pp-section-sub">{(usage.plan_tier || 'free').charAt(0).toUpperCase() + (usage.plan_tier || 'free').slice(1)} plan</div>
                            </div>
                            <div className="pp-section-body">
                                <p className="pp-limits-title">Your plan limits</p>
                                <table className="pp-limits-table">
                                    <tbody>
                                        <tr>
                                            <td>Live lectures</td>
                                            <td>{usage.lectures_limit != null ? `${usage.lectures_limit} per month` : 'Unlimited'}</td>
                                        </tr>
                                        <tr>
                                            <td>Max live duration</td>
                                            <td>{usage.live_max_duration_label || 'Unlimited'}</td>
                                        </tr>
                                        <tr>
                                            <td>Audio imports</td>
                                            <td>{usage.uploads_limit != null ? `${usage.uploads_limit} per month` : 'Unlimited'}</td>
                                        </tr>
                                        <tr>
                                            <td>Max import size</td>
                                            <td>{usage.plan_tier === 'free' ? '60 min / 500 MB' : usage.plan_tier === 'student' ? '4 hours / 2 GB' : 'Unlimited'}</td>
                                        </tr>
                                    </tbody>
                                </table>
                                {(usage.plan_tier === 'free' || usage.plan_tier === 'student') && (
                                    <a href="#" className="pp-upgrade-link">
                                        {usage.plan_tier === 'free' ? 'Upgrade to Student →' : 'Upgrade to Pro →'}
                                    </a>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Stats */}
                    <div className="pp-section">
                        <div className="pp-section-head">
                            <div className="pp-section-title">All-time stats</div>
                        </div>
                        <div className="pp-section-body">
                            <div className="pp-stats">
                                <div className="pp-stat">
                                    <div className="pp-stat-n">{loading ? '—' : totalLectures}</div>
                                    <div className="pp-stat-l">Lectures this month</div>
                                </div>
                                <div className="pp-stat">
                                    <div className="pp-stat-n">{loading ? '—' : hoursRecorded}h</div>
                                    <div className="pp-stat-l">Hours recorded</div>
                                </div>
                                <div className="pp-stat">
                                    <div className="pp-stat-n">{loading ? '—' : wordsTranscribed > 999 ? `${Math.round(wordsTranscribed / 1000)}k` : wordsTranscribed}</div>
                                    <div className="pp-stat-l">Words transcribed</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Preferences */}
                    <div className="pp-section">
                        <div className="pp-section-head">
                            <div className="pp-section-title">Preferences</div>
                        </div>
                        <div className="pp-section-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
                            <div className="pp-toggle-row">
                                <div className="pp-toggle-info">
                                    <div className="pp-toggle-title">Auto-download PDF</div>
                                    <div className="pp-toggle-desc">Download the PDF automatically when export completes</div>
                                </div>
                                <button
                                    className={`pp-toggle ${pdfAuto ? 'on' : ''}`}
                                    onClick={() => setPdfAuto(p => !p)}
                                    aria-label="Toggle auto-download PDF"
                                />
                            </div>
                            <div className="pp-toggle-row">
                                <div className="pp-toggle-info">
                                    <div className="pp-toggle-title">Preferred language</div>
                                    <div className="pp-toggle-desc">Default transcription language hint</div>
                                </div>
                                <select
                                    value={prefLang}
                                    onChange={e => setPrefLang(e.target.value)}
                                    style={{ padding: '5px 8px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12, color: 'var(--color-sec)', background: 'var(--color-bg)', outline: 'none', fontFamily: 'inherit' }}
                                >
                                    <option value="en">English</option>
                                    <option value="ar">Arabic</option>
                                    <option value="zh">Chinese</option>
                                    <option value="fr">French</option>
                                    <option value="de">German</option>
                                    <option value="hi">Hindi</option>
                                    <option value="es">Spanish</option>
                                    <option value="it">Italian</option>
                                    <option value="ja">Japanese</option>
                                    <option value="ko">Korean</option>
                                    <option value="pt">Portuguese</option>
                                    <option value="ru">Russian</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Appearance */}
                    <div className="pp-section">
                        <div className="pp-section-head">
                            <div className="pp-section-title">Appearance</div>
                        </div>
                        <div className="pp-section-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
                            <div className="pp-toggle-row">
                                <div className="pp-toggle-info">
                                    <div className="pp-toggle-title">Dark mode</div>
                                    <div className="pp-toggle-desc">Use a dark theme across the entire app</div>
                                </div>
                                <button
                                    className={`pp-toggle ${darkMode ? 'on' : ''}`}
                                    onClick={toggleDarkMode}
                                    aria-label="Toggle dark mode"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Save preferences button */}
                    <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center' }}>
                        <button className="pp-btn-save" onClick={handleSave} disabled={saving || loading}>
                            {saving ? 'Saving…' : 'Save preferences'}
                        </button>
                        {savedMsg && (
                            <span className="pp-save-msg">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                                Saved
                            </span>
                        )}
                    </div>

                    {/* Danger zone */}
                    <div className="pp-danger-section">
                        <div className="pp-danger-head">
                            <div className="pp-danger-title">Danger zone</div>
                        </div>
                        <div className="pp-danger-body">
                            <p className="pp-danger-desc">
                                Deleting your account will permanently remove all your lectures, transcripts, summaries, and profile data. This action cannot be undone.
                            </p>
                            <button className="pp-btn-delete" onClick={() => setShowDeleteModal(true)}>
                                Delete my account
                            </button>
                        </div>
                    </div>
                </main>

                {/* Delete confirmation modal */}
                {showDeleteModal && (
                    <div className="pp-modal-overlay" onClick={() => !deleting && setShowDeleteModal(false)}>
                        <div className="pp-modal" onClick={e => e.stopPropagation()}>
                            <p className="pp-modal-title">Delete account?</p>
                            <p className="pp-modal-sub">
                                All your lectures, transcripts, summaries, and data will be permanently deleted. This cannot be undone.
                            </p>
                            <div className="pp-modal-confirm-label">Type DELETE to confirm</div>
                            <input
                                className="pp-modal-confirm-input"
                                type="text"
                                value={deleteConfirm}
                                onChange={e => setDeleteConfirm(e.target.value)}
                                placeholder="DELETE"
                                autoFocus
                            />
                            <div className="pp-modal-btns">
                                <button className="pp-modal-cancel" onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); }} disabled={deleting}>
                                    Cancel
                                </button>
                                <button
                                    className="pp-modal-delete"
                                    onClick={handleDeleteAccount}
                                    disabled={deleteConfirm !== 'DELETE' || deleting}
                                >
                                    {deleting ? 'Deleting…' : 'Delete account'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
