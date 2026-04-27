import React, { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi.js';

const CSS = `
.adm-page-title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 24px; }
.adm-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 24px; }
.adm-select { padding: 8px 12px; background: #141414; border: 1px solid #2a2a2a; border-radius: 7px; color: #e8e8e8; font-size: 13px; cursor: pointer; }
.adm-stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
.adm-stat-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 20px; text-align: center; }
.adm-stat-label { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.adm-stat-value { font-size: 32px; font-weight: 700; color: #fff; }
.adm-stat-sub { font-size: 11px; color: #444; margin-top: 4px; }
.adm-section-title { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; margin-top: 28px; }
.adm-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 20px; margin-bottom: 24px; }
.adm-bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.adm-bar-label { width: 180px; font-size: 12px; color: #888; flex-shrink: 0; }
.adm-bar-track { flex: 1; height: 6px; background: #1e1e1e; border-radius: 3px; overflow: hidden; }
.adm-bar-fill { height: 100%; background: #7c3aed; border-radius: 3px; transition: width 0.4s; }
.adm-bar-pct { font-size: 11px; color: #555; width: 36px; text-align: right; }
.adm-sparkline { display: flex; align-items: flex-end; gap: 2px; height: 48px; }
.adm-spark-bar { flex: 1; background: #7c3aed44; border-radius: 2px 2px 0 0; min-height: 2px; }
.adm-table-wrap { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.adm-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #555; border-bottom: 1px solid #1e1e1e; background: #0f0f0f; text-transform: uppercase; letter-spacing: 0.06em; }
.adm-table td { padding: 11px 16px; border-bottom: 1px solid #111; color: #c8c8c8; vertical-align: middle; }
.adm-table tr:last-child td { border-bottom: none; }
.adm-empty { text-align: center; padding: 32px; color: #444; }
@media (max-width: 700px) { .adm-stats-row { grid-template-columns: 1fr; } .adm-bar-label { width: 120px; } }
`;

export default function AdminAnalytics() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        adminApi.getAnalytics({ days })
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [days]);

    const activeUsers = data?.active_users || {};
    const featureAdoption = data?.feature_adoption || {};
    const topUsers = data?.top_users || [];
    const dailyActive = data?.daily_active || [];
    const maxDaily = Math.max(...dailyActive.map(d => d.active_users), 1);
    const maxAdoption = Math.max(...Object.values(featureAdoption), 1);

    return (
        <div>
            <style>{CSS}</style>
            <div className="adm-page-title">Engagement Analytics</div>

            <div className="adm-toolbar">
                <span style={{ fontSize: 13, color: '#555' }}>Period:</span>
                <select className="adm-select" value={days} onChange={e => setDays(Number(e.target.value))}>
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={90}>Last 90 days</option>
                    <option value={365}>Last 365 days</option>
                </select>
            </div>

            {loading && <div style={{ color: '#444', fontSize: 13 }}>Loading…</div>}

            {!loading && (
                <>
                    <div className="adm-stats-row">
                        <div className="adm-stat-card">
                            <div className="adm-stat-label">Daily Active Users</div>
                            <div className="adm-stat-value">{activeUsers.dau ?? '—'}</div>
                            <div className="adm-stat-sub">last 24h</div>
                        </div>
                        <div className="adm-stat-card">
                            <div className="adm-stat-label">Weekly Active Users</div>
                            <div className="adm-stat-value">{activeUsers.wau ?? '—'}</div>
                            <div className="adm-stat-sub">last 7 days</div>
                        </div>
                        <div className="adm-stat-card">
                            <div className="adm-stat-label">Monthly Active Users</div>
                            <div className="adm-stat-value">{activeUsers.mau ?? '—'}</div>
                            <div className="adm-stat-sub">last {days} days</div>
                        </div>
                    </div>

                    {dailyActive.length > 0 && (
                        <>
                            <div className="adm-section-title">Daily Active Users ({days}d)</div>
                            <div className="adm-card" style={{ paddingBottom: 10 }}>
                                <div className="adm-sparkline">
                                    {dailyActive.map((d, i) => (
                                        <div
                                            key={i}
                                            className="adm-spark-bar"
                                            title={`${d.date}: ${d.active_users} users`}
                                            style={{ height: `${Math.max(4, Math.round((d.active_users / maxDaily) * 48))}px` }}
                                        />
                                    ))}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#333', marginTop: 4 }}>
                                    <span>{dailyActive[0]?.date}</span>
                                    <span>{dailyActive[dailyActive.length - 1]?.date}</span>
                                </div>
                            </div>
                        </>
                    )}

                    {Object.keys(featureAdoption).length > 0 && (
                        <>
                            <div className="adm-section-title">Feature Adoption (% of active users)</div>
                            <div className="adm-card">
                                {Object.entries(featureAdoption).map(([feat, pct]) => (
                                    <div className="adm-bar-row" key={feat}>
                                        <span className="adm-bar-label">{feat.replace(/_/g, ' ')}</span>
                                        <div className="adm-bar-track">
                                            <div className="adm-bar-fill" style={{ width: `${Math.round((pct / maxAdoption) * 100)}%` }} />
                                        </div>
                                        <span className="adm-bar-pct">{pct}%</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    <div className="adm-section-title">Top Users by Activity</div>
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>User ID</th>
                                    <th>API Calls</th>
                                    <th>Lectures</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!topUsers.length && (
                                    <tr><td colSpan={4} className="adm-empty">No activity data yet.</td></tr>
                                )}
                                {topUsers.map((u, i) => (
                                    <tr key={u.user_id}>
                                        <td style={{ color: '#555' }}>{i + 1}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{u.user_id}</td>
                                        <td>{u.api_calls.toLocaleString()}</td>
                                        <td>{u.lectures}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
