import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../lib/adminApi.js';

const CSS = `
.adm-page-title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 24px; }
.adm-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 18px; flex-wrap: wrap; }
.adm-input {
    padding: 8px 12px; background: #141414; border: 1px solid #2a2a2a;
    border-radius: 7px; color: #e8e8e8; font-size: 13px; outline: none;
    transition: border-color 0.15s;
}
.adm-input:focus { border-color: #7c3aed; }
.adm-input-search { width: 220px; }
.adm-select {
    padding: 8px 12px; background: #141414; border: 1px solid #2a2a2a;
    border-radius: 7px; color: #e8e8e8; font-size: 13px; outline: none; cursor: pointer;
}
.adm-btn {
    padding: 8px 16px; border-radius: 7px; font-size: 13px; font-weight: 500;
    cursor: pointer; transition: background 0.15s, color 0.15s;
    border: none;
}
.adm-btn-primary { background: #7c3aed; color: #fff; }
.adm-btn-primary:hover { background: #6d28d9; }
.adm-btn-ghost { background: transparent; border: 1px solid #2a2a2a; color: #888; }
.adm-btn-ghost:hover { border-color: #555; color: #e8e8e8; }
.adm-btn-danger { background: #7f1d1d22; border: 1px solid #7f1d1d55; color: #f87171; }
.adm-btn-danger:hover { background: #7f1d1d44; }
.adm-table-wrap { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.adm-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #555; border-bottom: 1px solid #1e1e1e; background: #0f0f0f; text-transform: uppercase; letter-spacing: 0.06em; }
.adm-table td { padding: 12px 16px; border-bottom: 1px solid #111; color: #c8c8c8; vertical-align: middle; }
.adm-table tr:last-child td { border-bottom: none; }
.adm-table tr:hover td { background: #ffffff04; }
.adm-plan-pill { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; }
.adm-plan-free { background: #ffffff0f; color: #888; }
.adm-plan-student { background: #7c3aed22; color: #a78bfa; border: 1px solid #7c3aed44; }
.adm-plan-pro { background: #0369a122; color: #38bdf8; border: 1px solid #0369a144; }
.adm-plan-select { padding: 4px 8px; background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 5px; color: #e8e8e8; font-size: 12px; cursor: pointer; }
.adm-pagination { display: flex; align-items: center; gap: 10px; margin-top: 16px; font-size: 13px; color: #555; }
.adm-pag-btn { padding: 6px 12px; background: #141414; border: 1px solid #2a2a2a; border-radius: 6px; color: #888; cursor: pointer; font-size: 12px; }
.adm-pag-btn:hover:not(:disabled) { border-color: #555; color: #e8e8e8; }
.adm-pag-btn:disabled { opacity: 0.3; cursor: default; }
.adm-total { color: #888; font-size: 12px; }
.adm-row-link { cursor: pointer; }
.adm-empty { text-align: center; padding: 32px; color: #444; }
.adm-suspended-badge { display: inline-block; padding: 1px 7px; border-radius: 99px; font-size: 10px; font-weight: 600; background: #78350f22; color: #fbbf24; border: 1px solid #78350f55; margin-left: 6px; }
`;

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
            <style>{CSS}</style>
            <div className="adm-page-title">Users</div>

            {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, padding: '10px 14px', background: '#7f1d1d22', borderRadius: 7, border: '1px solid #7f1d1d44' }}>Error: {error}</div>}
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
                                            : <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#555', flexShrink: 0 }}>
                                                {(u.display_name || u.email || '?')[0].toUpperCase()}
                                              </div>
                                        }
                                        <div>
                                            <div style={{ fontSize: 13, color: '#c8c8c8' }}>
                                                {u.display_name || <span style={{ color: '#444' }}>No name</span>}
                                                {u.is_suspended && <span className="adm-suspended-badge">SUSPENDED</span>}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#555' }}>{u.email || u.id.slice(0, 18) + '…'}</div>
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
                                    {saving[u.id] && <span style={{ marginLeft: 6, fontSize: 11, color: '#555' }}>saving…</span>}
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

            {toast && (
                <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: 8, padding: '12px 18px', fontSize: 13, color: '#e8e8e8', zIndex: 9999, boxShadow: '0 4px 20px #00000088' }}>
                    {toast}
                </div>
            )}
        </div>
    );
}
