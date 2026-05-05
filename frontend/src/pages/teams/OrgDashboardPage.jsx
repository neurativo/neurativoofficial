import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/react';
import {
    getDashboard, createInvite, revokeInvite, updateMember, listInvites,
} from '../../lib/teamsApi.js';

const CSS = `
  .od *, .od *::before, .od *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .od { font-family: 'Inter', sans-serif; background: #fafaf9; color: #1a1a1a; min-height: 100vh; -webkit-font-smoothing: antialiased; }
  .od-nav { height: 60px; display: flex; align-items: center; padding: 0 24px; border-bottom: 1px solid #f0ede8; gap: 12px; }
  .od-logo { font-size: 15px; font-weight: 600; text-decoration: none; color: #1a1a1a; display: flex; align-items: center; gap: 8px; }
  .od-logo-icon { width: 26px; height: 26px; background: #1a1a1a; border-radius: 7px; display: flex; align-items: center; justify-content: center; }
  .od-logo-icon svg { width: 14px; height: 14px; }
  .od-logo-badge { font-size: 11px; font-weight: 500; color: #6b6b6b; background: #f0ede8; border-radius: 6px; padding: 2px 7px; }
  .od-nav-org { font-size: 14px; color: #6b6b6b; }
  .od-nav-right { margin-left: auto; display: flex; gap: 8px; }
  .od-btn-sm { font-size: 12px; padding: 6px 12px; border-radius: 8px; border: 1.5px solid #e5e2dd; background: transparent; color: #1a1a1a; cursor: pointer; text-decoration: none; transition: border-color .15s; }
  .od-btn-sm:hover { border-color: #1a1a1a; }
  .od-btn-dark-sm { font-size: 12px; padding: 6px 12px; border-radius: 8px; border: none; background: #1a1a1a; color: #fafaf9; cursor: pointer; transition: opacity .15s; }
  .od-btn-dark-sm:hover { opacity: .8; }

  .od-body { max-width: 960px; margin: 0 auto; padding: 32px 24px; }

  /* Seat summary */
  .od-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .od-stat { background: #fff; border: 1.5px solid #f0ede8; border-radius: 12px; padding: 18px 20px; }
  .od-stat-val { font-size: 28px; font-weight: 700; letter-spacing: -1px; }
  .od-stat-lbl { font-size: 12px; color: #6b6b6b; margin-top: 2px; }

  /* Section */
  .od-section { margin-bottom: 36px; }
  .od-section-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .od-section-title { font-size: 15px; font-weight: 600; }
  .od-section-header-right { margin-left: auto; }

  /* Members table */
  .od-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .od-table th { text-align: left; padding: 8px 12px; font-weight: 500; color: #6b6b6b; border-bottom: 1px solid #f0ede8; font-size: 12px; }
  .od-table td { padding: 10px 12px; border-bottom: 1px solid #f9f7f5; vertical-align: middle; }
  .od-table tr:last-child td { border-bottom: none; }
  .od-table-wrap { background: #fff; border: 1.5px solid #f0ede8; border-radius: 12px; overflow: hidden; }
  .od-badge { display: inline-block; font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 6px; }
  .od-badge-admin { background: #f0ede8; color: #6b6b6b; }
  .od-badge-pro { background: #faf5ff; color: #7c3aed; border: 1px solid #e9d5ff; }
  .od-badge-student { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
  .od-badge-pending { background: #fefce8; color: #a16207; border: 1px solid #fde68a; }
  .od-tier-select { font-size: 12px; border: 1.5px solid #e5e2dd; border-radius: 6px; padding: 3px 8px; background: #fff; color: #1a1a1a; cursor: pointer; font-family: inherit; }
  .od-remove-btn { font-size: 11px; color: #ef4444; background: none; border: none; cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: background .15s; }
  .od-remove-btn:hover { background: #fef2f2; }
  .od-empty { text-align: center; padding: 32px; color: #a3a3a3; font-size: 13px; }

  /* Invite panel */
  .od-invite-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .od-invite-input { flex: 1; min-width: 180px; padding: 8px 12px; border: 1.5px solid #e5e2dd; border-radius: 8px; font-size: 13px; font-family: inherit; background: #fff; outline: none; transition: border-color .15s; }
  .od-invite-input:focus { border-color: #1a1a1a; }
  .od-tier-btn-row { display: flex; gap: 6px; }
  .od-tier-btn { font-size: 12px; padding: 7px 12px; border-radius: 8px; border: 1.5px solid #e5e2dd; background: transparent; cursor: pointer; transition: all .15s; font-family: inherit; }
  .od-tier-btn.selected { border-color: #1a1a1a; background: #1a1a1a; color: #fafaf9; }

  /* Active invites */
  .od-invite-list { display: flex; flex-direction: column; gap: 8px; }
  .od-invite-item { background: #fff; border: 1.5px solid #f0ede8; border-radius: 10px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .od-invite-url { font-size: 12px; color: #6b6b6b; font-family: monospace; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .od-invite-meta { font-size: 11px; color: #a3a3a3; white-space: nowrap; }
  .od-copy-btn { font-size: 11px; padding: 4px 10px; border: 1px solid #e5e2dd; border-radius: 6px; background: #fff; cursor: pointer; transition: background .15s; white-space: nowrap; }
  .od-copy-btn:hover { background: #f0ede8; }

  .od-error { font-size: 12px; color: #ef4444; margin-top: 6px; }
  .od-loading { text-align: center; padding: 80px; color: #6b6b6b; font-size: 14px; }
  .od-denied { text-align: center; padding: 80px 24px; }
  .od-denied h2 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
  .od-denied p { color: #6b6b6b; font-size: 14px; }
`;

