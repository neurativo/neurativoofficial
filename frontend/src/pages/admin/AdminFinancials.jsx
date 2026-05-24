import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../lib/adminApi.js';

// ── date helpers ──────────────────────────────────────────────────────────────
function toMonthStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function prevMonth(s) {
    const [y, m] = s.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
function nextMonth(s) {
    const [y, m] = s.split('-').map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
function monthLabel(s) {
    const [y, m] = s.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
function shortMon(s) {
    const [y, m] = s.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('default', { month: 'short' });
}
function fmt(n) { return `$${(+(n || 0)).toFixed(2)}`; }
function fmtPct(n) { return `${(+(n || 0)).toFixed(1)}%`; }

const CURRENT_MONTH = toMonthStr(new Date());

const CATEGORY_ICONS = {
    railway:  '🚂',
    supabase: '⚡',
    clerk:    '🔐',
    resend:   '✉️',
    other:    '📦',
};
const CATEGORY_LABELS = {
    railway:  'Railway',
    supabase: 'Supabase',
    clerk:    'Clerk',
    resend:   'Resend',
    other:    'Other',
};
const DEFAULT_ROWS = [
    { category: 'railway',  label: 'Railway',  amount_usd: 0, note: '' },
    { category: 'supabase', label: 'Supabase', amount_usd: 0, note: '' },
    { category: 'clerk',    label: 'Clerk',    amount_usd: 0, note: '' },
    { category: 'resend',   label: 'Resend',   amount_usd: 0, note: '' },
];

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, isProfit, isMargin }) {
    const isNeg  = isProfit && parseFloat(value.replace(/[^0-9.-]/g, '')) < 0;
    const pct    = isMargin ? parseFloat(value) : null;
    const pill   = isMargin
        ? pct >= 30 ? '#dcfce7' : pct >= 10 ? '#fef9c3' : '#fee2e2'
        : null;
    const pillText = isMargin
        ? pct >= 30 ? '#166534' : pct >= 10 ? '#854d0e' : '#991b1b'
        : null;

    return (
        <div className="adm-card" style={{ margin: 0, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                {label}
            </div>
            {isMargin ? (
                <div style={{
                    display: 'inline-block', padding: '4px 12px', borderRadius: 999,
                    background: pill, color: pillText, fontSize: 22, fontWeight: 700,
                }}>
                    {value}
                </div>
            ) : (
                <div style={{
                    fontSize: 26, fontWeight: 700,
                    color: isProfit ? (isNeg ? '#dc2626' : '#16a34a') : '#111827',
                }}>
                    {isProfit && !isNeg && <span style={{ marginRight: 4 }}>✓</span>}
                    {isProfit && isNeg  && <span style={{ marginRight: 4 }}>⚠</span>}
                    {value}
                </div>
            )}
            {sub && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{sub}</div>}
        </div>
    );
}

// ── Income statement ──────────────────────────────────────────────────────────
function IncomeStatement({ data, infraOpen, setInfraOpen, navigate }) {
    if (!data) return null;
    const { revenue, costs, net_profit_usd, margin_pct } = data;
    const isNeg = net_profit_usd < 0;

    const row = (label, value, sub, extra) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '7px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div>
                <span style={{ fontSize: 14, color: '#374151' }}>{label}</span>
                {sub  && <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>{sub}</span>}
                {extra}
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>{value}</span>
        </div>
    );

    const subtotalRow = (label, value) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0', borderTop: '2px solid #e5e7eb', marginTop: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{label}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>{value}</span>
        </div>
    );

    const sectionHeader = (label) => (
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280',
            textTransform: 'uppercase', letterSpacing: '0.08em', padding: '14px 0 4px', marginTop: 4 }}>
            {label}
        </div>
    );

    const subBadge = (counts) => (
        <span style={{ fontSize: 11, color: '#6b7280' }}>
            {counts.student > 0 && `${counts.student} student`}
            {counts.student > 0 && counts.pro > 0 && ' · '}
            {counts.pro > 0 && `${counts.pro} pro`}
        </span>
    );

    const tooltip = (text) => (
        <span title={text} style={{ cursor: 'help', marginLeft: 4, color: '#9ca3af', fontSize: 12 }}>ⓘ</span>
    );

    const infraItems = costs.infrastructure_by_category || {};
    const nonZeroInfra = Object.entries(infraItems).filter(([, v]) => v > 0);

    return (
        <div className="adm-card" style={{ margin: '0 0 20px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px', color: '#111827' }}>Income Statement</h3>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>{monthLabel(data.month)}</div>

            {sectionHeader('Revenue')}
            {row(
                'Subscriptions', fmt(revenue.subscriptions_usd),
                null,
                revenue.subscriber_counts && (
                    <span style={{ marginLeft: 8 }}>{subBadge(revenue.subscriber_counts)}</span>
                )
            )}
            {row('Credit Packs', fmt(revenue.credit_packs_usd),
                revenue.credit_pack_count > 0 ? `${revenue.credit_pack_count} purchase${revenue.credit_pack_count !== 1 ? 's' : ''}` : null
            )}
            {subtotalRow('Total Revenue', fmt(revenue.total_usd))}

            {sectionHeader('Costs')}
            {row(
                'AI API Costs', fmt(costs.ai_api_usd), null,
                <span
                    onClick={() => navigate('/admin/costs')}
                    style={{ marginLeft: 8, fontSize: 12, color: '#6366f1', cursor: 'pointer', textDecoration: 'underline' }}
                >
                    → view details
                </span>
            )}
            {row(
                'Payment Processing (Dodo)', fmt(costs.dodo_fees_usd), null,
                tooltip('Auto-calculated: 3.5% + $0.35 per transaction (Dodo standard rate)')
            )}

            {/* Infrastructure — collapsible */}
            <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '7px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                onClick={() => setInfraOpen(o => !o)}
            >
                <div>
                    <span style={{ fontSize: 14, color: '#374151' }}>Infrastructure</span>
                    <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>
                        {nonZeroInfra.length > 0
                            ? nonZeroInfra.map(([k]) => CATEGORY_LABELS[k] || k).join(' · ')
                            : 'none entered'}
                    </span>
                    <span style={{ marginLeft: 6, fontSize: 12, color: '#9ca3af' }}>{infraOpen ? '▲' : '▼'}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>
                    {fmt(costs.infrastructure_usd)}
                </span>
            </div>
            {infraOpen && (
                <div style={{ paddingLeft: 16, background: '#f9fafb', borderRadius: 4, margin: '2px 0 4px' }}>
                    {Object.entries(infraItems).map(([cat, amt]) => (
                        <div key={cat} style={{ display: 'flex', justifyContent: 'space-between',
                            padding: '5px 0', fontSize: 13, color: '#6b7280' }}>
                            <span>{CATEGORY_ICONS[cat] || '📦'} {CATEGORY_LABELS[cat] || cat}</span>
                            <span style={{ fontFamily: 'monospace' }}>{fmt(amt)}</span>
                        </div>
                    ))}
                </div>
            )}

            {subtotalRow('Total Costs', fmt(costs.total_usd))}

            {/* Net profit */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 0 4px', marginTop: 8, borderTop: '3px solid #111827' }}>
                <div>
                    <span style={{ fontSize: 18, fontWeight: 800, color: isNeg ? '#dc2626' : '#16a34a' }}>
                        Net {isNeg ? 'Loss' : 'Profit'}
                    </span>
                    <span style={{ marginLeft: 12, fontSize: 13, color: '#6b7280' }}>
                        Margin: {fmtPct(margin_pct)}
                    </span>
                </div>
                <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace',
                    color: isNeg ? '#dc2626' : '#16a34a' }}>
                    {fmt(net_profit_usd)}
                </span>
            </div>
        </div>
    );
}

