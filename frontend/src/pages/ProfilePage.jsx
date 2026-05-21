import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useClerk } from '@clerk/react';
import Footer from '../components/Footer';
import { useSEO } from '../lib/useSEO';
import { useCreditsApi } from '../lib/creditsApi.js';

const PLAN_COLORS = { free: '#6b7280', student: '#7c3aed', pro: '#0ea5e9' };
const PLAN_LABELS = { free: 'Free', student: 'Student', pro: 'Pro' };

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
  .pp-wordmark { font-size: 14px; font-weight: 600; color: var(--color-text); letter-spacing: -0.3px; }
  .pp-back {
    margin-left: auto; display: flex; align-items: center; gap: 5px;
    font-size: 13px; color: var(--color-muted); text-decoration: none; transition: color 0.15s;
  }
  .pp-back:hover { color: var(--color-text); }
  .pp-signout {
    margin-left: 16px; padding: 6px 14px;
    background: none; border: 1px solid var(--color-border); border-radius: 8px;
    font-size: 12px; font-weight: 500; color: var(--color-muted);
    cursor: pointer; font-family: inherit; transition: color 0.15s, border-color 0.15s;
  }
  .pp-signout:hover { color: #ef4444; border-color: #fecaca; }

  /* Main */
  .pp-main { max-width: 640px; margin: 0 auto; padding: 40px 24px 80px; }
  .pp-page-title { font-size: 22px; font-weight: 600; letter-spacing: -0.5px; margin: 0 0 2px; }
  .pp-page-sub { font-size: 13px; color: var(--color-muted); margin: 0 0 36px; }

  /* Section */
  .pp-section { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 16px; margin-bottom: 16px; overflow: hidden; }
  .pp-section-head { padding: 18px 20px 14px; border-bottom: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between; }
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

  /* Manage account link */
  .pp-manage-link {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 12px; color: var(--color-muted); text-decoration: none;
    transition: color 0.15s; margin-top: 12px; border-top: 1px solid var(--color-border);
    padding-top: 12px; width: 100%;
  }
  .pp-manage-link:hover { color: var(--color-text); }

  /* Save button */
  .pp-btn-save {
    padding: 9px 20px; background: var(--color-dark); color: var(--color-dark-fg); font-size: 13px;
    font-weight: 500; border: none; border-radius: 10px; cursor: pointer;
    transition: opacity 0.15s; font-family: inherit;
  }
  .pp-btn-save:hover { opacity: 0.82; }
  .pp-btn-save:disabled { opacity: 0.45; cursor: not-allowed; }
  .pp-save-msg { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #22c55e; margin-left: 12px; }

  /* Plan badge */
  .pp-plan-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600;
    letter-spacing: 0.03em; text-transform: uppercase;
  }
  .pp-plan-badge-dot { width: 6px; height: 6px; border-radius: 50%; }

  /* Plan current card */
  .pp-plan-current {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px; border-radius: 12px; border: 1px solid var(--color-border);
    background: var(--color-bg); margin-bottom: 16px;
  }
  .pp-plan-current-left { display: flex; flex-direction: column; gap: 3px; }
  .pp-plan-current-name { font-size: 15px; font-weight: 600; color: var(--color-text); letter-spacing: -0.3px; }
  .pp-plan-current-desc { font-size: 12px; color: var(--color-muted); }

  /* Plan comparison */
  .pp-plan-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 4px; }
  .pp-plan-card {
    border: 1px solid var(--color-border); border-radius: 12px; padding: 14px 12px;
    display: flex; flex-direction: column; gap: 10px;
    transition: border-color 0.15s;
  }
  .pp-plan-card.current { border-color: var(--color-text); }
  .pp-plan-card-name { font-size: 12px; font-weight: 600; letter-spacing: -0.1px; }
  .pp-plan-card-price { font-size: 18px; font-weight: 700; letter-spacing: -0.5px; color: var(--color-text); }
  .pp-plan-card-price span { font-size: 11px; font-weight: 400; color: var(--color-muted); }
  .pp-plan-card-features { display: flex; flex-direction: column; gap: 5px; flex: 1; }
  .pp-plan-card-feat { font-size: 11px; color: var(--color-sec); display: flex; gap: 5px; align-items: flex-start; line-height: 1.4; }
  .pp-plan-card-feat-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--color-muted); flex-shrink: 0; margin-top: 5px; }
  .pp-plan-btn {
    width: 100%; padding: 8px; border-radius: 8px; font-size: 12px; font-weight: 500;
    cursor: pointer; font-family: inherit; transition: opacity 0.15s; border: none;
    text-align: center; text-decoration: none; display: block;
  }
  .pp-plan-btn-current {
    background: var(--color-border); color: var(--color-muted); cursor: default;
  }
  .pp-plan-btn-upgrade {
    background: var(--color-dark); color: var(--color-dark-fg);
  }
  .pp-plan-btn-upgrade:hover { opacity: 0.82; }

  /* Credits section */
  .pp-credits-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .pp-credit-tile { flex: 1; min-width: 120px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 12px; padding: 14px 16px; }
  .pp-credit-tile-n { font-size: 26px; font-weight: 700; letter-spacing: -1px; color: var(--color-text); font-family: monospace; }
  .pp-credit-tile-l { font-size: 11px; color: var(--color-muted); margin-top: 3px; }
  .pp-credit-sub-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; }
  .pp-credit-sub-badge.active { background: rgba(22,163,74,0.1); color: #16a34a; border: 1px solid rgba(22,163,74,0.25); }
  .pp-credit-sub-badge.inactive { background: var(--color-border); color: var(--color-muted); border: 1px solid transparent; }
  .pp-credits-link { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--color-muted); text-decoration: none; margin-top: 14px; border-top: 1px solid var(--color-border); padding-top: 12px; width: 100%; transition: color .15s; }
  .pp-credits-link:hover { color: var(--color-text); }

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
    .pp-plan-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 540px) {
    .pp-stats { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 360px) {
    .pp-stats { grid-template-columns: 1fr; }
  }

  /* Dark mode */
  .dark .pp-btn-delete { border-color: rgba(239,68,68,0.3); }
  .dark .pp-btn-delete:hover { background: rgba(239,68,68,0.1); }
`;

const PLANS = [
    {
        key: 'free',
        name: 'Free',
        price: '$0',
        period: '',
        features: ['5 free starter credits', 'Live recording · 30 min/session', 'Audio imports · 60 min/file', 'PDF preview · 2 sections · watermarked'],
    },
    {
        key: 'student',
        name: 'Student',
        price: '$9.99',
        period: '/mo',
        features: ['15 credits/month included', 'Unlimited live · 3 hrs max', 'Unlimited imports · 3 hrs max', 'Full summary · PDF · Q&A · Sharing'],
    },
    {
        key: 'pro',
        name: 'Pro',
        price: '$19.99',
        period: '/mo',
        features: ['30 credits/month included', 'Unlimited live · 4 hrs max/session', 'Unlimited imports · 4 hrs max/file', '40 hrs/month ceiling · priority processing'],
    },
];

function PlanBadge({ tier }) {
    const color = PLAN_COLORS[tier] || PLAN_COLORS.free;
    const label = PLAN_LABELS[tier] || 'Free';
    return (
        <span className="pp-plan-badge" style={{ background: color + '18', color }}>
            <span className="pp-plan-badge-dot" style={{ background: color }} />
            {label}
        </span>
    );
}

export default function ProfilePage({ user }) {
    useSEO({ title: 'Profile', noindex: true });
    const navigate = useNavigate();
    const { signOut } = useClerk();
    const creditsApi = useCreditsApi();

    const [profile, setProfile]   = useState(null);
    const [usage,   setUsage]     = useState(null);
    const [credits, setCredits]   = useState(null);
    const [loading, setLoading]   = useState(true);
    const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

    const [displayName, setDisplayName] = useState('');
    const [prefLang,    setPrefLang]    = useState('en');
    const [pdfAuto,     setPdfAuto]     = useState(true);
    const [saving,      setSaving]      = useState(false);
    const [savedMsg,    setSavedMsg]    = useState(false);

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirm,   setDeleteConfirm]   = useState('');
    const [deleting,        setDeleting]        = useState(false);

    const [subInfo,        setSubInfo]         = useState(null);
    const [checkoutLoading, setCheckoutLoading] = useState(null);
    const [cancelLoading,   setCancelLoading]   = useState(false);
    const [portalLoading,   setPortalLoading]   = useState(false);
    const [payHistory,     setPayHistory]       = useState(null);

    useEffect(() => {
        Promise.all([
            api.get('/api/v1/profile'),
            api.get('/api/v1/usage'),
            creditsApi.getBalance(),
            api.get('/api/v1/billing/subscription').catch(() => ({ data: null })),
            api.get('/api/v1/billing/payment-history').catch(() => ({ data: null })),
        ]).then(([pRes, uRes, cRes, sRes, phRes]) => {
            const p = pRes.data;
            setProfile(p);
            setDisplayName(p.display_name || '');
            setPrefLang(p.preferred_language || 'en');
            setPdfAuto(p.pdf_auto_download !== false);
            setUsage(uRes.data);
            setCredits(cRes.data);
            if (sRes.data) setSubInfo(sRes.data);
            if (phRes.data) setPayHistory(phRes.data);
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
            await signOut();
            navigate('/', { replace: true });
        } catch {
            setDeleting(false);
        }
    };

    const handleSignOut = async () => {
        await signOut();
        navigate('/', { replace: true });
    };

    const toggleDarkMode = () => {
        const next = !darkMode;
        setDarkMode(next);
        document.documentElement.classList.toggle('dark', next);
        localStorage.setItem('neurativo_theme', next ? 'dark' : 'light');
    };

    const handleUpgrade = async (plan) => {
        setCheckoutLoading(plan);
        try {
            const res = await api.post('/api/v1/billing/checkout', { plan });
            const url = res.data.checkout_url;
            if (!url) throw new Error('No checkout URL returned');
            window.location.href = url;
        } catch (e) {
            console.error('Checkout error', e);
            const msg = e?.response?.data?.detail || e?.message || 'Could not start checkout. Please try again.';
            alert(msg);
            setCheckoutLoading(null);
        }
    };

    const handleCancel = async () => {
        if (!window.confirm('Cancel your subscription? Your plan stays active until the current period ends.')) return;
        setCancelLoading(true);
        try {
            await api.post('/api/v1/billing/cancel');
            setSubInfo(s => ({ ...s, subscription_status: 'cancelled', has_active_subscription: false }));
        } catch (e) {
            alert('Could not cancel subscription. Please try again or contact support.');
        }
        setCancelLoading(false);
    };

    const handleManageBilling = async () => {
        setPortalLoading(true);
        try {
            const res = await api.post('/api/v1/billing/portal');
            const url = res.data.portal_url;
            if (!url) throw new Error('No portal URL');
            window.location.href = url;
        } catch (e) {
            const msg = e?.response?.data?.detail || 'Could not open billing portal. Please try again.';
            alert(msg);
            setPortalLoading(false);
        }
    };

    const planTier      = usage?.plan_tier || 'free';
    const initials      = (profile?.display_name || user?.email || '?')[0].toUpperCase();
    const livePct       = usage?.lectures_limit != null ? Math.min(100, (usage.lectures_this_month / usage.lectures_limit) * 100) : 0;
    const liveClass     = livePct >= 100 ? 'full' : livePct >= 80 ? 'warn' : '';
    const uploadPct     = usage?.uploads_limit != null ? Math.min(100, (usage.uploads_this_month / usage.uploads_limit) * 100) : 0;
    const uploadClass   = uploadPct >= 100 ? 'full' : uploadPct >= 80 ? 'warn' : '';
    const totalLectures = usage?.total_lectures_all_time ?? 0;
    const hoursRecorded = profile ? Math.round((profile.total_hours_recorded || 0) * 10) / 10 : 0;
    const wordsTotal    = profile ? (profile.total_words_transcribed || 0) : 0;

    return (
        <>
            <style>{CSS}</style>
            <div className="pp">
                {/* Header */}
                <header className="pp-header">
                    <Link to="/" className="pp-logo">
                        <img src="/logo.png" alt="Neurativo" style={{ width: 24, height: 24, borderRadius: 6 }} />
                        <span className="pp-wordmark">Neurativo</span>
                    </Link>
                    <Link to="/app" className="pp-back">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                        Dashboard
                    </Link>
                    <button className="pp-signout" onClick={handleSignOut}>Sign out</button>
                </header>

                <main className="pp-main">
                    <h1 className="pp-page-title">Profile</h1>
                    <p className="pp-page-sub">Manage your account and preferences</p>

                    {/* Account */}
                    <div className="pp-section">
                        <div className="pp-section-head">
                            <div>
                                <div className="pp-section-title">Account</div>
                            </div>
                            {!loading && <PlanBadge tier={planTier} />}
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
                            <a
                                href="https://accounts.neurativo.com/user"
                                target="_blank"
                                rel="noreferrer"
                                className="pp-manage-link"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                                </svg>
                                Manage account on Clerk (email, security)
                            </a>
                        </div>
                    </div>

                    {/* Plan */}
                    <div className="pp-section">
                        <div className="pp-section-head">
                            <div>
                                <div className="pp-section-title">Plan</div>
                                <div className="pp-section-sub">
                                    {planTier === 'pro' ? 'You have full access' : 'Upgrade anytime to unlock more'}
                                </div>
                            </div>
                        </div>
                        <div className="pp-section-body">
                            {loading ? (
                                <div className="pp-skeleton" style={{ width: '60%', marginBottom: 12 }} />
                            ) : (
                                <div className="pp-plan-grid">
                                    {PLANS.map(plan => {
                                        const isCurrent = plan.key === planTier;
                                        const isDowngrade = PLANS.findIndex(p => p.key === plan.key) < PLANS.findIndex(p => p.key === planTier);
                                        return (
                                            <div key={plan.key} className={`pp-plan-card${isCurrent ? ' current' : ''}`}>
                                                <div>
                                                    <div className="pp-plan-card-name" style={{ color: PLAN_COLORS[plan.key] }}>{plan.name}</div>
                                                    <div className="pp-plan-card-price">
                                                        {plan.price}<span>{plan.period}</span>
                                                    </div>
                                                </div>
                                                <div className="pp-plan-card-features">
                                                    {plan.features.map(f => (
                                                        <div key={f} className="pp-plan-card-feat">
                                                            <span className="pp-plan-card-feat-dot" />
                                                            {f}
                                                        </div>
                                                    ))}
                                                </div>
                                                {isCurrent ? (
                                                    <span className="pp-plan-btn pp-plan-btn-current">Current plan</span>
                                                ) : isDowngrade ? null : (
                                                    <button
                                                        className="pp-plan-btn pp-plan-btn-upgrade"
                                                        disabled={!!checkoutLoading}
                                                        onClick={() => handleUpgrade(plan.key)}
                                                        style={{ border: 'none', cursor: checkoutLoading ? 'default' : 'pointer' }}
                                                    >
                                                        {checkoutLoading === plan.key ? 'Redirecting…' : `Upgrade to ${plan.name}`}
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {!loading && subInfo?.has_active_subscription && (
                                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                    {subInfo.subscription_period_end && (
                                        <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                                            Renews {new Date(subInfo.subscription_period_end).toLocaleDateString()}
                                        </span>
                                    )}
                                    <button
                                        onClick={handleManageBilling}
                                        disabled={portalLoading}
                                        style={{ fontSize: 11, color: 'var(--color-muted)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                                    >
                                        {portalLoading ? 'Opening…' : 'Manage billing / payment method'}
                                    </button>
                                    <button
                                        onClick={handleCancel}
                                        disabled={cancelLoading}
                                        style={{ fontSize: 11, color: '#e54d4d', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                                    >
                                        {cancelLoading ? 'Cancelling…' : 'Cancel subscription'}
                                    </button>
                                </div>
                            )}
                            {!loading && subInfo && !subInfo.has_active_subscription && subInfo.subscription_status === 'cancelled' && (
                                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-muted)' }}>
                                    Subscription cancelled — access until period end.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Usage this month */}
                    <div className="pp-section">
                        <div className="pp-section-head">
                            <div>
                                <div className="pp-section-title">Usage this month</div>
                                <div className="pp-section-sub">{PLAN_LABELS[planTier] || 'Free'} plan · resets on the 1st</div>
                            </div>
                        </div>
                        <div className="pp-section-body">
                            {loading ? (
                                <div className="pp-skeleton" style={{ width: '100%', height: 6, marginBottom: 8 }} />
                            ) : (
                                <>
                                    {/* Live lectures */}
                                    <div className="pp-usage-row">
                                        <span className="pp-usage-label">Live lectures</span>
                                        <span className="pp-usage-count">
                                            {usage?.lectures_this_month ?? 0} / {usage?.lectures_limit != null ? usage.lectures_limit : '∞'}
                                        </span>
                                    </div>
                                    <div className="pp-bar-bg">
                                        <div className={`pp-bar-fill ${liveClass}`} style={{ width: usage?.lectures_limit != null ? `${livePct}%` : '0%' }} />
                                    </div>

                                    {/* Audio imports */}
                                    <div className="pp-usage-row" style={{ marginTop: 14 }}>
                                        <span className="pp-usage-label">Audio imports</span>
                                        <span className="pp-usage-count">
                                            {usage?.uploads_this_month ?? 0} / {usage?.uploads_limit != null ? usage.uploads_limit : '∞'}
                                        </span>
                                    </div>
                                    <div className="pp-bar-bg">
                                        <div
                                            className={`pp-bar-fill ${uploadClass}`}
                                            style={{ width: usage?.uploads_limit != null ? `${uploadPct}%` : '0%', background: '#7c3aed' }}
                                        />
                                    </div>

                                    <p className="pp-usage-note" style={{ marginTop: 8 }}>
                                        {usage?.lectures_limit != null
                                            ? usage.lectures_this_month >= usage.lectures_limit
                                                ? 'Live lecture limit reached — resets on the 1st'
                                                : `${usage.lectures_limit - usage.lectures_this_month} live lecture${usage.lectures_limit - usage.lectures_this_month === 1 ? '' : 's'} remaining`
                                            : 'Unlimited live lectures on your plan'}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Credits */}
                    <div className="pp-section">
                        <div className="pp-section-head">
                            <div>
                                <div className="pp-section-title">Credits</div>
                                <div className="pp-section-sub">1 credit = 1 lecture processed</div>
                            </div>
                        </div>
                        <div className="pp-section-body">
                            {loading ? (
                                <div className="pp-skeleton" style={{ width: '60%', height: 14 }} />
                            ) : credits ? (() => {
                                const subStatus  = credits.credits_sub_status || 'none';
                                const subExpires = credits.credits_sub_expires;
                                const subActive  = subStatus === 'monthly' && subExpires && new Date(subExpires) > new Date();
                                return (
                                    <>
                                        <div className="pp-credits-row">
                                            <div className="pp-credit-tile">
                                                <div className="pp-credit-tile-n">{credits.credits ?? 0}</div>
                                                <div className="pp-credit-tile-l">credits remaining</div>
                                            </div>
                                            <div className="pp-credit-tile">
                                                <div style={{ marginBottom: 6 }}>
                                                    <span className={`pp-credit-sub-badge ${subActive ? 'active' : 'inactive'}`}>
                                                        {subActive ? '● Active' : '○ No sub'}
                                                    </span>
                                                </div>
                                                <div className="pp-credit-tile-l">
                                                    {subActive
                                                        ? `Monthly subscription · expires ${new Date(subExpires).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                                        : 'No active subscription'}
                                                </div>
                                            </div>
                                        </div>
                                        {credits.low_credits && !subActive && (
                                            <div style={{ marginTop: 12, fontSize: 12, color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
                                                ⚠ Running low on credits
                                            </div>
                                        )}
                                        <Link to="/credits" className="pp-credits-link">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                            Manage credits, buy packs, or subscribe →
                                        </Link>
                                    </>
                                );
                            })() : (
                                <Link to="/credits" className="pp-credits-link">View credits →</Link>
                            )}
                        </div>
                    </div>

                    {/* Billing History */}
                    {(payHistory?.payments?.length > 0 || payHistory?.subscription?.dodo_subscription_id) && (
                        <div className="pp-section">
                            <div className="pp-section-head">
                                <div>
                                    <div className="pp-section-title">Billing history</div>
                                    <div className="pp-section-sub">Credit pack purchases and subscription details</div>
                                </div>
                            </div>
                            <div className="pp-section-body">
                                {payHistory?.subscription?.dodo_subscription_id && (
                                    <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 10 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Active Subscription</div>
                                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                                            <div>
                                                <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>Plan</div>
                                                <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{payHistory.subscription.plan_tier || '—'}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>Status</div>
                                                <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize', color: ['active','renewed'].includes(payHistory.subscription.subscription_status) ? '#16a34a' : 'var(--color-muted)' }}>
                                                    {payHistory.subscription.subscription_status || '—'}
                                                </div>
                                            </div>
                                            {payHistory.subscription.subscription_period_end && (
                                                <div>
                                                    <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>Next billing</div>
                                                    <div style={{ fontSize: 13 }}>{new Date(payHistory.subscription.subscription_period_end).toLocaleDateString()}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {payHistory?.payments?.length > 0 && (
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)', marginBottom: 8 }}>Credit Pack Purchases</div>
                                        {payHistory.payments.map((p, i) => (
                                            <div key={p.payment_id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < payHistory.payments.length - 1 ? '1px solid var(--color-border)' : 'none', gap: 12, flexWrap: 'wrap' }}>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 500, textTransform: 'capitalize' }}>
                                                        {(p.product || '').replace(/_/g, ' ') || 'Credit Pack'}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                                                        {p.credits} credits · {new Date(p.date).toLocaleDateString()}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>
                                                    ${Number(p.price_usd || 0).toFixed(2)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* All-time stats */}
                    <div className="pp-section">
                        <div className="pp-section-head">
                            <div className="pp-section-title">All-time stats</div>
                        </div>
                        <div className="pp-section-body">
                            <div className="pp-stats">
                                <div className="pp-stat">
                                    <div className="pp-stat-n">{loading ? '—' : totalLectures}</div>
                                    <div className="pp-stat-l">Total lectures</div>
                                </div>
                                <div className="pp-stat">
                                    <div className="pp-stat-n">{loading ? '—' : `${hoursRecorded}h`}</div>
                                    <div className="pp-stat-l">Hours recorded</div>
                                </div>
                                <div className="pp-stat">
                                    <div className="pp-stat-n">{loading ? '—' : wordsTotal > 999 ? `${Math.round(wordsTotal / 1000)}k` : wordsTotal}</div>
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
                                    <div className="pp-toggle-title">Dark mode</div>
                                    <div className="pp-toggle-desc">Use a dark theme across the entire app</div>
                                </div>
                                <button
                                    className={`pp-toggle ${darkMode ? 'on' : ''}`}
                                    onClick={toggleDarkMode}
                                    aria-label="Toggle dark mode"
                                />
                            </div>
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
            <Footer />
        </>
    );
}
