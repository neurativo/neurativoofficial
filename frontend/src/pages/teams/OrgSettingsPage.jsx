import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/react';
import { getDashboard, updateOrg } from '../../lib/teamsApi.js';

const CSS = `
  .os *, .os *::before, .os *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .os { font-family: 'Inter', sans-serif; background: #fafaf9; color: #1a1a1a; min-height: 100vh; -webkit-font-smoothing: antialiased; }
  .os-nav { height: 60px; display: flex; align-items: center; padding: 0 24px; border-bottom: 1px solid #f0ede8; gap: 12px; }
  .os-logo { font-size: 15px; font-weight: 600; text-decoration: none; color: #1a1a1a; display: flex; align-items: center; gap: 8px; }
  .os-logo-icon { width: 26px; height: 26px; background: #1a1a1a; border-radius: 7px; display: flex; align-items: center; justify-content: center; }
  .os-logo-icon svg { width: 14px; height: 14px; }
  .os-logo-badge { font-size: 11px; font-weight: 500; color: #6b6b6b; background: #f0ede8; border-radius: 6px; padding: 2px 7px; }
  .os-nav-org { font-size: 14px; color: #6b6b6b; }
  .os-nav-right { margin-left: auto; }
  .os-btn-sm { font-size: 12px; padding: 6px 12px; border-radius: 8px; border: 1.5px solid #e5e2dd; background: transparent; color: #1a1a1a; cursor: pointer; text-decoration: none; transition: border-color .15s; }
  .os-btn-sm:hover { border-color: #1a1a1a; }
  .os-body { max-width: 560px; margin: 48px auto; padding: 0 24px; }
  .os-title { font-size: 20px; font-weight: 700; letter-spacing: -.4px; margin-bottom: 6px; }
  .os-sub { font-size: 14px; color: #6b6b6b; margin-bottom: 32px; }
  .os-section { background: #fff; border: 1.5px solid #f0ede8; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
  .os-section-title { font-size: 14px; font-weight: 600; margin-bottom: 16px; }
  .os-field { margin-bottom: 16px; }
  .os-label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; }
  .os-label-hint { font-size: 12px; font-weight: 400; color: #a3a3a3; margin-left: 4px; }
  .os-input { width: 100%; padding: 9px 12px; border: 1.5px solid #e5e2dd; border-radius: 8px; font-size: 13px; font-family: inherit; background: #fff; color: #1a1a1a; transition: border-color .15s; outline: none; }
  .os-input:focus { border-color: #1a1a1a; }
  .os-domain-row { display: flex; gap: 8px; margin-bottom: 8px; }
  .os-domain-tag { display: inline-flex; align-items: center; gap: 6px; background: #f0ede8; border-radius: 6px; padding: 4px 10px; font-size: 12px; }
  .os-domain-remove { background: none; border: none; cursor: pointer; color: #a3a3a3; font-size: 14px; line-height: 1; padding: 0 2px; }
  .os-domain-remove:hover { color: #ef4444; }
  .os-domains-wrap { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; min-height: 28px; }
  .os-btn { padding: 9px 18px; border-radius: 9px; border: none; font-size: 13px; font-weight: 500; cursor: pointer; transition: opacity .15s; }
  .os-btn-dark { background: #1a1a1a; color: #fafaf9; }
  .os-btn-dark:hover:not(:disabled) { opacity: .8; }
  .os-btn:disabled { opacity: .5; cursor: not-allowed; }
  .os-success { font-size: 12px; color: #16a34a; margin-top: 8px; }
  .os-error { font-size: 12px; color: #ef4444; margin-top: 8px; }
  .os-loading { text-align: center; padding: 80px; color: #6b6b6b; font-size: 14px; }
`;

