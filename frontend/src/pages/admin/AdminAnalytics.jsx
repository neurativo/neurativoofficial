import React, { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../../lib/adminApi.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(usd) {
    if (usd == null) return '—';
    if (usd < 0.01) return `$${usd.toFixed(5)}`;
    return `$${usd.toFixed(4)}`;
}
function fmtLkr(lkr) {
    if (lkr == null) return '—';
    return `Rs ${lkr.toFixed(2)}`;
}
function fmtNum(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString();
}
function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Sparkline({ data, valueKey = 'cost_usd', colorClass = '#6366f1', label = '' }) {
    if (!data || data.length === 0) return null;
    const vals = data.map(d => d[valueKey] || 0);
    const max = Math.max(...vals, 0.000001);
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 52 }}>
                {data.map((d, i) => (
                    <div
                        key={i}
                        title={`${d.date || ''}: ${d[valueKey]}`}
                        style={{
                            flex: 1,
                            minWidth: 3,
                            height: `${Math.max(4, Math.round((d[valueKey] / max) * 52))}px`,
                            background: colorClass,
                            borderRadius: '2px 2px 0 0',
                            opacity: 0.8,
                        }}
                    />
                ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#c4c4c4', marginTop: 3 }}>
                <span>{data[0]?.date}</span>
                <span>{data[data.length - 1]?.date}</span>
            </div>
        </div>
    );
}

function StatCard({ label, value, sub, color }) {
    return (
        <div className="adm-stat-card">
            <div className="adm-stat-label">{label}</div>
            <div className="adm-stat-value" style={color ? { color } : {}}>{value ?? '—'}</div>
            {sub && <div className="adm-stat-sub">{sub}</div>}
        </div>
    );
}

function SectionTitle({ children }) {
    return <div className="adm-section-title" style={{ marginTop: 28 }}>{children}</div>;
}

function BarRow({ label, value, max, display }) {
    const pct = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
            <div style={{ width: 140, fontSize: 12, color: '#555', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{label}</div>
            <div style={{ flex: 1, height: 8, background: '#f0ede8', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: '#6366f1', borderRadius: 4, transition: 'width 0.4s' }} />
            </div>
            <div style={{ fontSize: 12, color: '#1a1a1a', minWidth: 70, textAlign: 'right' }}>{display}</div>
        </div>
    );
}

// ── Section: Visit Analytics ──────────────────────────────────────────────────

function VisitSection({ days }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        adminApi.getVisitAnalytics(days)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [days]);

    if (loading) return <div style={{ color: '#a3a3a3', fontSize: 13 }}>Loading visits…</div>;
    if (!data) return <div style={{ color: '#e57373', fontSize: 13 }}>Failed to load visit data.</div>;

    const topPages = data.top_pages || [];
    const maxViews = Math.max(...topPages.map(p => p.views), 1);
    const daily = data.daily_trend || [];

    return (
        <>
            <div className="adm-stats-row">
                <StatCard label="Total Pageviews"   value={fmtNum(data.total_views)}    sub={`last ${days}d`} />
                <StatCard label="Unique Sessions"   value={fmtNum(data.unique_sessions)} sub="by session ID" />
                <StatCard label="Authenticated"     value={fmtNum(data.authed_views)}   sub="signed-in visits" />
                <StatCard label="Anonymous"         value={fmtNum(data.anon_views)}     sub="signed-out visits" />
            </div>

            {daily.length > 0 && (
                <>
                    <SectionTitle>Daily Pageviews ({days}d)</SectionTitle>
                    <div className="adm-card" style={{ paddingBottom: 12 }}>
                        <Sparkline data={daily} valueKey="views" colorClass="#6366f1" />
                    </div>
                </>
            )}

            {topPages.length > 0 && (
                <>
                    <SectionTitle>Top Pages</SectionTitle>
                    <div className="adm-card">
                        {topPages.map(p => (
                            <BarRow key={p.page} label={p.page} value={p.views} max={maxViews} display={fmtNum(p.views)} />
                        ))}
                    </div>
                </>
            )}
        </>
    );
}

// ── Section: Engagement ───────────────────────────────────────────────────────

function EngagementSection({ days }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        adminApi.getAnalytics({ days })
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [days]);

    if (loading) return <div style={{ color: '#a3a3a3', fontSize: 13 }}>Loading engagement…</div>;
    if (!data) return <div style={{ color: '#e57373', fontSize: 13 }}>Failed to load engagement data.</div>;

    const activeUsers = data.active_users || {};
    const featureAdoption = data.feature_adoption || {};
    const topUsers = data.top_users || [];
    const dailyActive = data.daily_active || [];
    const maxAdoption = Math.max(...Object.values(featureAdoption), 1);

    return (
        <>
            <div className="adm-stats-row">
                <StatCard label="DAU"  value={fmtNum(activeUsers.dau)} sub="last 24h" />
                <StatCard label="WAU"  value={fmtNum(activeUsers.wau)} sub="last 7 days" />
                <StatCard label="MAU"  value={fmtNum(activeUsers.mau)} sub={`last ${days} days`} />
            </div>

            {dailyActive.length > 0 && (
                <>
                    <SectionTitle>Daily Active Users ({days}d)</SectionTitle>
                    <div className="adm-card" style={{ paddingBottom: 12 }}>
                        <Sparkline data={dailyActive} valueKey="active_users" colorClass="#10b981" />
                    </div>
                </>
            )}

            {Object.keys(featureAdoption).length > 0 && (
                <>
                    <SectionTitle>Feature Adoption (% of active users)</SectionTitle>
                    <div className="adm-card">
                        {Object.entries(featureAdoption).map(([feat, pct]) => (
                            <BarRow key={feat} label={feat.replace(/_/g, ' ')} value={pct} max={maxAdoption} display={`${pct}%`} />
                        ))}
                    </div>
                </>
            )}

            {topUsers.length > 0 && (
                <>
                    <SectionTitle>Top Users by Activity</SectionTitle>
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>#</th><th>User ID</th><th>API Calls</th><th>Lectures</th></tr></thead>
                            <tbody>
                                {topUsers.map((u, i) => (
                                    <tr key={u.user_id}>
                                        <td style={{ color: '#c4c4c4' }}>{i + 1}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b6b6b' }}>{u.user_id}</td>
                                        <td>{fmtNum(u.api_calls)}</td>
                                        <td>{u.lectures}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </>
    );
}

// ── Section: Cost Overview ────────────────────────────────────────────────────

function CostOverviewSection({ days }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        adminApi.getCostsOverview(days)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [days]);

    if (loading) return <div style={{ color: '#a3a3a3', fontSize: 13 }}>Loading cost overview…</div>;
    if (!data) return <div style={{ color: '#e57373', fontSize: 13 }}>Failed to load cost data.</div>;

    const byPlan  = data.by_plan  || {};
    const byModel = data.by_model || {};
    const daily   = data.daily    || [];
    const maxPlan  = Math.max(...Object.values(byPlan), 0.000001);
    const maxModel = Math.max(...Object.values(byModel), 0.000001);

    return (
        <>
            <div className="adm-stats-row">
                <StatCard label="Total Cost (USD)" value={fmt$(data.total_usd)}  sub={`last ${days}d`} color="#dc2626" />
                <StatCard label="Total Cost (LKR)" value={fmtLkr(data.total_lkr)} sub="incl. exchange rate" />
                <StatCard label="API Calls"        value={fmtNum(data.call_count)} sub="billed events" />
            </div>

            {daily.length > 0 && (
                <>
                    <SectionTitle>Daily Cost ({days}d)</SectionTitle>
                    <div className="adm-card" style={{ paddingBottom: 12 }}>
                        <Sparkline data={daily} valueKey="cost_usd" colorClass="#dc2626" />
                    </div>
                </>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                <div>
                    <SectionTitle>Cost by Plan</SectionTitle>
                    <div className="adm-card">
                        {Object.keys(byPlan).length === 0
                            ? <div style={{ color: '#c4c4c4', fontSize: 13 }}>No data.</div>
                            : Object.entries(byPlan)
                                .sort((a, b) => b[1] - a[1])
                                .map(([plan, usd]) => (
                                    <BarRow key={plan} label={plan} value={usd} max={maxPlan} display={fmt$(usd)} />
                                ))
                        }
                    </div>
                </div>
                <div>
                    <SectionTitle>Cost by Model</SectionTitle>
                    <div className="adm-card">
                        {Object.keys(byModel).length === 0
                            ? <div style={{ color: '#c4c4c4', fontSize: 13 }}>No data.</div>
                            : Object.entries(byModel)
                                .sort((a, b) => b[1] - a[1])
                                .map(([model, usd]) => (
                                    <BarRow key={model} label={model} value={usd} max={maxModel} display={fmt$(usd)} />
                                ))
                        }
                    </div>
                </div>
            </div>
        </>
    );
}

// ── Section: Per-User Costs ───────────────────────────────────────────────────

function CostPerUserSection({ days }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 25;

    const load = useCallback((p) => {
        setLoading(true);
        adminApi.getCostsPerUser(days, p, PAGE_SIZE)
            .then(d => { setData(d); setPage(p); })
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [days]);

    useEffect(() => { load(1); }, [load]);

    const users = data?.users || [];
    const total = data?.total || 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    return (
        <>
            {loading && <div style={{ color: '#a3a3a3', fontSize: 13 }}>Loading per-user costs…</div>}
            {!loading && (
                <>
                    <div style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 10 }}>
                        {total} users with API costs in the last {days}d
                    </div>
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>User ID</th>
                                    <th>Plan</th>
                                    <th>Calls</th>
                                    <th>Cost (USD)</th>
                                    <th>Cost (LKR)</th>
                                    <th>Features</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.length === 0 && (
                                    <tr><td colSpan={7} className="adm-empty">No cost data for this period.</td></tr>
                                )}
                                {users.map((u, i) => (
                                    <tr key={u.user_id}>
                                        <td style={{ color: '#c4c4c4' }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b6b6b' }}>{u.user_id}</td>
                                        <td>
                                            <span style={{
                                                padding: '1px 8px', borderRadius: 100, fontSize: 11, fontWeight: 600,
                                                background: u.plan_tier === 'pro' ? '#f0fdf4' : u.plan_tier === 'student' ? '#eef2ff' : '#f5f5f4',
                                                color: u.plan_tier === 'pro' ? '#15803d' : u.plan_tier === 'student' ? '#4f46e5' : '#78716c',
                                                border: `1px solid ${u.plan_tier === 'pro' ? '#86efac' : u.plan_tier === 'student' ? '#c7d2fe' : '#e7e5e4'}`,
                                            }}>
                                                {u.plan_tier || 'free'}
                                            </span>
                                        </td>
                                        <td>{fmtNum(u.call_count)}</td>
                                        <td style={{ color: '#dc2626', fontWeight: 500 }}>{fmt$(u.cost_usd)}</td>
                                        <td style={{ color: '#92400e' }}>{fmtLkr(u.cost_lkr)}</td>
                                        <td style={{ fontSize: 11, color: '#6b6b6b' }}>
                                            {(u.features || []).slice(0, 4).join(', ')}{(u.features || []).length > 4 ? '…' : ''}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
                            <button className="adm-btn" disabled={page <= 1} onClick={() => load(page - 1)}>← Prev</button>
                            <span style={{ fontSize: 12, color: '#6b6b6b' }}>Page {page} / {totalPages}</span>
                            <button className="adm-btn" disabled={page >= totalPages} onClick={() => load(page + 1)}>Next →</button>
                        </div>
                    )}
                </>
            )}
        </>
    );
}

// ── Section: Beta Costs ───────────────────────────────────────────────────────

function BetaCostsSection({ days }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        adminApi.getCostsBeta(days)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [days]);

    if (loading) return <div style={{ color: '#a3a3a3', fontSize: 13 }}>Loading beta costs…</div>;
    if (!data) return <div style={{ color: '#e57373', fontSize: 13 }}>Failed to load beta cost data.</div>;

    const users    = data.users    || [];
    const byFeature = data.by_feature || {};
    const maxFeat  = Math.max(...Object.values(byFeature), 0.000001);

    return (
        <>
            <div className="adm-stats-row">
                <StatCard label="Beta Tester Cost (USD)" value={fmt$(data.total_usd)}     sub={`last ${days}d`} color="#dc2626" />
                <StatCard label="Beta Tester Cost (LKR)" value={fmtLkr(data.total_lkr)}  sub="incl. exchange rate" />
                <StatCard label="Total Beta Users"       value={fmtNum(data.user_count)}  sub="approved applicants" />
                <StatCard label="Avg Cost / User"        value={fmt$(data.avg_cost_usd)}  sub="among active users" />
            </div>

            {Object.keys(byFeature).length > 0 && (
                <>
                    <SectionTitle>Beta Cost by Feature</SectionTitle>
                    <div className="adm-card">
                        {Object.entries(byFeature).map(([feat, usd]) => (
                            <BarRow key={feat} label={feat} value={usd} max={maxFeat} display={fmt$(usd)} />
                        ))}
                    </div>
                </>
            )}

            {users.length > 0 && (
                <>
                    <SectionTitle>Per-Beta-User Cost</SectionTitle>
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead>
                                <tr><th>#</th><th>Email</th><th>User ID</th><th>Calls</th><th>Cost (USD)</th><th>Cost (LKR)</th></tr>
                            </thead>
                            <tbody>
                                {users.map((u, i) => (
                                    <tr key={u.user_id}>
                                        <td style={{ color: '#c4c4c4' }}>{i + 1}</td>
                                        <td style={{ fontSize: 12 }}>{u.email || '—'}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b6b6b' }}>{u.user_id}</td>
                                        <td>{fmtNum(u.call_count)}</td>
                                        <td style={{ color: '#dc2626', fontWeight: 500 }}>{fmt$(u.cost_usd)}</td>
                                        <td style={{ color: '#92400e' }}>{fmtLkr(u.cost_lkr)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </>
    );
}

// ── Root Page ─────────────────────────────────────────────────────────────────

const TABS = [
    { id: 'visits',      label: 'Page Visits' },
    { id: 'engagement',  label: 'Engagement' },
    { id: 'costs',       label: 'Cost Overview' },
    { id: 'per_user',    label: 'Per-User Costs' },
    { id: 'beta',        label: 'Beta Costs' },
];

export default function AdminAnalytics() {
    const [days, setDays] = useState(30);
    const [tab, setTab]   = useState('visits');

    return (
        <div>
            <div className="adm-page-title">Analytics & Costs</div>

            <div className="adm-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
                {/* Period selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: '#555' }}>Period:</span>
                    <select className="adm-select" value={days} onChange={e => setDays(Number(e.target.value))}>
                        <option value={7}>Last 7 days</option>
                        <option value={30}>Last 30 days</option>
                        <option value={90}>Last 90 days</option>
                        <option value={365}>Last 365 days</option>
                    </select>
                </div>

                {/* Tab switcher */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            style={{
                                padding: '5px 14px',
                                borderRadius: 6,
                                border: '1px solid',
                                fontSize: 12,
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                                background: tab === t.id ? '#6366f1' : '#ffffff',
                                color:      tab === t.id ? '#ffffff' : '#555',
                                borderColor: tab === t.id ? '#6366f1' : '#e7e5e4',
                            }}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {tab === 'visits'     && <VisitSection      key={`v${days}`}  days={days} />}
            {tab === 'engagement' && <EngagementSection key={`e${days}`}  days={days} />}
            {tab === 'costs'      && <CostOverviewSection key={`c${days}`} days={days} />}
            {tab === 'per_user'   && <CostPerUserSection  key={`u${days}`} days={days} />}
            {tab === 'beta'       && <BetaCostsSection    key={`b${days}`} days={days} />}
        </div>
    );
}