// ── Trend chart (pure CSS bars) ───────────────────────────────────────────────
function TrendChart({ trend }) {
    if (!trend || !trend.length) return null;
    const maxVal = Math.max(...trend.map(m => Math.max(m.revenue_usd, m.costs_usd, 0.01)));

    return (
        <div className="adm-card" style={{ margin: 0, padding: '18px 20px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px' }}>12-Month Trend</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100, overflowX: 'auto' }}>
                {trend.map(m => {
                    const revH  = Math.max(2, Math.round((m.revenue_usd  / maxVal) * 90));
                    const cosH  = Math.max(2, Math.round((m.costs_usd    / maxVal) * 90));
                    const profH = Math.max(2, Math.round((Math.abs(m.net_profit_usd) / maxVal) * 90));
                    const isNeg = m.net_profit_usd < 0;
                    return (
                        <div key={m.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto', minWidth: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90 }}>
                                <div title={`Revenue: ${fmt(m.revenue_usd)}`} style={{ width: 7, height: revH, background: '#14b8a6', borderRadius: '2px 2px 0 0' }} />
                                <div title={`Costs: ${fmt(m.costs_usd)}`}    style={{ width: 7, height: cosH, background: '#f87171', borderRadius: '2px 2px 0 0' }} />
                                <div title={`${isNeg ? 'Loss' : 'Profit'}: ${fmt(m.net_profit_usd)}`}
                                    style={{ width: 7, height: profH, background: isNeg ? '#f87171' : '#4ade80', borderRadius: '2px 2px 0 0', opacity: 0.7 }} />
                            </div>
                            <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 3 }}>{shortMon(m.month)}</div>
                        </div>
                    );
                })}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                {[['#14b8a6', 'Revenue'], ['#f87171', 'Costs'], ['#4ade80', 'Profit']].map(([c, l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280' }}>
                        <div style={{ width: 10, height: 10, background: c, borderRadius: 2 }} />{l}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Cost donut (pure CSS conic-gradient) ──────────────────────────────────────
function CostDonut({ costs }) {
    if (!costs) return null;
    const ai    = costs.ai_api_usd     || 0;
    const dodo  = costs.dodo_fees_usd  || 0;
    const infra = costs.infrastructure_usd || 0;
    const total = ai + dodo + infra || 1;

    const aiPct    = (ai    / total) * 100;
    const dodoPct  = (dodo  / total) * 100;
    const infraPct = (infra / total) * 100;

    const gradient = `conic-gradient(
        #6366f1 0% ${aiPct}%,
        #a855f7 ${aiPct}% ${aiPct + dodoPct}%,
        #f97316 ${aiPct + dodoPct}% 100%
    )`;

    return (
        <div className="adm-card" style={{ margin: 0, padding: '18px 20px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px' }}>Cost Breakdown</h3>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <div style={{
                    width: 100, height: 100, borderRadius: '50%',
                    background: gradient,
                    boxShadow: 'inset 0 0 0 28px white',
                }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                    { color: '#6366f1', label: 'AI API',        usd: ai,    pct: aiPct },
                    { color: '#a855f7', label: 'Dodo Fees',     usd: dodo,  pct: dodoPct },
                    { color: '#f97316', label: 'Infrastructure', usd: infra, pct: infraPct },
                ].map(({ color, label, usd, pct }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
                            <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
                            {label}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>
                            {fmt(usd)} <span style={{ color: '#9ca3af' }}>({pct.toFixed(0)}%)</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Manage Costs Panel ────────────────────────────────────────────────────────
function ManageCostsPanel({ month, onClose, onSaved }) {
    const [panelMonth, setPanelMonth] = useState(month);
    const [rows, setRows]   = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const load = useCallback(async (m) => {
        try {
            const res = await adminApi.getExternalCosts(m);
            const existing = res.items || [];
            const merged = DEFAULT_ROWS.map(def => {
                const found = existing.find(e => e.category === def.category);
                return found
                    ? { ...found, _dirty: false }
                    : { ...def, id: null, period: m, _dirty: false };
            });
            const customs = existing.filter(e => !DEFAULT_ROWS.find(d => d.category === e.category));
            setRows([...merged, ...customs.map(c => ({ ...c, _dirty: false, _custom: true }))]);
        } catch {
            setRows(DEFAULT_ROWS.map(d => ({ ...d, id: null, period: m, _dirty: false })));
        }
    }, []);

    useEffect(() => { load(panelMonth); }, [panelMonth, load]);

    const changeMonth = (dir) => {
        const newM = dir === 'prev' ? prevMonth(panelMonth) : nextMonth(panelMonth);
        if (dir === 'next' && newM > CURRENT_MONTH) return;
        setPanelMonth(newM);
    };

    const updateRow = (idx, field, val) => {
        setRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: val, _dirty: true } : r));
    };

    const addCustom = () => {
        setRows(rows => [...rows, { id: null, category: 'other', label: '', amount_usd: 0, note: '', period: panelMonth, _dirty: true, _custom: true }]);
    };

    const removeRow = async (idx) => {
        const row = rows[idx];
        if (row.id) {
            try { await adminApi.deleteExternalCost(row.id); } catch { /* ignore */ }
        }
        setRows(rows => rows.filter((_, i) => i !== idx));
    };

    const save = async () => {
        setSaving(true);
        setError('');
        try {
            for (const row of rows) {
                if (!row._dirty) continue;
                const payload = {
                    category:   row.category,
                    label:      row.label || CATEGORY_LABELS[row.category] || 'Other',
                    amount_usd: parseFloat(row.amount_usd) || 0,
                    period:     panelMonth,
                    note:       row.note || null,
                };
                if (row.id) {
                    await adminApi.updateExternalCost(row.id, payload);
                } else if (payload.amount_usd > 0) {
                    await adminApi.createExternalCost(payload);
                }
            }
            onSaved(panelMonth);
        } catch (e) {
            setError(e.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const panelStyle = isMobile
        ? { position: 'fixed', bottom: 0, left: 0, right: 0, maxHeight: '80vh', overflowY: 'auto',
            background: 'white', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px', zIndex: 200,
            boxShadow: '0 -4px 24px rgba(0,0,0,0.15)' }
        : { position: 'fixed', top: 0, right: 0, width: 400, height: '100vh', overflowY: 'auto',
            background: 'white', padding: '24px 20px', zIndex: 200,
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' };

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 199 }} />
            <div style={panelStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Manage Costs</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20,
                    background: '#f9fafb', borderRadius: 8, padding: '8px 12px' }}>
                    <button onClick={() => changeMonth('prev')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>←</button>
                    <span style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{monthLabel(panelMonth)}</span>
                    <button onClick={() => changeMonth('next')}
                        disabled={nextMonth(panelMonth) > CURRENT_MONTH}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
                            opacity: nextMonth(panelMonth) > CURRENT_MONTH ? 0.3 : 1 }}>→</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {rows.map((row, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>
                                {CATEGORY_ICONS[row.category] || '📦'}
                            </span>
                            {row._custom ? (
                                <input
                                    value={row.label}
                                    onChange={e => updateRow(idx, 'label', e.target.value)}
                                    placeholder="Custom cost name"
                                    className="adm-input"
                                    style={{ flex: 1, fontSize: 13 }}
                                />
                            ) : (
                                <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{row.label}</span>
                            )}
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#6b7280' }}>$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={row.amount_usd}
                                    onChange={e => updateRow(idx, 'amount_usd', e.target.value)}
                                    style={{ width: 80, paddingLeft: 20, paddingRight: 6, paddingTop: 6, paddingBottom: 6,
                                        border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}
                                />
                            </div>
                            {row._custom && (
                                <button onClick={() => removeRow(idx)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16 }}>×</button>
                            )}
                        </div>
                    ))}
                </div>

                <button onClick={addCustom} style={{ marginTop: 14, background: 'none', border: '1px dashed #d1d5db',
                    borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#6b7280',
                    width: '100%', textAlign: 'center' }}>
                    + Add custom cost
                </button>

                {error && <div className="adm-error" style={{ marginTop: 12 }}>{error}</div>}

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button onClick={onClose} className="adm-btn-ghost" style={{ flex: 1 }}>Cancel</button>
                    <button onClick={save} disabled={saving} className="adm-btn" style={{ flex: 2 }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminFinancials() {
    const navigate = useNavigate();
    const [month, setMonth]         = useState(CURRENT_MONTH);
    const [summary, setSummary]     = useState(null);
    const [trend, setTrend]         = useState([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState('');
    const [infraOpen, setInfraOpen] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false);

    const load = useCallback(async (m) => {
        setLoading(true);
        setError('');
        try {
            const [sum, tr] = await Promise.all([
                adminApi.getFinancialSummary(m),
                adminApi.getFinancialTrend(12),
            ]);
            setSummary(sum);
            setTrend(tr.months || []);
        } catch (e) {
            setError(e.message || 'Failed to load financial data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(month); }, [month, load]);

    const changeMonth = (dir) => {
        const newM = dir === 'prev' ? prevMonth(month) : nextMonth(month);
        if (dir === 'next' && newM > CURRENT_MONTH) return;
        setMonth(newM);
    };

    const handlePanelSaved = () => {
        setPanelOpen(false);
        load(month);
    };

    const rev   = summary?.revenue  || {};
    const costs = summary?.costs    || {};
    const np    = summary?.net_profit_usd ?? 0;
    const mp    = summary?.margin_pct ?? 0;

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 80px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Financials</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f9fafb',
                        border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 12px' }}>
                        <button onClick={() => changeMonth('prev')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>←</button>
                        <span style={{ fontSize: 14, fontWeight: 600, minWidth: 120, textAlign: 'center' }}>{monthLabel(month)}</span>
                        <button onClick={() => changeMonth('next')}
                            disabled={nextMonth(month) > CURRENT_MONTH}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
                                opacity: nextMonth(month) > CURRENT_MONTH ? 0.3 : 1 }}>→</button>
                    </div>
                    <button onClick={() => setPanelOpen(true)} className="adm-btn" style={{ fontSize: 13, padding: '8px 16px' }}>
                        Manage Costs
                    </button>
                </div>
            </div>

            {error && (
                <div className="adm-error" style={{ marginBottom: 16 }}>
                    {error} <button className="adm-btn-ghost" style={{ marginLeft: 8, fontSize: 12 }} onClick={() => load(month)}>Retry</button>
                </div>
            )}

            {loading ? (
                <div style={{ color: '#9ca3af', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
            ) : (
                <>
                    {/* KPI cards — 2x2 on mobile, 4-column on desktop */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 12,
                        marginBottom: 20,
                    }}
                    className="fin-kpi-grid"
                    >
                        <KpiCard label="Total Revenue" value={fmt(rev.total_usd)}
                            sub={`${(rev.subscriber_counts?.student || 0) + (rev.subscriber_counts?.pro || 0)} subscribers`} />
                        <KpiCard label="Total Costs"   value={fmt(costs.total_usd)}
                            sub="AI + Dodo + Infrastructure" />
                        <KpiCard label="Net Profit" value={fmt(np)} isProfit />
                        <KpiCard label="Margin" value={fmtPct(mp)} isMargin />
                    </div>

                    {/* Income statement */}
                    <IncomeStatement
                        data={summary}
                        infraOpen={infraOpen}
                        setInfraOpen={setInfraOpen}
                        navigate={navigate}
                    />

                    {/* Charts row — 1 col on mobile, 2 col on desktop */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr',
                        gap: 16,
                    }}
                    className="fin-charts-grid"
                    >
                        <TrendChart trend={trend} />
                        <CostDonut costs={costs} />
                    </div>
                </>
            )}

            {/* Manage Costs panel */}
            {panelOpen && (
                <ManageCostsPanel
                    month={month}
                    onClose={() => setPanelOpen(false)}
                    onSaved={handlePanelSaved}
                />
            )}

            <style>{`
                @media (min-width: 641px) {
                    .fin-kpi-grid    { grid-template-columns: repeat(4, 1fr) !important; }
                    .fin-charts-grid { grid-template-columns: 1fr 1fr !important; }
                }
            `}</style>
        </div>
    );
}