export default function OrgSettingsPage() {
    const { slug } = useParams();
    const { isLoaded, isSignedIn } = useUser();
    const navigate = useNavigate();

    const [org, setOrg]         = useState(null);
    const [loading, setLoading] = useState(true);

    const [name, setName]         = useState('');
    const [logoUrl, setLogoUrl]   = useState('');
    const [domains, setDomains]   = useState([]);
    const [newDomain, setNewDomain] = useState('');

    const [saving, setSaving]   = useState(false);
    const [msg, setMsg]         = useState({ type: '', text: '' });

    useEffect(() => {
        if (!isLoaded || !isSignedIn) return;
        getDashboard(slug).then(r => {
            const o = r.data.org;
            setOrg(o);
            setName(o.name || '');
            setLogoUrl(o.logo_url || '');
            setDomains(o.allowed_domains || []);
        }).catch(() => navigate(`/${slug}/dashboard`))
        .finally(() => setLoading(false));
    }, [isLoaded, isSignedIn, slug]);

    function addDomain() {
        const d = newDomain.trim().toLowerCase().replace(/^@/, '');
        if (!d || domains.includes(d)) return;
        setDomains(prev => [...prev, d]);
        setNewDomain('');
    }

    async function handleSave() {
        setSaving(true);
        setMsg({ type: '', text: '' });
        try {
            await updateOrg(slug, {
                name: name.trim(),
                logo_url: logoUrl.trim() || null,
                allowed_domains: domains,
            });
            setMsg({ type: 'ok', text: 'Settings saved.' });
        } catch (err) {
            setMsg({ type: 'err', text: err.response?.data?.detail || 'Failed to save settings.' });
        } finally {
            setSaving(false);
        }
    }

    if (!isLoaded || !isSignedIn) return null;
    if (loading) return <div className="os"><style>{CSS}</style><div className="os-loading">Loading…</div></div>;

    return (
        <div className="os">
            <style>{CSS}</style>
            <nav className="os-nav">
                <a href="/" className="os-logo">
                    <div className="os-logo-icon"><svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
                    Neurativo <span className="os-logo-badge">Teams</span>
                </a>
                <span className="os-nav-org">/ {org?.name}</span>
                <div className="os-nav-right">
                    <Link to={`/${slug}/dashboard`} className="os-btn-sm">← Dashboard</Link>
                </div>
            </nav>

            <div className="os-body">
                <h1 className="os-title">Organization settings</h1>
                <p className="os-sub">Manage your organization's profile and access control.</p>

                <div className="os-section">
                    <div className="os-section-title">General</div>
                    <div className="os-field">
                        <label className="os-label">Organization name</label>
                        <input className="os-input" value={name} onChange={e => setName(e.target.value)} maxLength={60} />
                    </div>
                    <div className="os-field">
                        <label className="os-label">Logo URL <span className="os-label-hint">optional</span></label>
                        <input className="os-input" placeholder="https://yourcompany.com/logo.png" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} />
                    </div>
                </div>

                <div className="os-section">
                    <div className="os-section-title">Email domain allowlist</div>
                    <p style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 16, lineHeight: 1.5 }}>
                        Anyone who signs up with one of these email domains will automatically receive a student seat.
                    </p>
                    <div className="os-domains-wrap">
                        {domains.map(d => (
                            <span key={d} className="os-domain-tag">
                                @{d}
                                <button className="os-domain-remove" onClick={() => setDomains(prev => prev.filter(x => x !== d))}>×</button>
                            </span>
                        ))}
                        {domains.length === 0 && <span style={{ fontSize: 12, color: '#a3a3a3' }}>No domains added</span>}
                    </div>
                    <div className="os-domain-row">
                        <input
                            className="os-input" style={{ flex: 1 }}
                            placeholder="acmecorp.com"
                            value={newDomain}
                            onChange={e => setNewDomain(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addDomain())}
                        />
                        <button className="os-btn os-btn-dark" onClick={addDomain}>Add</button>
                    </div>
                </div>

                <button className="os-btn os-btn-dark" onClick={handleSave} disabled={saving || !name.trim()}>
                    {saving ? 'Saving…' : 'Save settings'}
                </button>
                {msg.text && <div className={msg.type === 'ok' ? 'os-success' : 'os-error'}>{msg.text}</div>}
            </div>
        </div>
    );
}
