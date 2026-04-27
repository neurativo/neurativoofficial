import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../lib/adminApi.js';

function PlanPill({ tier }) {
    const cls = `adm-plan-pill adm-plan-${tier || 'free'}`;
    return <span className={cls}>{tier || 'free'}</span>;
}

function fmtDuration(secs) {
    if (!secs) return '—';
    const m = Math.floor(secs / 60);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminDashboard() {
    const [stats, setStats] = useState(null);
    const [recentUsers, setRecentUsers] = useState([]);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        adminApi.getStats()
            .then(setStats)
            .catch(e => setError(e?.response?.data?.detail || e.message || 'Failed to load stats'));
        adminApi.listUsers({ page: 1, page_size: 8 })
            .then(d => setRecentUsers(d.users || []))
            .catch(() => {});
    }, []);

    const planDist = stats?.plan_distribution || { free: 0, student: 0, pro: 0 };
    const totalUsers = stats?.total_users || 0;
    const maxPlan = Math.max(...Object.values(planDist), 1);

    const planColors = { free: '#9ca3af', student: '#6366f1', pro: '#2563eb' };

    return (
        <div>
            <div className="adm-page-title">Dashboard</div>

            {error && <div className="adm-error">Error: {error}</div>}

            <div className="adm-cards">
                <div className="adm-card">
                    <div className="adm-card-label">Total Users</div>
                    <div className="adm-card-value">{stats ? totalUsers.toLocaleString() : '—'}</div>
                    <div className="adm-card-sub">all time</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Total Lectures</div>
                    <div className="adm-card-value">{stats ? (stats.total_lectures || 0).toLocaleString() : '—'}</div>
                    <div className="adm-card-sub">all time</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Live Sessions</div>
                    <div className="adm-card-value">{stats ? (stats.active_sessions || 0) : '—'}</div>
                    <div className="adm-card-sub">currently active</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Paid Users</div>
                    <div className="adm-card-value">{stats ? ((planDist.student || 0) + (planDist.pro || 0)) : '—'}</div>
                    <div className="adm-card-sub">student + pro</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Hours Recorded</div>
                    <div className="adm-card-value">{stats ? (stats.total_hours_recorded || 0).toLocaleString() : '—'}</div>
                    <div className="adm-card-sub">across all users</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Shared Lectures</div>
                    <div className="adm-card-value">{stats ? (stats.shared_lectures || 0) : '—'}</div>
                    <div className="adm-card-sub">{stats ? (stats.total_share_views || 0) : '—'} views</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Questions Detected</div>
                    <div className="adm-card-value">{stats ? (stats.total_questions_detected || 0) : '—'}</div>
                    <div className="adm-card-sub">by CIF system</div>
                </div>
            </div>

            <div className="adm-two-col">
                <div>
                    <div className="adm-section-title">Plan Distribution</div>
                    <div className="adm-plan-bars">
                        {Object.entries(planDist).map(([plan, count]) => (
                            <div className="adm-plan-bar-row" key={plan}>
                                <div className="adm-plan-bar-label">{plan}</div>
                                <div className="adm-plan-bar-track">
                                    <div className="adm-plan-bar-fill"
                                        style={{ width: `${(count / maxPlan) * 100}%`, background: planColors[plan] || '#444' }} />
                                </div>
                                <div className="adm-plan-bar-count">{count}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div />
            </div>

            <div className="adm-two-col" style={{ marginTop: 28 }}>
                <div>
                    <div className="adm-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Recent Users</span>
                        <span style={{ fontSize: 11, color: '#a3a3a3', cursor: 'pointer', textTransform: 'none', fontWeight: 400 }} onClick={() => navigate('/admin/users')}>View all →</span>
                    </div>
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>User</th><th>Plan</th><th>Lectures</th></tr></thead>
                            <tbody>
                                {recentUsers.map(u => (
                                    <tr key={u.id} className="adm-link-row" onClick={() => navigate(`/admin/users/${u.id}`)}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                {u.image_url
                                                    ? <img src={u.image_url} alt="" style={{ width: 22, height: 22, borderRadius: '50%' }} />
                                                    : <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#9ca3af' }}>
                                                        {(u.display_name || u.email || '?')[0].toUpperCase()}
                                                      </div>
                                                }
                                                <div>
                                                    <div style={{ fontSize: 12, color: '#c8c8c8' }}>{u.display_name || <span style={{ color: '#444' }}>No name</span>}</div>
                                                    <div style={{ fontSize: 10, color: '#555' }}>{u.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td><PlanPill tier={u.plan_tier} /></td>
                                        <td style={{ color: '#9ca3af' }}>{u.lecture_count ?? 0}</td>
                                    </tr>
                                ))}
                                {!recentUsers.length && <tr><td colSpan={3} style={{ color: '#d1d5db', textAlign: 'center', padding: 20 }}>Loading…</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div>
                    <div className="adm-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Recent Lectures</span>
                        <span style={{ fontSize: 11, color: '#a3a3a3', cursor: 'pointer', textTransform: 'none', fontWeight: 400 }} onClick={() => navigate('/admin/lectures')}>View all →</span>
                    </div>
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Title</th><th>Duration</th><th>Date</th></tr></thead>
                            <tbody>
                                {(stats?.recent_lectures || []).map(l => (
                                    <tr key={l.id} className="adm-link-row" onClick={() => navigate(`/admin/lectures/${l.id}`)}>
                                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {l.title || 'Untitled'}
                                        </td>
                                        <td>{fmtDuration(l.total_duration_seconds)}</td>
                                        <td>{fmtDate(l.created_at)}</td>
                                    </tr>
                                ))}
                                {!stats && <tr><td colSpan={3} style={{ color: '#d1d5db', textAlign: 'center', padding: 20 }}>Loading…</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
