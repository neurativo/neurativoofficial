import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../lib/adminApi.js';

function PlanPill({ tier }) {
    return <span className={`adm-plan-pill adm-plan-${tier || 'free'}`}>{tier || 'free'}</span>;
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

function StatSkeleton() {
    return (
        <div className="adm-card">
            <div className="adm-skeleton" style={{ height: 11, width: 60, marginBottom: 12 }} />
            <div className="adm-skeleton" style={{ height: 30, width: 80, marginBottom: 6 }} />
            <div className="adm-skeleton" style={{ height: 10, width: 50 }} />
        </div>
    );
}

const QUICK_ACTIONS = [
    { icon: '📢', label: 'Post Announcement', sub: 'Broadcast to all users', to: '/admin/announcements', color: '#eff6ff', border: '#bfdbfe' },
    { icon: '🚩', label: 'Manage Feature Flags', sub: 'Control feature rollout', to: '/admin/feature-flags', color: '#eef2ff', border: '#c7d2fe' },
    { icon: '⭐', label: "Publish What's New", sub: 'Announce a new release', to: '/admin/releases', color: '#fefce8', border: '#fef08a' },
    { icon: '💬', label: 'Review Feedback', sub: 'Read user submissions', to: '/admin/feedback', color: '#f0fdf4', border: '#bbf7d0' },
    { icon: '👥', label: 'Live Sessions', sub: 'See who is recording now', to: '/admin/sessions', color: '#fdf4ff', border: '#e9d5ff' },
    { icon: '💰', label: 'View Costs', sub: 'Monitor API spending', to: '/admin/costs', color: '#fff7ed', border: '#fed7aa' },
];

const planColors = { free: '#9ca3af', student: '#6366f1', pro: '#2563eb' };

export default function AdminDashboard() {
    const [stats, setStats]           = useState(null);
    const [recentUsers, setRecentUsers] = useState([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        Promise.all([
            adminApi.getStats(),
            adminApi.listUsers({ page: 1, page_size: 8 }),
        ])
            .then(([s, u]) => {
                setStats(s);
                setRecentUsers(u.users || []);
            })
            .catch(e => setError(e?.response?.data?.detail || e.message || 'Failed to load'))
            .finally(() => setLoading(false));
    }, []);

    const planDist   = stats?.plan_distribution || { free: 0, student: 0, pro: 0 };
    const totalUsers = stats?.total_users || 0;
    const paidUsers  = (planDist.student || 0) + (planDist.pro || 0);
    const convRate   = totalUsers > 0 ? ((paidUsers / totalUsers) * 100).toFixed(1) : '0.0';
    const maxPlan    = Math.max(...Object.values(planDist), 1);

    return (
        <div>
            <div className="adm-page-title">Dashboard</div>

            {error && <div className="adm-error">{error}</div>}

            {/* KPI cards */}
            <div className="adm-cards">
                {loading ? (
                    Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />)
                ) : (
                    <>
                        <div className="adm-card">
                            <div className="adm-card-label">Total Users</div>
                            <div className="adm-card-value">{totalUsers.toLocaleString()}</div>
                            <div className="adm-card-sub">all time</div>
                        </div>
                        <div className="adm-card">
                            <div className="adm-card-label">Paid Users</div>
                            <div className="adm-card-value" style={{ color: paidUsers > 0 ? '#6366f1' : undefined }}>
                                {paidUsers.toLocaleString()}
                            </div>
                            <div className="adm-card-sub">student + pro</div>
                        </div>
                        <div className="adm-card">
                            <div className="adm-card-label">Conversion Rate</div>
                            <div className="adm-card-value" style={{ color: parseFloat(convRate) >= 5 ? '#10b981' : undefined }}>
                                {convRate}%
                            </div>
                            <div className="adm-card-sub">free → paid</div>
                        </div>
                        <div className="adm-card">
                            <div className="adm-card-label">Total Lectures</div>
                            <div className="adm-card-value">{(stats.total_lectures || 0).toLocaleString()}</div>
                            <div className="adm-card-sub">all time</div>
                        </div>
                        <div className="adm-card">
                            <div className="adm-card-label">Hours Recorded</div>
                            <div className="adm-card-value">{(stats.total_hours_recorded || 0).toLocaleString()}</div>
                            <div className="adm-card-sub">across all users</div>
                        </div>
                        <div className="adm-card">
                            <div className="adm-card-label">Live Now</div>
                            <div className="adm-card-value" style={{ color: (stats.active_sessions || 0) > 0 ? '#10b981' : undefined }}>
                                {stats.active_sessions || 0}
                            </div>
                            <div className="adm-card-sub">
                                {(stats.active_sessions || 0) > 0 && <span className="adm-pulse" />}
                                active sessions
                            </div>
                        </div>
                        <div className="adm-card">
                            <div className="adm-card-label">Shared Lectures</div>
                            <div className="adm-card-value">{stats.shared_lectures || 0}</div>
                            <div className="adm-card-sub">{(stats.total_share_views || 0).toLocaleString()} views</div>
                        </div>
                        <div className="adm-card">
                            <div className="adm-card-label">Q&A Questions</div>
                            <div className="adm-card-value">{(stats.total_questions_detected || 0).toLocaleString()}</div>
                            <div className="adm-card-sub">detected by CIF</div>
                        </div>
                    </>
                )}
            </div>

            <div className="adm-two-col" style={{ alignItems: 'start' }}>
                {/* Plan distribution */}
                <div>
                    <div className="adm-section-title">Plan Distribution</div>
                    <div className="adm-card">
                        {loading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {[1,2,3].map(i => <div key={i} className="adm-skeleton" style={{ height: 12 }} />)}
                            </div>
                        ) : (
                            <div className="adm-plan-bars">
                                {Object.entries(planDist).map(([plan, count]) => {
                                    const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0;
                                    return (
                                        <div className="adm-plan-bar-row" key={plan}>
                                            <div className="adm-plan-bar-label">{plan}</div>
                                            <div className="adm-plan-bar-track">
                                                <div className="adm-plan-bar-fill"
                                                    style={{ width: `${(count / maxPlan) * 100}%`, background: planColors[plan] || '#444' }} />
                                            </div>
                                            <div className="adm-plan-bar-count">{count}</div>
                                            <div className="adm-plan-bar-pct">{pct}%</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Recent lectures sub-section */}
                        <div style={{ marginTop: 20 }}>
                            <div style={{
                                fontSize: '10.5px', fontWeight: 700, color: 'var(--adm-text-muted)',
                                textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10,
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <span>Recent Lectures</span>
                                <span
                                    style={{ fontSize: 11, cursor: 'pointer', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}
                                    onClick={() => navigate('/admin/lectures')}
                                >
                                    View all →
                                </span>
                            </div>
                            {loading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {[1,2,3].map(i => <div key={i} className="adm-skeleton" style={{ height: 14 }} />)}
                                </div>
                            ) : (
                                (stats?.recent_lectures || []).slice(0, 5).map(l => (
                                    <div key={l.id}
                                        onClick={() => navigate(`/admin/lectures/${l.id}`)}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '8px 0', borderBottom: '1px solid var(--adm-border)',
                                            cursor: 'pointer', gap: 8,
                                        }}
                                    >
                                        <span style={{
                                            fontSize: 12, color: '#6366f1',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                                        }}>
                                            {l.title || 'Untitled'}
                                        </span>
                                        <span style={{ fontSize: 11, color: 'var(--adm-text-muted)', flexShrink: 0 }}>
                                            {fmtDuration(l.total_duration_seconds)}
                                        </span>
                                        <span style={{ fontSize: 11, color: 'var(--adm-text-muted)', flexShrink: 0 }}>
                                            {fmtDate(l.created_at)}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Quick Actions + Recent Users */}
                <div>
                    <div className="adm-section-title">Quick Actions</div>
                    <div className="adm-quick-grid">
                        {QUICK_ACTIONS.map(a => (
                            <div
                                key={a.to}
                                className="adm-quick-action"
                                onClick={() => navigate(a.to)}
                                style={{ margin: 0 }}
                            >
                                <div className="adm-quick-action-icon"
                                    style={{ background: a.color, border: `1px solid ${a.border}` }}>
                                    {a.icon}
                                </div>
                                <div>
                                    <div className="adm-quick-action-label">{a.label}</div>
                                    <div className="adm-quick-action-sub">{a.sub}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{
                        fontSize: '10.5px', fontWeight: 700, color: 'var(--adm-text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <span>Recent Users</span>
                        <span
                            style={{ fontSize: 11, cursor: 'pointer', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}
                            onClick={() => navigate('/admin/users')}
                        >
                            View all →
                        </span>
                    </div>
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead>
                                <tr><th>User</th><th>Plan</th><th>Lectures</th></tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i}><td colSpan={3}><div className="adm-skeleton" style={{ height: 14 }} /></td></tr>
                                    ))
                                ) : recentUsers.map(u => (
                                    <tr key={u.id} className="adm-link-row" onClick={() => navigate(`/admin/users/${u.id}`)}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {u.image_url
                                                    ? <img src={u.image_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }} />
                                                    : <div style={{
                                                        width: 24, height: 24, borderRadius: '50%',
                                                        background: '#eef2ff', border: '1px solid #c7d2fe',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 10, color: '#4f46e5', fontWeight: 700, flexShrink: 0,
                                                      }}>
                                                        {(u.display_name || u.email || '?')[0].toUpperCase()}
                                                      </div>
                                                }
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: 12, color: 'var(--adm-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {u.display_name || <span style={{ color: 'var(--adm-text-muted)', fontWeight: 400 }}>No name</span>}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: 'var(--adm-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td><PlanPill tier={u.plan_tier} /></td>
                                        <td style={{ color: 'var(--adm-text-muted)', fontSize: 12 }}>{u.lecture_count ?? 0}</td>
                                    </tr>
                                ))}
                                {!loading && !recentUsers.length && (
                                    <tr><td colSpan={3} className="adm-empty">No users yet.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
