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
                        <div className="adm-card-title" style={{ marginBottom: 12 }}>
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
                            <button className="adm-btn-ghost" onClick={() => setShowDeleteModal(false)}>
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
