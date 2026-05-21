import React, { useEffect, useState, useCallback } from 'react';
import { billingApi } from '../../lib/adminApi.js';

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtAmount(cents) {
    if (cents == null) return '—';
    return `$${(cents / 100).toFixed(2)}`;
}

function StatusBadge({ status }) {
    const map = {
        active:      { bg: '#14532d', color: '#4ade80' },
        renewed:     { bg: '#14532d', color: '#4ade80' },
        succeeded:   { bg: '#14532d', color: '#4ade80' },
        paid:        { bg: '#14532d', color: '#4ade80' },
        approved:    { bg: '#14532d', color: '#4ade80' },
        won:         { bg: '#14532d', color: '#4ade80' },
        cancelled:   { bg: '#450a0a', color: '#f87171' },
        expired:     { bg: '#450a0a', color: '#f87171' },
        failed:      { bg: '#450a0a', color: '#f87171' },
        lost:        { bg: '#450a0a', color: '#f87171' },
        on_hold:     { bg: '#422006', color: '#fbbf24' },
        pending:     { bg: '#422006', color: '#fbbf24' },
        disputed:    { bg: '#422006', color: '#fbbf24' },
        under_review:{ bg: '#422006', color: '#fbbf24' },
        refunded:    { bg: '#1e1b4b', color: '#a5b4fc' },
        partial:     { bg: '#1e1b4b', color: '#a5b4fc' },
        none:        { bg: '#1c1c1c', color: '#6b7280' },
    };
    const s = (status || 'none').toLowerCase().replace(/\s+/g, '_');
    const style = map[s] || map.none;
    return (
        <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 4,
            fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
            background: style.bg, color: style.color, textTransform: 'uppercase',
        }}>
            {s.replace(/_/g, ' ')}
        </span>
    );
}

function PlanBadge({ plan }) {
    const map = {
        pro:     { bg: '#3730a3', color: '#a5b4fc' },
        student: { bg: '#164e63', color: '#67e8f9' },
        free:    { bg: '#1c1c1c', color: '#6b7280' },
    };
    const p = (plan || 'free').toLowerCase();
    const style = map[p] || map.free;
    return (
        <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 4,
            fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
            background: style.bg, color: style.color, textTransform: 'capitalize',
        }}>
            {p}
        </span>
    );
}

function MonoId({ id }) {
    if (!id) return <span style={{ color: '#6b7280' }}>—</span>;
    return (
        <span
            title={id}
            style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b7280', maxWidth: 140, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }}
        >
            {id}
        </span>
    );
}

function Pagination({ page, total, pageSize, onPage, loading }) {
    if (total <= pageSize) return null;
    const pages = Math.ceil(total / pageSize);
    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <button className="adm-btn-ghost" disabled={page === 0 || loading} onClick={() => onPage(page - 1)} style={{ fontSize: 12, padding: '4px 10px' }}>← Prev</button>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Page {page + 1} of {pages}</span>
            <button className="adm-btn-ghost" disabled={(page + 1) * pageSize >= total || loading} onClick={() => onPage(page + 1)} style={{ fontSize: 12, padding: '4px 10px' }}>Next →</button>
        </div>
    );
}

// ─── Stats Panel ─────────────────────────────────────────────────────────────
function StatsPanel() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        billingApi.getStats().then(setStats).catch(() => {}).finally(() => setLoading(false));
    }, []);

    const tiles = [
        { label: 'Active Subscribers', value: loading ? '…' : stats?.active_subscribers ?? 0, color: '#4ade80' },
        { label: 'Student',            value: loading ? '…' : stats?.by_plan?.student ?? 0,   color: '#67e8f9' },
        { label: 'Pro',                value: loading ? '…' : stats?.by_plan?.pro ?? 0,        color: '#a5b4fc' },
        { label: 'Est. MRR',           value: loading ? '…' : `$${(stats?.mrr_usd ?? 0).toFixed(2)}`, color: '#fbbf24' },
    ];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            {tiles.map(t => (
                <div key={t.label} className="adm-card" style={{ margin: 0, padding: '16px 18px' }}>
                    <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{t.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: t.color }}>{t.value}</div>
                </div>
            ))}
        </div>
    );
}

