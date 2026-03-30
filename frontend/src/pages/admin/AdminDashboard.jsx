import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../lib/adminApi.js';

const CSS = `
.adm-page-title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 24px; }
.adm-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-bottom: 28px; }
.adm-card {
    background: #141414;
    border: 1px solid #1e1e1e;
    border-radius: 10px;
    padding: 20px;
}
.adm-card-label { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.adm-card-value { font-size: 32px; font-weight: 700; color: #fff; }
.adm-card-sub { font-size: 12px; color: #555; margin-top: 4px; }
.adm-section-title { font-size: 13px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; margin-top: 28px; }
.adm-plan-bars { display: flex; flex-direction: column; gap: 8px; max-width: 400px; }
.adm-plan-bar-row { display: flex; align-items: center; gap: 10px; }
.adm-plan-bar-label { width: 60px; font-size: 12px; color: #888; text-align: right; }
.adm-plan-bar-track { flex: 1; height: 8px; background: #1e1e1e; border-radius: 99px; overflow: hidden; }
.adm-plan-bar-fill { height: 100%; border-radius: 99px; transition: width 0.4s ease; }
.adm-plan-bar-count { width: 30px; font-size: 12px; color: #888; }
.adm-table-wrap { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; overflow: hidden; margin-top: 8px; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.adm-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #555; border-bottom: 1px solid #1e1e1e; background: #0f0f0f; text-transform: uppercase; letter-spacing: 0.06em; }
.adm-table td { padding: 11px 16px; border-bottom: 1px solid #111; color: #c8c8c8; vertical-align: middle; }
.adm-table tr:last-child td { border-bottom: none; }
.adm-table tr:hover td { background: #ffffff04; }
.adm-plan-pill { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; }
.adm-plan-free { background: #ffffff0f; color: #888; }
.adm-plan-student { background: #7c3aed22; color: #a78bfa; border: 1px solid #7c3aed44; }
.adm-plan-pro { background: #0369a122; color: #38bdf8; border: 1px solid #0369a144; }
.adm-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.adm-link-row { cursor: pointer; }
.adm-error { color: #ef4444; font-size: 13px; padding: 12px 0; }
@media (max-width: 900px) { .adm-two-col { grid-template-columns: 1fr; } }
`;

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
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        adminApi.getStats()
            .then(setStats)
            .catch(() => setError('Failed to load stats'));
    }, []);

    const planDist = stats?.plan_distribution || { free: 0, student: 0, pro: 0 };
    const totalUsers = stats?.total_users || 0;
    const maxPlan = Math.max(...Object.values(planDist), 1);

    const planColors = { free: '#444', student: '#7c3aed', pro: '#0369a1' };

    return (
        <div>
            <style>{CSS}</style>
            <div className="adm-page-title">Dashboard</div>

            {error && <div className="adm-error">{error}</div>}

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
                    <div className="adm-section-title">Recent Users</div>
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>User</th><th>Plan</th><th>Joined</th></tr></thead>
                            <tbody>
                                {(stats?.recent_users || []).map(u => (
                                    <tr key={u.id} className="adm-link-row" onClick={() => navigate(`/admin/users/${u.id}`)}>
                                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{u.id?.slice(0, 16)}…</td>
                                        <td><PlanPill tier={u.plan_tier} /></td>
                                        <td>{fmtDate(u.created_at)}</td>
                                    </tr>
                                ))}
                                {!stats && <tr><td colSpan={3} style={{ color: '#444', textAlign: 'center' }}>Loading…</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div>
                    <div className="adm-section-title">Recent Lectures</div>
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Title</th><th>Duration</th><th>Date</th></tr></thead>
                            <tbody>
                                {(stats?.recent_lectures || []).map(l => (
                                    <tr key={l.id}>
                                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {l.title || 'Untitled'}
                                        </td>
                                        <td>{fmtDuration(l.total_duration_seconds)}</td>
                                        <td>{fmtDate(l.created_at)}</td>
                                    </tr>
                                ))}
                                {!stats && <tr><td colSpan={3} style={{ color: '#444', textAlign: 'center' }}>Loading…</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
