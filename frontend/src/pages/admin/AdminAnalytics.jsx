import React, { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi.js';


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

            {loading && <div style={{ color: '#a3a3a3', fontSize: 13 }}>Loading…</div>}

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
                            <div className="adm-card" style={{ paddingBottom: 10, marginBottom: 0 }}>
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#c4c4c4', marginTop: 4 }}>
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
                                    <div className="adm-adopt-row" key={feat}>
                                        <span className="adm-adopt-label">{feat.replace(/_/g, ' ')}</span>
                                        <div className="adm-adopt-track">
                                            <div className="adm-adopt-fill" style={{ width: `${Math.round((pct / maxAdoption) * 100)}%` }} />
                                        </div>
                                        <span className="adm-adopt-pct">{pct}%</span>
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
                                        <td style={{ color: '#c4c4c4' }}>{i + 1}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b6b6b' }}>{u.user_id}</td>
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
