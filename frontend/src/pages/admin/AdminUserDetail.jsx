import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi } from '../../lib/adminApi.js';

const CSS = `
.adm-back { display: inline-flex; align-items: center; gap: 6px; color: #888; font-size: 13px; cursor: pointer; margin-bottom: 20px; text-decoration: none; }
.adm-back:hover { color: #e8e8e8; }
.adm-page-title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 6px; }
.adm-subtitle { font-size: 13px; color: #555; margin-bottom: 24px; font-family: monospace; }
.adm-grid { display: grid; grid-template-columns: 320px 1fr; gap: 24px; align-items: start; }
.adm-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 20px; }
.adm-card-title { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 14px; }
.adm-field { margin-bottom: 14px; }
.adm-field-label { font-size: 11px; color: #555; margin-bottom: 4px; }
.adm-field-value { font-size: 13px; color: #c8c8c8; }
.adm-field-mono { font-family: monospace; font-size: 11px; color: #888; word-break: break-all; }
.adm-plan-pill { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; }
.adm-plan-free { background: #ffffff0f; color: #888; }
.adm-plan-student { background: #7c3aed22; color: #a78bfa; border: 1px solid #7c3aed44; }
.adm-plan-pro { background: #0369a122; color: #38bdf8; border: 1px solid #0369a144; }
.adm-plan-form { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
.adm-select { padding: 8px 12px; background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 7px; color: #e8e8e8; font-size: 13px; cursor: pointer; }
.adm-btn { padding: 8px 16px; border-radius: 7px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; }
.adm-btn-primary { background: #7c3aed; color: #fff; }
.adm-btn-primary:hover { background: #6d28d9; }
.adm-btn-primary:disabled { opacity: 0.5; cursor: default; }
.adm-divider { border: none; border-top: 1px solid #1e1e1e; margin: 20px 0; }
.adm-danger-zone { margin-top: 6px; }
.adm-danger-title { font-size: 11px; font-weight: 600; color: #f87171; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
.adm-btn-danger { background: #7f1d1d22; border: 1px solid #7f1d1d55; color: #f87171; padding: 8px 16px; border-radius: 7px; font-size: 13px; cursor: pointer; }
.adm-btn-danger:hover { background: #7f1d1d44; }
.adm-suspended-badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; background: #78350f22; color: #fbbf24; border: 1px solid #78350f55; margin-left: 8px; }
.adm-btn-warn { background: #78350f22; border: 1px solid #78350f55; color: #fbbf24; padding: 8px 16px; border-radius: 7px; font-size: 13px; cursor: pointer; }
.adm-btn-warn:hover { background: #78350f44; }
.adm-table-wrap { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.adm-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #555; border-bottom: 1px solid #1e1e1e; background: #0f0f0f; text-transform: uppercase; letter-spacing: 0.06em; }
.adm-table td { padding: 11px 16px; border-bottom: 1px solid #111; color: #c8c8c8; vertical-align: middle; }
.adm-table tr:last-child td { border-bottom: none; }
.adm-table tr:hover td { background: #ffffff04; }
.adm-empty { text-align: center; padding: 32px; color: #444; }
.adm-toast { position: fixed; bottom: 24px; right: 24px; background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 8px; padding: 12px 18px; font-size: 13px; color: #e8e8e8; z-index: 9999; }
.adm-modal-overlay { position: fixed; inset: 0; background: #00000088; z-index: 200; display: flex; align-items: center; justify-content: center; }
.adm-modal { background: #141414; border: 1px solid #2a2a2a; border-radius: 12px; padding: 28px; max-width: 400px; width: 90%; }
.adm-modal h3 { font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 10px; }
.adm-modal p { font-size: 13px; color: #888; margin-bottom: 20px; }
.adm-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
@media (max-width: 800px) { .adm-grid { grid-template-columns: 1fr; } }
`;

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
    const d = typeof val === 'number' ? new Date(val) : new Date(val);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

    useEffect(() => {
        adminApi.getUser(userId)
            .then(d => { setDetail(d); setPlanValue(d.profile?.plan_tier || 'free'); })
            .catch(() => setToast('Failed to load user'));
    }, [userId]);

    function showToast(msg) {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    }

    async function savePlan() {
        setSavingPlan(true);
        try {
            await adminApi.updateUserPlan(userId, planValue);
            setDetail(d => ({ ...d, profile: { ...d.profile, plan_tier: planValue } }));
            showToast(`Plan updated to ${planValue}`);
        } catch (e) {
            const detail = e?.response?.data?.detail || e?.message || 'Unknown error';
            showToast(`Plan error: ${detail}`);
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
            if (isSuspended) {
                await adminApi.unsuspendUser(userId);
            } else {
                await adminApi.suspendUser(userId);
            }
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

    return (
        <div>
            <style>{CSS}</style>
            <div className="adm-back" onClick={() => navigate('/admin/users')}>
                ← Back to Users
            </div>
            <div className="adm-page-title">User Detail</div>
            <div className="adm-subtitle">{userId}</div>

            {!detail && <div style={{ color: '#555', fontSize: 13 }}>Loading…</div>}

            {detail && (
                <div className="adm-grid">
                    <div>
                        <div className="adm-card">
                            <div className="adm-card-title">Profile</div>
                            <div className="adm-field">
                                <div className="adm-field-label">Display Name</div>
                                <div className="adm-field-value">{profile.display_name || '—'}</div>
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

                            <hr className="adm-divider" />

                            <div className="adm-card-title">Allocate Plan</div>
                            <div className="adm-plan-form">
                                <select className="adm-select" value={planValue} onChange={e => setPlanValue(e.target.value)}>
                                    <option value="free">Free</option>
                                    <option value="student">Student</option>
                                    <option value="pro">Pro</option>
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
                                    {suspending
                                        ? '…'
                                        : profile.is_suspended
                                            ? 'Unsuspend User'
                                            : 'Suspend User'}
                                </button>
                                <button className="adm-btn-danger" onClick={() => setShowDeleteModal(true)}>
                                    Delete User & All Data
                                </button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="adm-card-title" style={{ color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                            Lectures ({lectures.length})
                        </div>
                        <div className="adm-table-wrap">
                            <table className="adm-table">
                                <thead>
                                    <tr><th>Title</th><th>Duration</th><th>Date</th><th></th></tr>
                                </thead>
                                <tbody>
                                    {!lectures.length && (
                                        <tr><td colSpan={4} className="adm-empty">No lectures.</td></tr>
                                    )}
                                    {lectures.map(l => (
                                        <tr key={l.id}>
                                            <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {l.title || 'Untitled'}
                                            </td>
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
                </div>
            )}

            {showDeleteModal && (
                <div className="adm-modal-overlay">
                    <div className="adm-modal">
                        <h3>Delete User?</h3>
                        <p>This will permanently delete the user and all their lectures, transcripts, and data. This cannot be undone.</p>
                        <div className="adm-modal-actions">
                            <button className="adm-btn adm-btn-ghost" style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#888', padding: '8px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}
                                onClick={() => setShowDeleteModal(false)}>
                                Cancel
                            </button>
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
