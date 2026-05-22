import React, { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../../lib/adminApi.js';

// ── helpers ──────────────────────────────────────────────────────────────────

const FEATURE_COLORS = {
    whisper_transcription: '#3b82f6',
    whisper_import:        '#60a5fa',
    micro_summary:         '#6366f1',
    section_summary:       '#818cf8',
    master_summary:        '#a5b4fc',
    qa_answer:             '#2563eb',
    qa_expansion:          '#0284c7',
    smart_explain:         '#0891b2',
    vision_screen:         '#d97706',
    vision_board:          '#f59e0b',
    topic_detection:       '#10b981',
    cif_classification:    '#059669',
    pdf_executive_summary: '#f43f5e',
    pdf_enrich_section:    '#e11d48',
    pdf_glossary:          '#be185d',
    pdf_takeaways:         '#ea580c',
    pdf_quick_review:      '#dc2626',
    pdf_study_roadmap:     '#c026d3',
    pdf_conceptual_map:    '#7c3aed',
};

const PLAN_COLORS = { free: '#6b7280', student: '#3b82f6', pro: '#8b5cf6' };
const PLAN_LABELS = { free: 'Free', student: 'Student', pro: 'Pro' };

function usd(v, decimals = 4) {
    if (!v) return '$0.00';
    const n = Number(v);
    if (n === 0) return '$0.00';
    if (n < 0.01) return '$' + n.toFixed(6);
    return '$' + n.toFixed(decimals);
}
function usdShort(v) {
    if (!v) return '$0.00';
    return '$' + Number(v).toFixed(2);
}
function lkr(v) {
    if (!v) return 'Rs 0.00';
    return 'Rs ' + Number(v).toLocaleString('en', { maximumFractionDigits: 2 });
}
function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function truncId(id) {
    if (!id) return '—';
    return id.slice(0, 8) + '…';
}

function BarRow({ label, value, max, color, right }) {
    return (
        <div className="adm-feat-row">
            <div className="adm-feat-label" title={label}>{label.replace(/_/g, ' ')}</div>
            <div className="adm-feat-track">
                <div className="adm-feat-fill"
                    style={{ width: `${Math.max(2, (value / max) * 100)}%`, background: color || '#6366f1' }} />
            </div>
            <div className="adm-feat-cost">{right}</div>
        </div>
    );
}

function MiniBar({ daily }) {
    if (!daily || daily.length === 0) return <div className="adm-empty" style={{ fontSize: 12 }}>No daily data</div>;
    const max = Math.max(...daily.map(d => d.cost_usd), 0.000001);
    return (
        <div className="adm-chart" style={{ height: 48 }}>
            {daily.slice(-20).map(d => (
                <div className="adm-bar-col" key={d.date} title={`${d.date}: ${usd(d.cost_usd)}`}>
                    <div className="adm-bar-fill"
                        style={{ height: `${Math.max(3, (d.cost_usd / max) * 36)}px` }} />
                    <div className="adm-bar-label" style={{ display: 'none' }} />
                </div>
            ))}
        </div>
    );
}

// ── User detail drawer ────────────────────────────────────────────────────────

function UserDrawer({ userId, days, onClose }) {
    const [detail, setDetail] = useState(null);
    const [userInfo, setUserInfo] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) return;
        setLoading(true);
        Promise.allSettled([
            adminApi.getCostsUserDetail(userId, days),
            adminApi.getUser(userId),
        ]).then(([costRes, userRes]) => {
            if (costRes.status === 'fulfilled') setDetail(costRes.value);
            if (userRes.status === 'fulfilled') setUserInfo(userRes.value);
            setLoading(false);
        });
    }, [userId, days]);

    if (!userId) return null;

    const byFeat  = detail?.by_feature  || {};
    const byModel = detail?.by_model    || {};
    const maxFeat = Math.max(...Object.values(byFeat), 0.000001);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
        }}>
            <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
            <div style={{
                position: 'relative', background: 'var(--adm-bg)',
                width: '100%', maxWidth: 480,
                height: '90vh', overflowY: 'auto',
                borderRadius: '16px 16px 0 0',
                boxShadow: '0 -4px 32px rgba(0,0,0,0.18)',
                padding: '24px 20px 32px',
                display: 'flex', flexDirection: 'column', gap: 20,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>
                            {userInfo?.email || truncId(userId)}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--adm-text-muted)', marginTop: 2 }}>
                            {userInfo?.plan_tier
                                ? <span style={{ color: PLAN_COLORS[userInfo.plan_tier] }}>
                                    {PLAN_LABELS[userInfo.plan_tier]}
                                  </span>
                                : null
                            }
                            {' '}· last {days} days
                        </div>
                    </div>
                    <button className="adm-btn-ghost" onClick={onClose} style={{ padding: '4px 8px' }}>✕</button>
                </div>

                {loading && <div className="adm-empty">Loading…</div>}

                {!loading && detail && (
                    <>
                        <div className="adm-cards" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div className="adm-card">
                                <div className="adm-card-label">AI Cost</div>
                                <div className="adm-card-value" style={{ fontSize: 18 }}>
                                    {usd(detail.total_cost_usd)}
                                </div>
                                <div className="adm-card-sub">{lkr(detail.total_cost_lkr)}</div>
                            </div>
                            <div className="adm-card">
                                <div className="adm-card-label">API Calls</div>
                                <div className="adm-card-value" style={{ fontSize: 18 }}>
                                    {(detail.call_count || 0).toLocaleString()}
                                </div>
                                <div className="adm-card-sub">last {days} days</div>
                            </div>
                        </div>

                        {Object.keys(byFeat).length > 0 && (
                            <div>
                                <div className="adm-panel-title" style={{ marginBottom: 8 }}>Cost by Feature</div>
                                {Object.entries(byFeat).map(([feat, cost]) => (
                                    <BarRow key={feat} label={feat} value={cost} max={maxFeat}
                                        color={FEATURE_COLORS[feat] || '#6366f1'}
                                        right={usd(cost)} />
                                ))}
                            </div>
                        )}

                        {Object.keys(byModel).length > 0 && (
                            <div>
                                <div className="adm-panel-title" style={{ marginBottom: 8 }}>By Model</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {Object.entries(byModel).map(([model, cost]) => (
                                        <div key={model} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--adm-border)' }}>
                                            <span style={{ fontFamily: 'monospace', color: 'var(--adm-text-muted)' }}>{model}</span>
                                            <span style={{ fontWeight: 600 }}>{usd(cost)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {detail.daily?.length > 0 && (
                            <div>
                                <div className="adm-panel-title" style={{ marginBottom: 8 }}>Daily Spend</div>
                                <MiniBar daily={detail.daily} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ── Tab: Financial Overview ───────────────────────────────────────────────────

function TabFinancial({ days }) {
    const [data, setData]     = useState(null);
    const [summary, setSummary] = useState(null);
    const [error, setError]   = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.allSettled([
            adminApi.getCostsFinancial(days),
            adminApi.getCostsSummary({ days }),
        ]).then(([fin, sum]) => {
            if (fin.status === 'fulfilled')  setData(fin.value);
            else setError('Failed to load financial data');
            if (sum.status === 'fulfilled')  setSummary(sum.value);
            setLoading(false);
        });
    }, [days]);

    if (loading) return <div className="adm-empty" style={{ padding: 40 }}>Loading financial data…</div>;
    if (error)   return <div className="adm-error">{error}</div>;
    if (!data)   return null;

    const byPlan   = data.by_plan   || {};
    const daily    = summary?.daily || [];
    const byFeat   = summary?.by_feature || {};
    const featEntries = Object.entries(byFeat).sort((a, b) => b[1] - a[1]);
    const maxFeat  = Math.max(...featEntries.map(([,v]) => v), 0.000001);
    const maxDaily = Math.max(...daily.map(d => d.cost_usd), 0.000001);

    const profitColor = data.gross_profit_usd >= 0 ? '#10b981' : '#ef4444';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Top stat cards */}
            <div className="adm-cards">
                <div className="adm-card">
                    <div className="adm-card-label">AI Cost (actual)</div>
                    <div className="adm-card-value" style={{ fontSize: 20 }}>
                        {usdShort(data.total_ai_cost_usd)}
                    </div>
                    <div className="adm-card-sub">{lkr(data.total_ai_cost_lkr)} · last {days}d</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Subscription MRR</div>
                    <div className="adm-card-value" style={{ fontSize: 20 }}>
                        {usdShort(data.mrr_usd)}
                    </div>
                    <div className="adm-card-sub">
                        {(data.subscriber_counts?.student || 0)} student · {(data.subscriber_counts?.pro || 0)} pro (current)
                    </div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Credit Packs Sold</div>
                    <div className="adm-card-value" style={{ fontSize: 20 }}>
                        {usdShort(data.credit_revenue_usd)}
                    </div>
                    <div className="adm-card-sub">
                        {data.credit_pack_count} purchase{data.credit_pack_count !== 1 ? 's' : ''} · last {days}d
                    </div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Gross Profit</div>
                    <div className="adm-card-value" style={{ fontSize: 20, color: profitColor }}>
                        {usdShort(data.gross_profit_usd)}
                    </div>
                    <div className="adm-card-sub">
                        margin {data.margin_pct}% · {lkr(data.gross_profit_lkr)}
                    </div>
                </div>
            </div>

            {/* Note about revenue methodology */}
            <div style={{
                background: 'var(--adm-sidebar-bg)',
                border: '1px solid var(--adm-border)',
                borderRadius: 8, padding: '10px 14px',
                fontSize: 12, color: 'var(--adm-text-muted)', lineHeight: 1.6,
            }}>
                <strong style={{ color: 'var(--adm-text)' }}>How these numbers are calculated:</strong>
                {' '}AI Cost = actual API usage logged in api_cost_logs.
                {' '}MRR = current active subscribers × plan price (snapshot, not period total).
                {' '}Credit Revenue = actual completed purchases in the selected period.
                {' '}Gross Profit = (MRR + Credit Revenue) − AI Cost.
            </div>

            {/* Per-plan table */}
            <div className="adm-panel">
                <div className="adm-panel-title">Per-Plan Breakdown</div>
                <div className="adm-table-wrap" style={{ marginTop: 12 }}>
                    <table className="adm-table">
                        <thead>
                            <tr>
                                <th>Plan</th>
                                <th>Total Users</th>
                                <th>Subscribers</th>
                                <th>AI Cost (USD)</th>
                                <th>AI Cost (LKR)</th>
                                <th>Sub Revenue</th>
                                <th>Net (Sub − Cost)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {['free', 'student', 'pro'].map(tier => {
                                const p = byPlan[tier] || {};
                                const net = p.plan_profit_usd || 0;
                                return (
                                    <tr key={tier} className="adm-tr-hover">
                                        <td>
                                            <span className="adm-feat-badge"
                                                style={{
                                                    background: (PLAN_COLORS[tier] || '#6b7280') + '22',
                                                    color: PLAN_COLORS[tier] || '#6b7280',
                                                }}>
                                                {PLAN_LABELS[tier]}
                                            </span>
                                        </td>
                                        <td>{(p.user_count || 0).toLocaleString()}</td>
                                        <td>{p.subscriber_count ?? '—'}</td>
                                        <td style={{ fontFamily: 'monospace' }}>{usd(p.ai_cost_usd)}</td>
                                        <td style={{ color: 'var(--adm-text-muted)', fontSize: 12 }}>{lkr(p.ai_cost_lkr)}</td>
                                        <td style={{ fontFamily: 'monospace' }}>
                                            {tier === 'free' ? '—' : usdShort(p.subscription_mrr_usd)}
                                        </td>
                                        <td style={{ fontFamily: 'monospace', fontWeight: 600, color: net >= 0 ? '#10b981' : '#ef4444' }}>
                                            {tier === 'free' ? '—' : usdShort(net)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="adm-two-col">
                {/* Cost by feature */}
                <div className="adm-panel">
                    <div className="adm-panel-title">Cost by Feature</div>
                    {featEntries.length === 0
                        ? <div className="adm-empty">No data yet.</div>
                        : featEntries.map(([feat, cost]) => (
                            <BarRow key={feat} label={feat} value={cost} max={maxFeat}
                                color={FEATURE_COLORS[feat] || '#7c3aed'}
                                right={usd(cost)} />
                        ))
                    }
                </div>

                {/* Daily cost chart */}
                <div className="adm-panel">
                    <div className="adm-panel-title">Daily AI Cost (USD)</div>
                    {daily.length === 0
                        ? <div className="adm-empty">No data yet.</div>
                        : (
                            <div className="adm-chart">
                                {daily.slice(-30).map(d => (
                                    <div className="adm-bar-col" key={d.date}
                                        title={`${d.date}: ${usd(d.cost_usd)}`}>
                                        <div className="adm-bar-fill"
                                            style={{ height: `${Math.max(4, (d.cost_usd / maxDaily) * 64)}px` }} />
                                        <div className="adm-bar-label">
                                            {new Date(d.date + 'T00:00:00')
                                                .toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    }
                </div>
            </div>
        </div>
    );
}

// ── Tab: Per User ─────────────────────────────────────────────────────────────

function TabUsers({ days }) {
    const [data, setData]         = useState(null);
    const [page, setPage]         = useState(1);
    const [loading, setLoading]   = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const PAGE_SIZE = 50;

    const load = useCallback(() => {
        setLoading(true);
        adminApi.getCostsPerUser(days, page, PAGE_SIZE)
            .then(setData)
            .finally(() => setLoading(false));
    }, [days, page]);

    useEffect(() => { setPage(1); }, [days]);
    useEffect(() => { load(); }, [load]);

    const users      = data?.users || [];
    const total      = data?.total || 0;
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

    return (
        <div>
            <div style={{ fontSize: 12, color: 'var(--adm-text-muted)', marginBottom: 12 }}>
                {total.toLocaleString()} users with API activity in the last {days} days.
                Click a row to see the full breakdown.
            </div>
            <div className="adm-table-wrap">
                <table className="adm-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>User ID</th>
                            <th>Plan</th>
                            <th>API Calls</th>
                            <th>AI Cost (USD)</th>
                            <th>AI Cost (LKR)</th>
                            <th>Features Used</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && !users.length && (
                            <tr><td colSpan={7} className="adm-empty">Loading…</td></tr>
                        )}
                        {!loading && !users.length && (
                            <tr><td colSpan={7} className="adm-empty">No data for this period.</td></tr>
                        )}
                        {users.map((u, i) => (
                            <tr key={u.user_id} className="adm-tr-hover"
                                onClick={() => setSelectedUser(u.user_id)}
                                style={{ cursor: 'pointer' }}>
                                <td style={{ color: 'var(--adm-text-muted)', fontSize: 12 }}>
                                    {(page - 1) * PAGE_SIZE + i + 1}
                                </td>
                                <td>
                                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--adm-text)' }}>
                                        {truncId(u.user_id)}
                                    </span>
                                </td>
                                <td>
                                    <span className="adm-feat-badge"
                                        style={{
                                            background: (PLAN_COLORS[u.plan_tier] || '#6b7280') + '22',
                                            color: PLAN_COLORS[u.plan_tier] || '#6b7280',
                                        }}>
                                        {PLAN_LABELS[u.plan_tier] || u.plan_tier}
                                    </span>
                                </td>
                                <td>{(u.call_count || 0).toLocaleString()}</td>
                                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{usd(u.cost_usd)}</td>
                                <td style={{ color: 'var(--adm-text-muted)', fontSize: 12 }}>{lkr(u.cost_lkr)}</td>
                                <td style={{ fontSize: 11, color: 'var(--adm-text-muted)' }}>
                                    {(u.features || []).slice(0, 3).map(f =>
                                        f.replace(/_/g, ' ')
                                    ).join(', ')}
                                    {(u.features?.length || 0) > 3 ? ` +${u.features.length - 3}` : ''}
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

            <UserDrawer
                userId={selectedUser}
                days={days}
                onClose={() => setSelectedUser(null)}
            />
        </div>
    );
}

// ── Tab: Raw Logs ─────────────────────────────────────────────────────────────

function TabLogs({ days }) {
    const [logs, setLogs]           = useState(null);
    const [page, setPage]           = useState(1);
    const [featFilter, setFeatFilter] = useState('');
    const [allFeatures, setAllFeatures] = useState([]);
    const [loading, setLoading]     = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        adminApi.getCosts({ days, feature: featFilter, page, page_size: 50 })
            .then(setLogs)
            .finally(() => setLoading(false));
    }, [days, featFilter, page]);

    useEffect(() => {
        adminApi.getCostsSummary({ days }).then(s => {
            const feats = Object.keys(s?.by_feature || {}).sort();
            setAllFeatures(feats);
        });
    }, [days]);

    useEffect(() => { setPage(1); }, [days, featFilter]);
    useEffect(() => { load(); }, [load]);

    const logsData  = logs?.logs || [];
    const logsTotal = logs?.total || 0;
    const totalPages = Math.ceil(logsTotal / 50) || 1;

    return (
        <div>
            <div className="adm-toolbar" style={{ marginBottom: 10 }}>
                <select className="adm-select" value={featFilter}
                    onChange={e => { setFeatFilter(e.target.value); setPage(1); }}>
                    <option value="">All Features</option>
                    {allFeatures.map(f => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
                </select>
                <span style={{ fontSize: 12, color: 'var(--adm-text-muted)' }}>
                    {logsTotal.toLocaleString()} entries
                </span>
            </div>
            <div className="adm-table-wrap">
                <table className="adm-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>User</th>
                            <th>Feature</th>
                            <th>Model</th>
                            <th>In Tok</th>
                            <th>Out Tok</th>
                            <th>Audio</th>
                            <th>Cost (USD)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && !logsData.length && (
                            <tr><td colSpan={8} className="adm-empty">Loading…</td></tr>
                        )}
                        {!loading && !logsData.length && (
                            <tr><td colSpan={8} className="adm-empty">No logs for this filter.</td></tr>
                        )}
                        {logsData.map(row => (
                            <tr key={row.id} className="adm-tr-hover">
                                <td style={{ whiteSpace: 'nowrap', color: 'var(--adm-text-muted)', fontSize: 11 }}>
                                    {fmtDate(row.created_at)}
                                </td>
                                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--adm-text-muted)' }}>
                                    {truncId(row.user_id)}
                                </td>
                                <td>
                                    <span className="adm-feat-badge"
                                        style={{
                                            background: (FEATURE_COLORS[row.feature] || '#6366f1') + '18',
                                            color: FEATURE_COLORS[row.feature] || '#6366f1',
                                        }}>
                                        {row.feature}
                                    </span>
                                </td>
                                <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>{row.model}</td>
                                <td style={{ color: 'var(--adm-text-muted)' }}>{row.input_tokens || '—'}</td>
                                <td style={{ color: 'var(--adm-text-muted)' }}>{row.output_tokens || '—'}</td>
                                <td style={{ color: 'var(--adm-text-muted)' }}>
                                    {row.audio_seconds ? Number(row.audio_seconds).toFixed(1) + 's' : '—'}
                                </td>
                                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{usd(row.cost_usd)}</td>
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
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

const TABS = [
    { id: 'financial', label: 'Financial Overview' },
    { id: 'users',     label: 'Per User' },
    { id: 'logs',      label: 'Raw Logs' },
];

export default function AdminCosts() {
    const [tab,  setTab]  = useState('financial');
    const [days, setDays] = useState(30);

    return (
        <div>
            <div className="adm-page-title">Costs & Revenue</div>

            <div className="adm-toolbar">
                <div style={{ display: 'flex', gap: 4 }}>
                    {TABS.map(t => (
                        <button key={t.id}
                            className={tab === t.id ? 'adm-btn-primary' : 'adm-btn-ghost'}
                            style={{ fontSize: 13, padding: '5px 12px' }}
                            onClick={() => setTab(t.id)}>
                            {t.label}
                        </button>
                    ))}
                </div>
                <select className="adm-select" value={days} onChange={e => setDays(Number(e.target.value))}>
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={90}>Last 90 days</option>
                    <option value={365}>Last 365 days</option>
                </select>
            </div>

            {tab === 'financial' && <TabFinancial days={days} />}
            {tab === 'users'     && <TabUsers     days={days} />}
            {tab === 'logs'      && <TabLogs      days={days} />}
        </div>
    );
}
