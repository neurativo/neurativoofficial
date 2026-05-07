import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi } from '../../lib/adminApi.js';

function PlanPill({ tier }) {
    return <span className={`adm-plan-pill adm-plan-${tier || 'free'}`}>{tier || 'free'}</span>;
}

function fmtDuration(secs) {
    if (!secs) return '—';
    const m = Math.floor(secs / 60);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtDate(val) {
    if (!val) return '—';
    return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(val) {
    if (!val) return '—';
    return new Date(val).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function tileStyle(bg, color) {
    return {
        background: bg,
        color: color,
        borderRadius: 10,
        padding: '14px 18px',
        flex: 1,
        minWidth: 0,
    };
}

const REASONS = [
    { value: 'admin_grant', label: 'Admin Grant' },
    { value: 'admin_deduct', label: 'Admin Deduct' },
    { value: 'starter_grant', label: 'Starter Grant' },
    { value: 'plan_grant', label: 'Plan Grant' },
    { value: 'monthly_refresh', label: 'Monthly Refresh' },
    { value: 'refund', label: 'Refund' },
    { value: 'manual', label: 'Manual Adjustment' },
];

function CreditsPanel({ userId, showToast }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const [adjAmount, setAdjAmount] = useState('');
    const [adjReason, setAdjReason] = useState('admin_grant');
    const [adjSaving, setAdjSaving] = useState(false);

    const [setAmount, setSetAmount] = useState('');
    const [setSaving, setSetSaving] = useState(false);

    const [subStatus, setSubStatus] = useState('none');
    const [subExpiry, setSubExpiry] = useState('');
    const [subSaving, setSubSaving] = useState(false);

    async function reload() {
        setLoading(true);
        try {
            const d = await adminApi.getUserCredits(userId);
            setData(d);
            setSubStatus(d.credits_sub_status || 'none');
            if (d.credits_sub_expires) {
                const dt = new Date(d.credits_sub_expires);
                setSubExpiry(dt.toISOString().slice(0, 10));
            }
        } catch {
            showToast('Failed to load credits');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { reload(); }, [userId]);

    async function applyAdjust() {
        const amt = parseInt(adjAmount, 10);
        if (isNaN(amt) || amt === 0) return showToast('Enter a non-zero amount (negative to deduct)');
        setAdjSaving(true);
        try {
            const res = await adminApi.adjustCredits(userId, { amount: amt, reason: adjReason });
            showToast(`Credits adjusted by ${amt > 0 ? '+' : ''}${amt}. New balance: ${res.credits}`);
            setAdjAmount('');
            await reload();
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Adjust failed');
        } finally {
            setAdjSaving(false);
        }
    }

    async function applySet() {
        const amt = parseInt(setAmount, 10);
        if (isNaN(amt) || amt < 0) return showToast('Enter a valid non-negative amount');
        setSetSaving(true);
        try {
            const res = await adminApi.setCredits(userId, { amount: amt, reason: adjReason });
            showToast(`Credits set to ${res.credits}`);
            setSetAmount('');
            await reload();
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Set failed');
        } finally {
            setSetSaving(false);
        }
    }

    async function saveSubscription() {
        setSubSaving(true);
        try {
            const body = {
                status: subStatus,
                expires_at: subStatus === 'monthly' && subExpiry ? new Date(subExpiry).toISOString() : null,
            };
            await adminApi.setCreditsSubscription(userId, body);
            showToast(`Subscription set to ${subStatus}`);
            await reload();
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Subscription update failed');
        } finally {
            setSubSaving(false);
        }
    }

    if (loading) return <div style={{ color: '#888', fontSize: 13, padding: 20 }}>Loading credits…</div>;
    if (!data) return null;

    const balance = data.credits ?? 0;
    const subLabel = data.credits_sub_status === 'monthly' ? 'Monthly' : 'None';
    const transactions = data.transactions || [];

    return (
        <div>
            {/* Balance Strip */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <div style={tileStyle('#1a1f2e', '#c9d1e9')}>
                    <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Balance</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#7c9ef5' }}>{balance.toLocaleString()}</div>
                    <div style={{ fontSize: 11, opacity: 0.5 }}>credits</div>
                </div>
                <div style={tileStyle('#1a2a1a', '#b5d4b5')}>
                    <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Subscription</div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: data.credits_sub_status === 'monthly' ? '#5ec45e' : '#888' }}>{subLabel}</div>
                    {data.credits_sub_expires && <div style={{ fontSize: 11, opacity: 0.6 }}>Expires {fmtDate(data.credits_sub_expires)}</div>}
                </div>
                {data.credits_sub_started && (
                    <div style={tileStyle('#1a1a2a', '#bbb5d4')}>
                        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Sub Started</div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{fmtDate(data.credits_sub_started)}</div>
                    </div>
                )}
            </div>

            {/* Actions Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>

                {/* Adjust Credits */}
                <div className="adm-card" style={{ margin: 0 }}>
                    <div className="adm-card-title" style={{ marginBottom: 10 }}>Grant / Deduct Credits</div>
                    <div style={{ marginBottom: 8 }}>
                        <input
                            className="adm-input"
                            type="number"
                            placeholder="Amount (negative = deduct)"
                            value={adjAmount}
                            onChange={e => setAdjAmount(e.target.value)}
                            style={{ width: '100%', marginBottom: 8 }}
                        />
                        <select className="adm-select" value={adjReason} onChange={e => setAdjReason(e.target.value)} style={{ width: '100%', marginBottom: 8 }}>
                            {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        <button
                            className="adm-btn adm-btn-primary"
                            onClick={applyAdjust}
                            disabled={adjSaving || !adjAmount}
                            style={{ width: '100%' }}
                        >
                            {adjSaving ? 'Applying…' : 'Apply Adjustment'}
                        </button>
                    </div>
                </div>

                {/* Set Exact Balance */}
                <div className="adm-card" style={{ margin: 0 }}>
                    <div className="adm-card-title" style={{ marginBottom: 10 }}>Set Exact Balance</div>
                    <input
                        className="adm-input"
                        type="number"
                        placeholder="New balance"
                        value={setAmount}
                        onChange={e => setSetAmount(e.target.value)}
                        style={{ width: '100%', marginBottom: 8 }}
                    />
                    <select className="adm-select" value={adjReason} onChange={e => setAdjReason(e.target.value)} style={{ width: '100%', marginBottom: 8 }}>
                        {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <button
                        className="adm-btn adm-btn-primary"
                        onClick={applySet}
                        disabled={setSaving || setAmount === ''}
                        style={{ width: '100%' }}
                    >
                        {setSaving ? 'Setting…' : 'Set Balance'}
                    </button>
                </div>

                {/* Subscription */}
                <div className="adm-card" style={{ margin: 0 }}>
                    <div className="adm-card-title" style={{ marginBottom: 10 }}>Credits Subscription</div>
                    <select className="adm-select" value={subStatus} onChange={e => setSubStatus(e.target.value)} style={{ width: '100%', marginBottom: 8 }}>
                        <option value="none">None</option>
                        <option value="monthly">Monthly</option>
                    </select>
                    {subStatus === 'monthly' && (
                        <input
                            className="adm-input"
                            type="date"
                            value={subExpiry}
                            onChange={e => setSubExpiry(e.target.value)}
                            style={{ width: '100%', marginBottom: 8 }}
                        />
                    )}
                    <button
                        className="adm-btn adm-btn-primary"
                        onClick={saveSubscription}
                        disabled={subSaving}
                        style={{ width: '100%' }}
                    >
                        {subSaving ? 'Saving…' : 'Save Subscription'}
                    </button>
                </div>
            </div>

            {/* Transaction History */}
            <div className="adm-card-title" style={{ marginBottom: 10 }}>Transaction History</div>
            <div className="adm-table-wrap">
                <table className="adm-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Balance After</th>
                            <th>Reason</th>
                            <th>Product</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!transactions.length && (
                            <tr><td colSpan={5} className="adm-empty">No transactions yet.</td></tr>
                        )}
                        {transactions.map(tx => (
                            <tr key={tx.id}>
                                <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(tx.created_at)}</td>
                                <td style={{ color: tx.amount >= 0 ? '#5ec45e' : '#e05555', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {tx.amount >= 0 ? '+' : ''}{tx.amount}
                                </td>
                                <td>{tx.balance_after ?? '—'}</td>
                                <td>{tx.reason || '—'}</td>
                                <td>{tx.product || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function AdminUserDetail() {
    const { userId } = useParams();
    const navigate = useNavigate();
    const [detail, setDetail] = useState(null);
    const [planValue, setPlanValue] = useState('free');
    const [savingPlan, setSavingPlan] = useState(false);
    const [toast, setToast] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletingUser, setDeletingUser] = useState(false);
    const [suspending, setSuspending] = useState(false);
    const [activeTab, setActiveTab] = useState('profile');

    useEffect(() => {
        adminApi.getUser(userId)
            .then(d => { setDetail(d); setPlanValue(d.profile?.plan_tier || 'free'); })
            .catch(() => showToast('Failed to load user'));
    }, [userId]);

    function showToast(msg) {
        setToast(msg);
        setTimeout(() => setToast(''), 3500);
    }

    async function savePlan() {
        setSavingPlan(true);
        try {
            await adminApi.updateUserPlan(userId, planValue);
            setDetail(d => ({ ...d, profile: { ...d.profile, plan_tier: planValue } }));
            showToast(`Plan updated to ${planValue}`);
        } catch (e) {
            showToast(`Plan error: ${e?.response?.data?.detail || e?.message || 'Unknown error'}`);
        } finally {
            setSavingPlan(false);
        }
    }

    async function deleteUser() {
        setDeletingUser(true);
        try {
            await adminApi.deleteUser(userId);
            navigate('/admin/users');
        } catch {
            showToast('Failed to delete user');
            setDeletingUser(false);
        }
    }

    async function handleSuspend() {
        if (!detail) return;
        const isSuspended = detail.profile?.is_suspended;
        setSuspending(true);
        try {
            if (isSuspended) await adminApi.unsuspendUser(userId);
            else await adminApi.suspendUser(userId);
            const fresh = await adminApi.getUser(userId);
            setDetail(fresh);
        } catch {
            showToast('Suspension action failed');
        } finally {
            setSuspending(false);
        }
    }

    async function deleteLecture(lectureId) {
        try {
            await adminApi.deleteLecture(lectureId);
            setDetail(d => ({ ...d, lectures: d.lectures.filter(l => l.id !== lectureId) }));
            showToast('Lecture deleted');
        } catch {
            showToast('Failed to delete lecture');
        }
    }

    const profile = detail?.profile || {};
    const lectures = detail?.lectures || [];

    const TABS = [
        { key: 'profile', label: 'Profile & Plan' },
        { key: 'credits', label: 'Credits' },
        { key: 'lectures', label: `Lectures (${lectures.length})` },
    ];

    return (
        <div>
            <div className="adm-back" onClick={() => navigate('/admin/users')}>
                ← Back to Users
            </div>
            <div className="adm-page-title">User Detail</div>
            <div className="adm-subtitle">{userId}</div>

            {!detail && <div style={{ color: '#555', fontSize: 13 }}>Loading…</div>}

            {detail && (
                <>
                    {/* Tab Bar */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #2a2a3a', paddingBottom: 0 }}>
                        {TABS.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    borderBottom: activeTab === tab.key ? '2px solid #7c9ef5' : '2px solid transparent',
                                    color: activeTab === tab.key ? '#7c9ef5' : '#888',
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    fontWeight: activeTab === tab.key ? 600 : 400,
                                    padding: '8px 16px',
                                    marginBottom: -1,
                                    transition: 'color 0.15s',
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Profile & Plan Tab */}
                    {activeTab === 'profile' && (
                        <div className="adm-grid">
                            <div>
                                <div className="adm-card">
                                    <div className="adm-card-title">Profile</div>
                                    {profile.avatar_url && (
                                        <img
                                            src={profile.avatar_url}
                                            alt="avatar"
                                            style={{ width: 56, height: 56, borderRadius: '50%', marginBottom: 12, objectFit: 'cover' }}
                                        />
                                    )}
                                    <div className="adm-field">
                                        <div className="adm-field-label">Display Name</div>
                                        <div className="adm-field-value">{profile.display_name || profile.full_name || '—'}</div>
                                    </div>
                                    <div className="adm-field">
                                        <div className="adm-field-label">User ID</div>
                                        <div className="adm-field-mono">{profile.id}</div>
                                    </div>
                                    <div className="adm-field">
                                        <div className="adm-field-label">Current Plan</div>
                                        <div style={{ marginTop: 4 }}>
                                            <PlanPill tier={profile.plan_tier} />
                                            {profile.is_suspended && <span className="adm-suspended-badge">SUSPENDED</span>}
                                        </div>
                                    </div>
                                    {profile.email && (
                                        <div className="adm-field">
                                            <div className="adm-field-label">Email</div>
                                            <div className="adm-field-value">{profile.email}</div>
                                        </div>
                                    )}
                                    <div className="adm-field">
                                        <div className="adm-field-label">Joined</div>
                                        <div className="adm-field-value">{fmtDate(profile.created_at_ms || profile.created_at)}</div>
                                    </div>
                                    {profile.last_sign_in_ms && (
                                        <div className="adm-field">
                                            <div className="adm-field-label">Last Sign In</div>
                                            <div className="adm-field-value">{fmtDate(profile.last_sign_in_ms)}</div>
                                        </div>
                                    )}
                                    <div className="adm-field">
                                        <div className="adm-field-label">Uploads This Month</div>
                                        <div className="adm-field-value">{profile.uploads_this_month ?? 0}</div>
                                    </div>
                                    <div className="adm-field">
                                        <div className="adm-field-label">Preferred Language</div>
                                        <div className="adm-field-value">{profile.preferred_language || 'en'}</div>
                                    </div>

                                    <hr className="adm-divider" />

                                    <div className="adm-card-title">Allocate Plan</div>
                                    <div className="adm-plan-form">
                                        <select className="adm-select" value={planValue} onChange={e => setPlanValue(e.target.value)}>
                                            <option value="free">Free — $0</option>
                                            <option value="student">Student — $9.99/mo</option>
                                            <option value="pro">Pro — $19.99/mo</option>
                                        </select>
                                        <button className="adm-btn adm-btn-primary" onClick={savePlan} disabled={savingPlan}>
                                            {savingPlan ? 'Saving…' : 'Save Plan'}
                                        </button>
                                    </div>

                                    <hr className="adm-divider" />

                                    <div className="adm-danger-zone">
                                        <div className="adm-danger-title">Danger Zone</div>
                                        <button
                                            className="adm-btn-warn"
                                            onClick={handleSuspend}
                                            disabled={suspending}
                                            style={{ marginBottom: 10, display: 'block' }}
                                        >
                                            {suspending ? '…' : profile.is_suspended ? 'Unsuspend User' : 'Suspend User'}
                                        </button>
                                        <button className="adm-btn-danger" onClick={() => setShowDeleteModal(true)}>
                                            Delete User & All Data
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div />
                        </div>
                    )}

                    {/* Credits Tab */}
                    {activeTab === 'credits' && (
                        <CreditsPanel userId={userId} showToast={showToast} />
                    )}

                    {/* Lectures Tab */}
                    {activeTab === 'lectures' && (
                        <div>
                            <div className="adm-table-wrap">
                                <table className="adm-table">
                                    <thead>
                                        <tr><th>Title</th><th>Topic</th><th>Duration</th><th>Date</th><th></th></tr>
                                    </thead>
                                    <tbody>
                                        {!lectures.length && (
                                            <tr><td colSpan={5} className="adm-empty">No lectures.</td></tr>
                                        )}
                                        {lectures.map(l => (
                                            <tr key={l.id}>
                                                <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {l.title || 'Untitled'}
                                                </td>
                                                <td>{l.topic || '—'}</td>
                                                <td>{fmtDuration(l.total_duration_seconds)}</td>
                                                <td>{fmtDate(l.created_at)}</td>
                                                <td>
                                                    <button
                                                        className="adm-btn-danger"
                                                        style={{ padding: '4px 10px', fontSize: 11 }}
                                                        onClick={() => deleteLecture(l.id)}
                                                    >Delete</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {showDeleteModal && (
                <div className="adm-modal-overlay">
                    <div className="adm-modal">
                        <h3>Delete User?</h3>
                        <p>This will permanently delete the user and all their lectures, transcripts, and data. This cannot be undone.</p>
                        <div className="adm-modal-actions">
                            <button className="adm-btn-ghost" onClick={() => setShowDeleteModal(false)}>Cancel</button>
                            <button className="adm-btn-danger" onClick={deleteUser} disabled={deletingUser}>
                                {deletingUser ? 'Deleting…' : 'Delete User'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className="adm-toast">{toast}</div>}
        </div>
    );
}
