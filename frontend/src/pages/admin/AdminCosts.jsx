import React, { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../../lib/adminApi.js';

const CSS = `
.adm-page-title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 24px; }
.adm-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
.adm-select { padding: 8px 12px; background: #141414; border: 1px solid #2a2a2a; border-radius: 7px; color: #e8e8e8; font-size: 13px; outline: none; cursor: pointer; }
.adm-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; margin-bottom: 28px; }
.adm-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 18px 20px; }
.adm-card-label { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.adm-card-value { font-size: 28px; font-weight: 700; color: #fff; }
.adm-card-sub { font-size: 12px; color: #555; margin-top: 4px; }
.adm-section-title { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; margin-top: 28px; }
.adm-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.adm-panel { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 20px; }
.adm-panel-title { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px; }

/* Feature breakdown bars */
.adm-feat-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.adm-feat-label { width: 160px; font-size: 12px; color: #888; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adm-feat-track { flex: 1; height: 7px; background: #1e1e1e; border-radius: 99px; overflow: hidden; }
.adm-feat-fill { height: 100%; border-radius: 99px; background: #7c3aed; transition: width 0.4s ease; }
.adm-feat-cost { width: 80px; text-align: right; font-size: 12px; color: #888; font-family: monospace; flex-shrink: 0; }

/* Daily chart */
.adm-chart { display: flex; align-items: flex-end; gap: 4px; height: 80px; margin-top: 8px; }
.adm-bar-col { display: flex; flex-direction: column; align-items: center; flex: 1; gap: 4px; }
.adm-bar-fill { width: 100%; border-radius: 4px 4px 0 0; background: #7c3aed; min-height: 2px; transition: height 0.3s ease; }
.adm-bar-label { font-size: 9px; color: #444; transform: rotate(-35deg); white-space: nowrap; margin-top: 4px; }

/* Logs table */
.adm-table-wrap { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; overflow: hidden; margin-top: 8px; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.adm-table th { text-align: left; padding: 10px 14px; font-size: 10px; font-weight: 600; color: #555; border-bottom: 1px solid #1e1e1e; background: #0f0f0f; text-transform: uppercase; letter-spacing: 0.06em; }
.adm-table td { padding: 9px 14px; border-bottom: 1px solid #0d0d0d; color: #888; vertical-align: middle; }
.adm-table tr:last-child td { border-bottom: none; }
.adm-feat-badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #1e1e1e; color: #888; font-family: monospace; }
.adm-pagination { display: flex; align-items: center; gap: 10px; margin-top: 14px; font-size: 12px; color: #555; }
.adm-pag-btn { padding: 5px 11px; background: #141414; border: 1px solid #2a2a2a; border-radius: 6px; color: #888; cursor: pointer; font-size: 11px; }
.adm-pag-btn:hover:not(:disabled) { border-color: #555; color: #e8e8e8; }
.adm-pag-btn:disabled { opacity: 0.3; cursor: default; }
.adm-empty { text-align: center; padding: 28px; color: #444; font-size: 13px; }
.adm-error { color: #ef4444; font-size: 12px; padding: 10px 14px; background: #7f1d1d22; border-radius: 7px; border: 1px solid #7f1d1d44; margin-bottom: 14px; }
@media (max-width: 900px) { .adm-two-col { grid-template-columns: 1fr; } }
`;

const FEATURE_COLORS = {
    whisper_transcription: '#3b82f6',
    whisper_import:        '#60a5fa',
    micro_summary:         '#7c3aed',
    section_summary:       '#8b5cf6',
    master_summary:        '#a78bfa',
    qa_answer:             '#0369a1',
    qa_expansion:          '#0284c7',
    smart_explain:         '#0891b2',
    vision_screen:         '#d97706',
    vision_board:          '#f59e0b',
    topic_detection:       '#10b981',
    cif_classification:    '#34d399',
    pdf_executive_summary: '#f43f5e',
    pdf_enrich_section:    '#fb7185',
    pdf_glossary:          '#fda4af',
    pdf_takeaways:         '#fb923c',
    pdf_quick_review:      '#f97316',
    pdf_study_roadmap:     '#ef4444',
    pdf_conceptual_map:    '#dc2626',
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
            <style>{CSS}</style>
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
                <span style={{ fontSize: 12, color: '#555' }}>{logsTotal.toLocaleString()} entries</span>
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
                                <td style={{ whiteSpace: 'nowrap', color: '#555' }}>{fmtDate(row.created_at)}</td>
                                <td>
                                    <span className="adm-feat-badge"
                                        style={{ background: (FEATURE_COLORS[row.feature] || '#7c3aed') + '22',
                                                 color: FEATURE_COLORS[row.feature] || '#a78bfa' }}>
                                        {row.feature}
                                    </span>
                                </td>
                                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{row.model}</td>
                                <td style={{ color: '#666' }}>{row.input_tokens || '—'}</td>
                                <td style={{ color: '#666' }}>{row.output_tokens || '—'}</td>
                                <td style={{ color: '#666' }}>{row.audio_seconds ? Number(row.audio_seconds).toFixed(1) + 's' : '—'}</td>
                                <td style={{ fontFamily: 'monospace', color: '#c8c8c8' }}>{fmtUSD(row.cost_usd)}</td>
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
