import React, { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../../lib/adminApi.js';


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

function fmtUSD(v) {
    if (!v) return '$0.000000';
    return '$' + Number(v).toFixed(6);
}

function fmtSmallUSD(v) {
    if (!v) return '$0.00';
    if (v < 0.01) return '$' + Number(v).toFixed(6);
    return '$' + Number(v).toFixed(4);
}

function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function AdminCosts() {
    const [days, setDays] = useState(30);
    const [summary, setSummary] = useState(null);
    const [logs, setLogs] = useState(null);
    const [page, setPage] = useState(1);
    const [featFilter, setFeatFilter] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const loadSummary = useCallback(() => {
        adminApi.getCostsSummary({ days })
            .then(setSummary)
            .catch(e => setError(e?.response?.data?.detail || e.message || 'Failed to load cost summary'));
    }, [days]);

    const loadLogs = useCallback(() => {
        setLoading(true);
        adminApi.getCosts({ days, feature: featFilter, page, page_size: 50 })
            .then(setLogs)
            .catch(e => setError(e?.response?.data?.detail || e.message || 'Failed to load logs'))
            .finally(() => setLoading(false));
    }, [days, featFilter, page]);

    useEffect(() => { loadSummary(); }, [loadSummary]);
    useEffect(() => { setPage(1); }, [days, featFilter]);
    useEffect(() => { loadLogs(); }, [loadLogs]);

    const byFeature = summary?.by_feature || {};
    const daily = summary?.daily || [];
    const totalUSD = summary?.total_usd || 0;
    const totalLKR = summary?.total_lkr || 0;
    const maxFeatureCost = Math.max(...Object.values(byFeature), 0.000001);
    const maxDailyCost = Math.max(...daily.map(d => d.cost_usd), 0.000001);

    const featEntries = Object.entries(byFeature).sort((a, b) => b[1] - a[1]);
    const allFeatures = featEntries.map(([f]) => f);

    const logsData = logs?.logs || [];
    const logsTotal = logs?.total || 0;
    const totalPages = Math.ceil(logsTotal / 50) || 1;

    return (
        <div>
            <div className="adm-page-title">Costs</div>

            {error && <div className="adm-error">{error}</div>}

            <div className="adm-toolbar">
                <select className="adm-select" value={days} onChange={e => setDays(Number(e.target.value))}>
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={90}>Last 90 days</option>
                    <option value={365}>Last 365 days</option>
                </select>
            </div>

            {/* Top stat cards */}
            <div className="adm-cards">
                <div className="adm-card">
                    <div className="adm-card-label">Total Cost (USD)</div>
                    <div className="adm-card-value" style={{ fontSize: 22 }}>{fmtSmallUSD(totalUSD)}</div>
                    <div className="adm-card-sub">last {days} days</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Total Cost (LKR)</div>
                    <div className="adm-card-value" style={{ fontSize: 22 }}>Rs {totalLKR.toLocaleString('en', { maximumFractionDigits: 2 })}</div>
                    <div className="adm-card-sub">@ 305 LKR/USD</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">API Calls Logged</div>
                    <div className="adm-card-value">{logsTotal.toLocaleString()}</div>
                    <div className="adm-card-sub">last {days} days</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Features Tracked</div>
                    <div className="adm-card-value">{featEntries.length}</div>
                    <div className="adm-card-sub">distinct features</div>
                </div>
            </div>

            <div className="adm-two-col">
                {/* Feature breakdown */}
                <div className="adm-panel">
                    <div className="adm-panel-title">Cost by Feature</div>
                    {featEntries.length === 0 && (
                        <div className="adm-empty">No data yet — costs appear after API calls are made.</div>
                    )}
                    {featEntries.map(([feat, cost]) => (
                        <div className="adm-feat-row" key={feat}>
                            <div className="adm-feat-label" title={feat}>{feat.replace(/_/g, ' ')}</div>
                            <div className="adm-feat-track">
                                <div className="adm-feat-fill"
                                    style={{
                                        width: `${(cost / maxFeatureCost) * 100}%`,
                                        background: FEATURE_COLORS[feat] || '#7c3aed',
                                    }}
                                />
                            </div>
                            <div className="adm-feat-cost">{fmtUSD(cost)}</div>
                        </div>
                    ))}
                </div>

                {/* Daily chart */}
                <div className="adm-panel">
                    <div className="adm-panel-title">Daily Cost (USD)</div>
                    {daily.length === 0 && (
                        <div className="adm-empty">No data yet.</div>
                    )}
                    {daily.length > 0 && (
                        <div className="adm-chart">
                            {daily.slice(-30).map(d => (
                                <div className="adm-bar-col" key={d.date} title={`${d.date}: ${fmtUSD(d.cost_usd)}`}>
                                    <div className="adm-bar-fill"
                                        style={{ height: `${Math.max(4, (d.cost_usd / maxDailyCost) * 64)}px` }}
                                    />
                                    <div className="adm-bar-label">
                                        {new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Raw logs */}
            <div className="adm-section-title" style={{ marginTop: 32 }}>
                Raw Logs
            </div>
            <div className="adm-toolbar" style={{ marginBottom: 10 }}>
                <select className="adm-select" value={featFilter} onChange={e => { setFeatFilter(e.target.value); setPage(1); }}>
                    <option value="">All Features</option>
                    {allFeatures.map(f => (
                        <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>
                    ))}
                </select>
                <span style={{ fontSize: 12, color: '#a3a3a3' }}>{logsTotal.toLocaleString()} entries</span>
            </div>
            <div className="adm-table-wrap">
                <table className="adm-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Feature</th>
                            <th>Model</th>
                            <th>In Tokens</th>
                            <th>Out Tokens</th>
                            <th>Audio sec</th>
                            <th>Cost (USD)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && !logsData.length && (
                            <tr><td colSpan={7} className="adm-empty">Loading…</td></tr>
                        )}
                        {!loading && !logsData.length && (
                            <tr><td colSpan={7} className="adm-empty">No logs found. Costs appear after the first API calls are made.</td></tr>
                        )}
                        {logsData.map(row => (
                            <tr key={row.id}>
                                <td style={{ whiteSpace: 'nowrap', color: '#a3a3a3' }}>{fmtDate(row.created_at)}</td>
                                <td>
                                    <span className="adm-feat-badge"
                                        style={{ background: (FEATURE_COLORS[row.feature] || '#6366f1') + '18',
                                                 color: FEATURE_COLORS[row.feature] || '#6366f1' }}>
                                        {row.feature}
                                    </span>
                                </td>
                                <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>{row.model}</td>
                                <td style={{ color: '#9ca3af' }}>{row.input_tokens || '—'}</td>
                                <td style={{ color: '#9ca3af' }}>{row.output_tokens || '—'}</td>
                                <td style={{ color: '#9ca3af' }}>{row.audio_seconds ? Number(row.audio_seconds).toFixed(1) + 's' : '—'}</td>
                                <td style={{ fontFamily: 'monospace', color: '#374151' }}>{fmtUSD(row.cost_usd)}</td>
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