export default function OrgDashboardPage() {
    const { slug } = useParams();
    const { isLoaded, isSignedIn, user } = useUser();
    const navigate = useNavigate();

    const [data, setData]         = useState(null);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');

    // Invite form
    const [invEmail, setInvEmail] = useState('');
    const [invTier, setInvTier]   = useState('student');
    const [invSending, setInvSending] = useState(false);
    const [invError, setInvError] = useState('');
    const [invites, setInvites]   = useState([]);
    const [copied, setCopied]     = useState('');

    const load = useCallback(() => {
        setLoading(true);
        getDashboard(slug)
            .then(r => { setData(r.data); setInvites(r.data.invites || []); })
            .catch(err => {
                if (err.response?.status === 403) setError('admin');
                else if (err.response?.status === 404) setError('notfound');
                else setError('fail');
            })
            .finally(() => setLoading(false));
    }, [slug]);

    useEffect(() => { if (isLoaded && isSignedIn) load(); }, [isLoaded, isSignedIn, load]);

    async function handleInvite(e) {
        e.preventDefault();
        setInvError('');
        setInvSending(true);
        try {
            const r = await createInvite(slug, { seat_tier: invTier, email: invEmail || undefined });
            setInvites(prev => [r.data, ...prev]);
            setInvEmail('');
        } catch (err) {
            setInvError(err.response?.data?.detail || 'Failed to create invite');
        } finally {
            setInvSending(false);
        }
    }

    async function handleGenerateLink() {
        setInvError('');
        setInvSending(true);
        try {
            const r = await createInvite(slug, { seat_tier: invTier });
            setInvites(prev => [r.data, ...prev]);
        } catch (err) {
            setInvError(err.response?.data?.detail || 'Failed to create invite link');
        } finally {
            setInvSending(false);
        }
    }

    async function handleRevoke(inviteId) {
        await revokeInvite(slug, inviteId).catch(() => {});
        setInvites(prev => prev.filter(i => i.id !== inviteId));
    }

    async function handleTierChange(memberId, tier) {
        await updateMember(slug, memberId, { seat_tier: tier }).catch(() => {});
        setData(prev => ({
            ...prev,
            members: prev.members.map(m => m.id === memberId ? { ...m, seat_tier: tier } : m),
        }));
    }

    async function handleRemove(memberId) {
        if (!confirm('Remove this member? Their plan will revert to free.')) return;
        await updateMember(slug, memberId, { status: 'removed' }).catch(() => {});
        setData(prev => ({
            ...prev,
            members: prev.members.filter(m => m.id !== memberId),
        }));
        load(); // refresh seat counts
    }

    function copyLink(url, id) {
        navigator.clipboard.writeText(url).then(() => {
            setCopied(id);
            setTimeout(() => setCopied(''), 2000);
        });
    }

    if (!isLoaded || !isSignedIn) return null;
    if (loading) return <div className="od"><style>{CSS}</style><div className="od-loading">Loading…</div></div>;
    if (error === 'admin') return (
        <div className="od"><style>{CSS}</style>
        <div className="od-denied"><h2>Access denied</h2><p>You must be an org admin to view this dashboard.</p></div></div>
    );
    if (error) return (
        <div className="od"><style>{CSS}</style>
        <div className="od-denied"><h2>Organization not found</h2><p>Check the URL and try again.</p></div></div>
    );

    const { org, members, seat_counts } = data;
    const activeMembers = members.filter(m => m.status === 'active');
    const pendingMembers = members.filter(m => m.status === 'pending');

    return (
        <div className="od">
            <style>{CSS}</style>
            <nav className="od-nav">
                <a href="/" className="od-logo">
                    <div className="od-logo-icon"><svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
                    Neurativo <span className="od-logo-badge">Teams</span>
                </a>
                <span className="od-nav-org">/ {org.name}</span>
                <div className="od-nav-right">
                    <Link to={`/${slug}/settings`} className="od-btn-sm">Settings</Link>
                    <a href="https://neurativo.com/app" className="od-btn-dark-sm">Open app</a>
                </div>
            </nav>

            <div className="od-body">
                {/* Seat stats */}
                <div className="od-stats">
                    <div className="od-stat">
                        <div className="od-stat-val">{seat_counts.total}</div>
                        <div className="od-stat-lbl">Active seats</div>
                    </div>
                    <div className="od-stat">
                        <div className="od-stat-val">{org.seat_limit}</div>
                        <div className="od-stat-lbl">Seat limit</div>
                    </div>
                    <div className="od-stat">
                        <div className="od-stat-val">{seat_counts.pro}</div>
                        <div className="od-stat-lbl">Pro seats</div>
                    </div>
                    <div className="od-stat">
                        <div className="od-stat-val">{seat_counts.student}</div>
                        <div className="od-stat-lbl">Student seats</div>
                    </div>
                    <div className="od-stat">
                        <div className="od-stat-val">{Math.max(0, org.seat_limit - seat_counts.total)}</div>
                        <div className="od-stat-lbl">Available seats</div>
                    </div>
                </div>

                {/* Active members */}
                <div className="od-section">
                    <div className="od-section-header">
                        <div className="od-section-title">Members ({activeMembers.length})</div>
                    </div>
                    <div className="od-table-wrap">
                        {activeMembers.length === 0 ? (
                            <div className="od-empty">No active members yet. Send invites below.</div>
                        ) : (
                            <table className="od-table">
                                <thead>
                                    <tr>
                                        <th>Email</th>
                                        <th>Role</th>
                                        <th>Seat tier</th>
                                        <th>Joined</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeMembers.map(m => (
                                        <tr key={m.id}>
                                            <td>{m.email}</td>
                                            <td>
                                                <span className={`od-badge ${m.role === 'admin' ? 'od-badge-admin' : ''}`}>
                                                    {m.role}
                                                </span>
                                            </td>
                                            <td>
                                                {m.role === 'admin' && m.user_id === org.owner_id ? (
                                                    <span className="od-badge od-badge-pro">pro</span>
                                                ) : (
                                                    <select
                                                        className="od-tier-select"
                                                        value={m.seat_tier}
                                                        onChange={e => handleTierChange(m.id, e.target.value)}
                                                    >
                                                        <option value="student">student</option>
                                                        <option value="pro">pro</option>
                                                    </select>
                                                )}
                                            </td>
                                            <td style={{ color: '#a3a3a3', fontSize: 12 }}>
                                                {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}
                                            </td>
                                            <td>
                                                {m.user_id !== org.owner_id && (
                                                    <button className="od-remove-btn" onClick={() => handleRemove(m.id)}>
                                                        Remove
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Pending */}
                {pendingMembers.length > 0 && (
                    <div className="od-section">
                        <div className="od-section-header">
                            <div className="od-section-title">Pending invites</div>
                        </div>
                        <div className="od-table-wrap">
                            <table className="od-table">
                                <thead>
                                    <tr><th>Email</th><th>Tier</th><th>Invited</th></tr>
                                </thead>
                                <tbody>
                                    {pendingMembers.map(m => (
                                        <tr key={m.id}>
                                            <td>{m.email}</td>
                                            <td><span className={`od-badge ${m.seat_tier === 'pro' ? 'od-badge-pro' : 'od-badge-student'}`}>{m.seat_tier}</span></td>
                                            <td style={{ color: '#a3a3a3', fontSize: 12 }}>{new Date(m.invited_at).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Invite section */}
                <div className="od-section">
                    <div className="od-section-header">
                        <div className="od-section-title">Invite members</div>
                    </div>
                    <div style={{ background: '#fff', border: '1.5px solid #f0ede8', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                        <div style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 14 }}>
                            Send an invite email, or generate a shareable link below.
                        </div>
                        <form onSubmit={handleInvite}>
                            <div className="od-invite-row" style={{ marginBottom: 10 }}>
                                <input
                                    className="od-invite-input"
                                    placeholder="colleague@company.com (optional)"
                                    value={invEmail}
                                    onChange={e => setInvEmail(e.target.value)}
                                    type="email"
                                />
                                <div className="od-tier-btn-row">
                                    <button type="button" className={`od-tier-btn ${invTier === 'student' ? 'selected' : ''}`} onClick={() => setInvTier('student')}>Student</button>
                                    <button type="button" className={`od-tier-btn ${invTier === 'pro' ? 'selected' : ''}`} onClick={() => setInvTier('pro')}>Pro</button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button type="submit" className="od-btn-dark-sm" disabled={invSending}>
                                    {invSending ? 'Sending…' : invEmail ? 'Send invite email' : 'Generate link'}
                                </button>
                                {invEmail && (
                                    <button type="button" className="od-btn-sm" onClick={handleGenerateLink} disabled={invSending}>
                                        Generate link (no email)
                                    </button>
                                )}
                            </div>
                        </form>
                        {invError && <div className="od-error">{invError}</div>}
                    </div>

                    {/* Active invite links */}
                    {invites.length > 0 && (
                        <div className="od-invite-list">
                            {invites.map(inv => (
                                <div key={inv.id} className="od-invite-item">
                                    <span className={`od-badge ${inv.seat_tier === 'pro' ? 'od-badge-pro' : 'od-badge-student'}`}>{inv.seat_tier}</span>
                                    <span className="od-invite-url">{inv.join_url}</span>
                                    <span className="od-invite-meta">
                                        {inv.uses}/{inv.max_uses ?? '∞'} uses
                                        {inv.expires_at ? ` · expires ${new Date(inv.expires_at).toLocaleDateString()}` : ''}
                                    </span>
                                    <button className="od-copy-btn" onClick={() => copyLink(inv.join_url, inv.id)}>
                                        {copied === inv.id ? 'Copied!' : 'Copy'}
                                    </button>
                                    <button className="od-remove-btn" onClick={() => handleRevoke(inv.id)}>Revoke</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