// ─── Subscriptions Panel ──────────────────────────────────────────────────────
function SubscriptionsPanel() {
    const [subs, setSubs] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [statusFilter, setStatusFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [cancelling, setCancelling] = useState(null);
    const [success, setSuccess] = useState('');
    const PAGE_SIZE = 20;

    function flash(msg) { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); }

    async function handleCancel(subId, email) {
        if (!window.confirm(`Cancel subscription for ${email || subId}?`)) return;
        setCancelling(subId);
        setError('');
        try {
            await billingApi.adminCancelSubscription(subId);
            flash('Subscription cancelled');
            load();
        } catch (e) {
            setError(e?.response?.data?.detail || e.message || 'Failed to cancel');
        } finally {
            setCancelling(null);
        }
    }

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        billingApi.listSubscriptions(page, PAGE_SIZE, statusFilter || null)
            .then(data => {
                setSubs(data.items || data.data || data.subscriptions || []);
                setTotal(data.total_count ?? data.total ?? 0);
            })
            .catch(e => setError(e?.response?.data?.detail || e.message || 'Failed to load'))
            .finally(() => setLoading(false));
    }, [page, statusFilter]);

    useEffect(() => { setPage(0); }, [statusFilter]);
    useEffect(() => { load(); }, [load]);

    return (
        <div className="adm-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Subscriptions</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {total > 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>{total} total</span>}
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="adm-select" style={{ fontSize: 12, padding: '4px 8px' }}>
                        <option value="">All statuses</option>
                        <option value="active">Active</option>
                        <option value="renewed">Renewed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="expired">Expired</option>
                        <option value="on_hold">On Hold</option>
                        <option value="failed">Failed</option>
                    </select>
                    <button className="adm-btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={load} disabled={loading}>{loading ? '…' : 'Refresh'}</button>
                </div>
            </div>

            {error && <div className="adm-error" style={{ marginBottom: 12 }}>{error}</div>}
            {success && <div className="adm-success" style={{ marginBottom: 12 }}>{success}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table className="adm-table" style={{ minWidth: 660 }}>
                    <thead>
                        <tr>
                            <th>Customer</th>
                            <th>Plan</th>
                            <th>Status</th>
                            <th>Next Billing</th>
                            <th>Created</th>
                            <th>Subscription ID</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && subs.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: '24px 0' }}>Loading…</td></tr>
                        ) : subs.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: '24px 0' }}>No subscriptions found</td></tr>
                        ) : subs.map(sub => {
                            const customer = sub.customer || {};
                            const plan = (sub.metadata || {}).plan || null;
                            const subId = sub.subscription_id || sub.id || '';
                            const isActive = ['active', 'renewed', 'on_hold'].includes((sub.status || '').toLowerCase());
                            return (
                                <tr key={subId}>
                                    <td>
                                        <div style={{ fontSize: 13 }}>{customer.name || customer.email || '—'}</div>
                                        {customer.email && customer.name && <div style={{ fontSize: 11, color: '#6b7280' }}>{customer.email}</div>}
                                    </td>
                                    <td>{plan ? <PlanBadge plan={plan} /> : <span style={{ color: '#6b7280' }}>—</span>}</td>
                                    <td><StatusBadge status={sub.status} /></td>
                                    <td style={{ fontSize: 12, color: '#9ca3af' }}>{fmtDate(sub.next_billing_date)}</td>
                                    <td style={{ fontSize: 12, color: '#9ca3af' }}>{fmtDate(sub.created_at)}</td>
                                    <td><MonoId id={subId} /></td>
                                    <td>
                                        {isActive && (
                                            <button className="adm-btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: '#f87171' }}
                                                onClick={() => handleCancel(subId, customer.email)} disabled={cancelling === subId}>
                                                {cancelling === subId ? '…' : 'Cancel'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} loading={loading} />
        </div>
    );
}

// ─── Payments Panel ───────────────────────────────────────────────────────────
function PaymentsPanel() {
    const [payments, setPayments] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [statusFilter, setStatusFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [refunding, setRefunding] = useState(null);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const PAGE_SIZE = 20;

    function flash(msg) { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); }

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        billingApi.listPayments(page, PAGE_SIZE, statusFilter || null)
            .then(data => {
                setPayments(data.items || data.data || data.payments || []);
                setTotal(data.total_count ?? data.total ?? 0);
            })
            .catch(e => setError(e?.response?.data?.detail || e.message || 'Failed to load payments'))
            .finally(() => setLoading(false));
    }, [page, statusFilter]);

    useEffect(() => { setPage(0); }, [statusFilter]);
    useEffect(() => { load(); }, [load]);

    async function handleRefund(paymentId, amount) {
        const reason = window.prompt(`Refund payment ${paymentId.slice(-8)}?\nAmount: ${fmtAmount(amount)}\n\nOptional reason:`);
        if (reason === null) return; // cancelled
        setRefunding(paymentId);
        setError('');
        try {
            await billingApi.createRefund(paymentId, reason || null);
            flash(`Refund initiated for payment …${paymentId.slice(-8)}`);
            load();
        } catch (e) {
            setError(e?.response?.data?.detail || e.message || 'Refund failed');
        } finally {
            setRefunding(null);
        }
    }

    async function handleViewDetail(paymentId) {
        if (detail?.payment_id === paymentId || detail?.id === paymentId) {
            setDetail(null);
            return;
        }
        setDetailLoading(paymentId);
        try {
            const d = await billingApi.getPayment(paymentId);
            setDetail(d);
        } catch (e) {
            setError('Could not load payment detail');
        } finally {
            setDetailLoading(null);
        }
    }

    return (
        <div className="adm-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Payments</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {total > 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>{total} total</span>}
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="adm-select" style={{ fontSize: 12, padding: '4px 8px' }}>
                        <option value="">All statuses</option>
                        <option value="succeeded">Succeeded</option>
                        <option value="pending">Pending</option>
                        <option value="failed">Failed</option>
                        <option value="refunded">Refunded</option>
                        <option value="disputed">Disputed</option>
                    </select>
                    <button className="adm-btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={load} disabled={loading}>{loading ? '…' : 'Refresh'}</button>
                </div>
            </div>

            {error && <div className="adm-error" style={{ marginBottom: 12 }}>{error}</div>}
            {success && <div className="adm-success" style={{ marginBottom: 12 }}>{success}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table className="adm-table" style={{ minWidth: 700 }}>
                    <thead>
                        <tr>
                            <th>Payment ID</th>
                            <th>Customer</th>
                            <th>Amount</th>
                            <th>Currency</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && payments.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: '24px 0' }}>Loading…</td></tr>
                        ) : payments.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: '24px 0' }}>No payments found</td></tr>
                        ) : payments.map(p => {
                            const pid = p.payment_id || p.id || '';
                            const customer = p.customer || {};
                            const isRefundable = ['succeeded', 'paid'].includes((p.status || '').toLowerCase());
                            const isDetailOpen = (detail?.payment_id === pid || detail?.id === pid);
                            return (
                                <React.Fragment key={pid}>
                                    <tr>
                                        <td><MonoId id={pid} /></td>
                                        <td>
                                            <div style={{ fontSize: 13 }}>{customer.name || customer.email || '—'}</div>
                                            {customer.email && customer.name && <div style={{ fontSize: 11, color: '#6b7280' }}>{customer.email}</div>}
                                        </td>
                                        <td style={{ fontSize: 13, fontWeight: 600, color: '#4ade80' }}>{fmtAmount(p.total_amount ?? p.amount)}</td>
                                        <td style={{ fontSize: 12, color: '#9ca3af' }}>{(p.currency || '').toUpperCase() || '—'}</td>
                                        <td><StatusBadge status={p.status} /></td>
                                        <td style={{ fontSize: 12, color: '#9ca3af' }}>{fmtDateTime(p.created_at)}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="adm-btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                                                    onClick={() => handleViewDetail(pid)} disabled={detailLoading === pid}>
                                                    {detailLoading === pid ? '…' : isDetailOpen ? 'Hide' : 'Detail'}
                                                </button>
                                                {isRefundable && (
                                                    <button className="adm-btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: '#fbbf24' }}
                                                        onClick={() => handleRefund(pid, p.total_amount ?? p.amount)} disabled={refunding === pid}>
                                                        {refunding === pid ? '…' : 'Refund'}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {isDetailOpen && (
                                        <tr>
                                            <td colSpan={7} style={{ padding: '0 0 8px' }}>
                                                <div style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 8, padding: 16, margin: '0 4px' }}>
                                                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: '#9ca3af' }}>Payment Detail</div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                                                        {Object.entries(detail).map(([k, v]) => (
                                                            <div key={k}>
                                                                <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{k.replace(/_/g, ' ')}</div>
                                                                <div style={{ fontSize: 12, color: '#e5e7eb', wordBreak: 'break-all' }}>
                                                                    {v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} loading={loading} />
        </div>
    );
}

// ─── Refunds Panel ────────────────────────────────────────────────────────────
function RefundsPanel() {
    const [refunds, setRefunds] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [statusFilter, setStatusFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const PAGE_SIZE = 20;

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        billingApi.listRefunds(page, PAGE_SIZE, statusFilter || null)
            .then(data => {
                setRefunds(data.items || data.data || data.refunds || []);
                setTotal(data.total_count ?? data.total ?? 0);
            })
            .catch(e => setError(e?.response?.data?.detail || e.message || 'Failed to load refunds'))
            .finally(() => setLoading(false));
    }, [page, statusFilter]);

    useEffect(() => { setPage(0); }, [statusFilter]);
    useEffect(() => { load(); }, [load]);

    return (
        <div className="adm-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Refunds</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {total > 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>{total} total</span>}
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="adm-select" style={{ fontSize: 12, padding: '4px 8px' }}>
                        <option value="">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="succeeded">Succeeded</option>
                        <option value="failed">Failed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <button className="adm-btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={load} disabled={loading}>{loading ? '…' : 'Refresh'}</button>
                </div>
            </div>

            {error && <div className="adm-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table className="adm-table" style={{ minWidth: 640 }}>
                    <thead>
                        <tr>
                            <th>Refund ID</th>
                            <th>Payment ID</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Reason</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && refunds.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#6b7280', padding: '24px 0' }}>Loading…</td></tr>
                        ) : refunds.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#6b7280', padding: '24px 0' }}>No refunds found</td></tr>
                        ) : refunds.map(r => {
                            const rid = r.refund_id || r.id || '';
                            return (
                                <tr key={rid}>
                                    <td><MonoId id={rid} /></td>
                                    <td><MonoId id={r.payment_id} /></td>
                                    <td style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24' }}>{fmtAmount(r.amount)}</td>
                                    <td><StatusBadge status={r.status} /></td>
                                    <td style={{ fontSize: 12, color: '#9ca3af', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {r.reason || '—'}
                                    </td>
                                    <td style={{ fontSize: 12, color: '#9ca3af' }}>{fmtDateTime(r.created_at)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} loading={loading} />
        </div>
    );
}

// ─── Disputes Panel ───────────────────────────────────────────────────────────
function DisputesPanel() {
    const [disputes, setDisputes] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [statusFilter, setStatusFilter] = useState('');
    const [stageFilter, setStageFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const PAGE_SIZE = 20;

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        billingApi.listDisputes(page, PAGE_SIZE, statusFilter || null, stageFilter || null)
            .then(data => {
                setDisputes(data.items || data.data || data.disputes || []);
                setTotal(data.total_count ?? data.total ?? 0);
            })
            .catch(e => setError(e?.response?.data?.detail || e.message || 'Failed to load disputes'))
            .finally(() => setLoading(false));
    }, [page, statusFilter, stageFilter]);

    useEffect(() => { setPage(0); }, [statusFilter, stageFilter]);
    useEffect(() => { load(); }, [load]);

    return (
        <div className="adm-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Disputes</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {total > 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>{total} total</span>}
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="adm-select" style={{ fontSize: 12, padding: '4px 8px' }}>
                        <option value="">All statuses</option>
                        <option value="dispute_opened">Opened</option>
                        <option value="dispute_under_review">Under Review</option>
                        <option value="dispute_won">Won</option>
                        <option value="dispute_lost">Lost</option>
                        <option value="dispute_expired">Expired</option>
                        <option value="dispute_accepted">Accepted</option>
                    </select>
                    <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="adm-select" style={{ fontSize: 12, padding: '4px 8px' }}>
                        <option value="">All stages</option>
                        <option value="pre_dispute">Pre-Dispute</option>
                        <option value="dispute">Dispute</option>
                        <option value="pre_arbitration">Pre-Arbitration</option>
                    </select>
                    <button className="adm-btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={load} disabled={loading}>{loading ? '…' : 'Refresh'}</button>
                </div>
            </div>

            {error && <div className="adm-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table className="adm-table" style={{ minWidth: 680 }}>
                    <thead>
                        <tr>
                            <th>Dispute ID</th>
                            <th>Payment ID</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Stage</th>
                            <th>Reason</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && disputes.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: '24px 0' }}>Loading…</td></tr>
                        ) : disputes.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: '24px 0' }}>No disputes found</td></tr>
                        ) : disputes.map(d => {
                            const did = d.dispute_id || d.id || '';
                            return (
                                <tr key={did}>
                                    <td><MonoId id={did} /></td>
                                    <td><MonoId id={d.payment_id} /></td>
                                    <td style={{ fontSize: 13, fontWeight: 600, color: '#f87171' }}>{fmtAmount(d.amount)}</td>
                                    <td><StatusBadge status={d.dispute_status || d.status} /></td>
                                    <td style={{ fontSize: 12, color: '#9ca3af', textTransform: 'capitalize' }}>
                                        {(d.dispute_stage || '—').replace(/_/g, ' ')}
                                    </td>
                                    <td style={{ fontSize: 12, color: '#9ca3af', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {d.reason || d.dispute_reason || '—'}
                                    </td>
                                    <td style={{ fontSize: 12, color: '#9ca3af' }}>{fmtDateTime(d.created_at)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} loading={loading} />
        </div>
    );
}

// ─── Discounts Panel ──────────────────────────────────────────────────────────
const INITIAL_FORM = {
    discount_type: 'percentage',
    amount: '',
    code: '',
    name: '',
    expires_at: '',
    usage_limit: '',
};

function DiscountsPanel() {
    const [discounts, setDiscounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(INITIAL_FORM);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        billingApi.listDiscounts()
            .then(data => setDiscounts(data.items || data.data || data.discounts || []))
            .catch(e => setError(e?.response?.data?.detail || e.message || 'Failed to load discounts'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    function flash(msg) { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); }

    async function handleCreate(e) {
        e.preventDefault();
        if (!form.amount) { setError('Amount is required'); return; }
        setCreating(true);
        setError('');
        try {
            const body = { discount_type: form.discount_type, amount: Number(form.amount) };
            if (form.code.trim()) body.code = form.code.trim().toUpperCase();
            if (form.name.trim()) body.name = form.name.trim();
            if (form.expires_at) body.expires_at = new Date(form.expires_at).toISOString();
            if (form.usage_limit) body.usage_limit = Number(form.usage_limit);
            await billingApi.createDiscount(body);
            flash('Discount code created');
            setForm(INITIAL_FORM);
            setShowForm(false);
            load();
        } catch (e) {
            setError(e?.response?.data?.detail || e.message || 'Failed to create discount');
        } finally {
            setCreating(false);
        }
    }

    async function handleDelete(id, code) {
        if (!window.confirm(`Delete discount${code ? ` "${code}"` : ''}?`)) return;
        setDeleting(id);
        setError('');
        try {
            await billingApi.deleteDiscount(id);
            flash('Discount deleted');
            load();
        } catch (e) {
            setError(e?.response?.data?.detail || e.message || 'Failed to delete discount');
        } finally {
            setDeleting(null);
        }
    }

    return (
        <div className="adm-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Discount Codes</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="adm-btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={load} disabled={loading}>{loading ? '…' : 'Refresh'}</button>
                    <button className="adm-btn" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => { setShowForm(v => !v); setError(''); }}>
                        {showForm ? 'Cancel' : '+ New Discount'}
                    </button>
                </div>
            </div>

            {error && <div className="adm-error" style={{ marginBottom: 12 }}>{error}</div>}
            {success && <div className="adm-success" style={{ marginBottom: 12 }}>{success}</div>}

            {showForm && (
                <form onSubmit={handleCreate} style={{
                    background: '#111', border: '1px solid #2a2a2a', borderRadius: 8, padding: 16, marginBottom: 20,
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12,
                }}>
                    <div style={{ gridColumn: '1 / -1', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Create Discount</div>

                    <div>
                        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Type *</label>
                        <select className="adm-select" value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))} style={{ width: '100%', fontSize: 13 }}>
                            <option value="percentage">Percentage (%)</option>
                            <option value="flat">Flat (cents)</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                            Amount * {form.discount_type === 'percentage' ? '(0–100)' : '(cents, e.g. 500 = $5)'}
                        </label>
                        <input className="adm-input" type="number" min={1} max={form.discount_type === 'percentage' ? 100 : undefined}
                            value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                            placeholder={form.discount_type === 'percentage' ? '20' : '500'} style={{ width: '100%', fontSize: 13 }} required />
                    </div>

                    <div>
                        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Code (optional)</label>
                        <input className="adm-input" type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                            placeholder="LAUNCH20" style={{ width: '100%', fontSize: 13, textTransform: 'uppercase' }} />
                    </div>

                    <div>
                        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Name (optional)</label>
                        <input className="adm-input" type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="Launch discount" style={{ width: '100%', fontSize: 13 }} />
                    </div>

                    <div>
                        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Expires at (optional)</label>
                        <input className="adm-input" type="datetime-local" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                            style={{ width: '100%', fontSize: 13 }} />
                    </div>

                    <div>
                        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Usage limit (optional)</label>
                        <input className="adm-input" type="number" min={1} value={form.usage_limit} onChange={e => setForm(f => ({ ...f, usage_limit: e.target.value }))}
                            placeholder="100" style={{ width: '100%', fontSize: 13 }} />
                    </div>

                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                        <button type="button" className="adm-btn-ghost" onClick={() => { setShowForm(false); setForm(INITIAL_FORM); setError(''); }} style={{ fontSize: 13 }}>Cancel</button>
                        <button type="submit" className="adm-btn" disabled={creating} style={{ fontSize: 13, minWidth: 100 }}>{creating ? 'Creating…' : 'Create'}</button>
                    </div>
                </form>
            )}

            <div style={{ overflowX: 'auto' }}>
                <table className="adm-table" style={{ minWidth: 540 }}>
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Uses</th>
                            <th>Expires</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && discounts.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: '24px 0' }}>Loading…</td></tr>
                        ) : discounts.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: '24px 0' }}>No discount codes</td></tr>
                        ) : discounts.map(d => {
                            const usageLabel = d.usage_count != null
                                ? (d.usage_limit ? `${d.usage_count} / ${d.usage_limit}` : String(d.usage_count))
                                : '—';
                            const amtLabel = d.type === 'percentage' ? `${d.amount}%` : `$${(d.amount / 100).toFixed(2)}`;
                            const isExpired = d.expires_at && new Date(d.expires_at) < new Date();
                            const did = d.discount_id || d.id;
                            return (
                                <tr key={did}>
                                    <td style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em' }}>
                                        {d.code || <span style={{ color: '#6b7280', fontFamily: 'inherit', fontWeight: 400 }}>auto</span>}
                                    </td>
                                    <td style={{ fontSize: 12, textTransform: 'capitalize', color: '#9ca3af' }}>{d.type || '—'}</td>
                                    <td style={{ fontSize: 13, fontWeight: 600, color: '#4ade80' }}>{amtLabel}</td>
                                    <td style={{ fontSize: 12, color: '#9ca3af' }}>{usageLabel}</td>
                                    <td style={{ fontSize: 12, color: isExpired ? '#f87171' : '#9ca3af' }}>{fmtDate(d.expires_at)}</td>
                                    <td><StatusBadge status={isExpired ? 'expired' : (d.status || 'active')} /></td>
                                    <td>
                                        <button className="adm-btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: '#f87171' }}
                                            onClick={() => handleDelete(did, d.code)} disabled={deleting === did}>
                                            {deleting === did ? '…' : 'Delete'}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Tab styles ────────────────────────────────────────────────────────────────
const TABS = [
    { id: 'overview',       label: 'Overview' },
    { id: 'subscriptions',  label: 'Subscriptions' },
    { id: 'payments',       label: 'Payments' },
    { id: 'refunds',        label: 'Refunds' },
    { id: 'disputes',       label: 'Disputes' },
    { id: 'discounts',      label: 'Discounts' },
];

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function AdminBilling() {
    const [activeTab, setActiveTab] = useState('overview');

    return (
        <div>
            <div style={{ marginBottom: 20 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>Billing</h2>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
                    Dodo Payments — subscriptions, payments, refunds, disputes, and discounts
                </p>
            </div>

            {/* Tab nav */}
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #2a2a2a', marginBottom: 24, overflowX: 'auto' }}>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id)}
                        style={{
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === t.id ? '2px solid #6366f1' : '2px solid transparent',
                            color: activeTab === t.id ? '#e5e7eb' : '#6b7280',
                            cursor: 'pointer',
                            padding: '8px 16px',
                            fontSize: 13,
                            fontWeight: activeTab === t.id ? 600 : 400,
                            whiteSpace: 'nowrap',
                            marginBottom: -1,
                            transition: 'color 0.15s',
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {activeTab === 'overview' && (
                <>
                    <StatsPanel />
                    <div style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>
                        Use the tabs above to browse subscriptions, payments, refunds, disputes, and discount codes.
                    </div>
                </>
            )}
            {activeTab === 'subscriptions' && <SubscriptionsPanel />}
            {activeTab === 'payments'      && <PaymentsPanel />}
            {activeTab === 'refunds'       && <RefundsPanel />}
            {activeTab === 'disputes'      && <DisputesPanel />}
            {activeTab === 'discounts'     && <DiscountsPanel />}
        </div>
    );
}
