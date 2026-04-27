import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../lib/adminApi.js';


function PlanPill({ tier }) {
    return <span className={`adm-plan-pill adm-plan-${tier || 'free'}`}>{tier || 'free'}</span>;
}

function fmtDate(val) {
    if (!val) return '—';
    // Clerk returns milliseconds epoch
    const d = typeof val === 'number' ? new Date(val) : new Date(val);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminUsers() {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [planFilter, setPlanFilter] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState({});
    const [toast, setToast] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        adminApi.listUsers({ search, plan: planFilter, page, page_size: 20 })
            .then(d => { setData(d); if (d.error) setError(d.error); })
            .catch(e => setError(e?.response?.data?.detail || e.message || 'Failed to load users'))
            .finally(() => setLoading(false));
    }, [search, planFilter, page]);

    useEffect(() => { load(); }, [load]);

    function showToast(msg) {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    }

    async function changePlan(userId, plan_tier, userName) {
        setSaving(s => ({ ...s, [userId]: true }));
        try {
            await adminApi.updateUserPlan(userId, plan_tier);
            setData(d => ({
                ...d,
                users: d.users.map(u => u.id === userId ? { ...u, plan_tier } : u)
            }));
            showToast(`${userName || userId.slice(0, 12)} → ${plan_tier}`);
        } catch (e) {
            const detail = e?.response?.data?.detail || e?.message || 'Unknown error';
            showToast(`Plan error: ${detail}`);
        } finally {
            setSaving(s => ({ ...s, [userId]: false }));
        }
    }

    const users = data?.users || [];
    const total = data?.total || 0;
    const totalPages = Math.ceil(total / 20) || 1;

    return (
        <div>
            <div className="adm-page-title">Users</div>

            {error && <div className="adm-error">Error: {error}</div>}
            <div className="adm-toolbar">
                <input
                    className="adm-input adm-input-search"
                    placeholder="Search by ID or name…"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                />
                <select className="adm-select" value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(1); }}>
                    <option value="">All Plans</option>
                    <option value="free">Free</option>
                    <option value="student">Student</option>
                    <option value="pro">Pro</option>
                </select>
                <span className="adm-total">{total.toLocaleString()} users</span>
            </div>

            <div className="adm-table-wrap">
                <table className="adm-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Plan</th>
                            <th>Lectures</th>
                            <th>Joined</th>
                            <th>Last Sign In</th>
                            <th>Change Plan</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && !users.length && (
                            <tr><td colSpan={6} className="adm-empty">Loading…</td></tr>
                        )}
                        {!loading && !users.length && (
                            <tr><td colSpan={6} className="adm-empty">No users found.</td></tr>
                        )}
                        {users.map(u => (
                            <tr key={u.id} className="adm-row-link">
                                <td onClick={() => navigate(`/admin/users/${u.id}`)}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {u.image_url
                                            ? <img src={u.image_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
                                            : <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
                                                {(u.display_name || u.email || '?')[0].toUpperCase()}
                                              </div>
                                        }
                                        <div>
                                            <div style={{ fontSize: 13, color: '#374151' }}>
                                                {u.display_name || <span style={{ color: '#d1d5db' }}>No name</span>}
                                                {u.is_suspended && <span className="adm-suspended-badge">SUSPENDED</span>}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#a3a3a3' }}>{u.email || u.id.slice(0, 18) + '…'}</div>
                                        </div>
                                    </div>
                                </td>
                                <td onClick={() => navigate(`/admin/users/${u.id}`)}>
                                    <PlanPill tier={u.plan_tier} />
                                </td>
                                <td onClick={() => navigate(`/admin/users/${u.id}`)}>
                                    {u.lecture_count ?? 0}
                                </td>
                                <td onClick={() => navigate(`/admin/users/${u.id}`)}>
                                    {fmtDate(u.created_at_ms)}
                                </td>
                                <td onClick={() => navigate(`/admin/users/${u.id}`)}>
                                    {fmtDate(u.last_sign_in_ms)}
                                </td>
                                <td>
                                    <select
                                        className="adm-plan-select"
                                        value={u.plan_tier || 'free'}
                                        disabled={saving[u.id]}
                                        onChange={e => changePlan(u.id, e.target.value, u.display_name || u.email)}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <option value="free">Free</option>
                                        <option value="student">Student</option>
                                        <option value="pro">Pro</option>
                                    </select>
                                    {saving[u.id] && <span style={{ marginLeft: 6, fontSize: 11, color: '#a3a3a3' }}>saving…</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="adm-pagination">
                <button className="adm-pag-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                <span>Page {page} of {totalPages}</span>
                <button className="adm-pag-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>

            {toast && <div className="adm-toast">{toast}</div>}
        </div>
    );
}
