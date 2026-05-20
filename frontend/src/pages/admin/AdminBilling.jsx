import React, { useEffect, useState, useCallback } from 'react';
import { billingApi } from '../../lib/adminApi.js';

function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusBadge({ status }) {
    const map = {
        active:    { bg: '#14532d', color: '#4ade80' },
        renewed:   { bg: '#14532d', color: '#4ade80' },
        cancelled: { bg: '#450a0a', color: '#f87171' },
        expired:   { bg: '#450a0a', color: '#f87171' },
        on_hold:   { bg: '#422006', color: '#fbbf24' },
        failed:    { bg: '#450a0a', color: '#f87171' },
        none:      { bg: '#1c1c1c', color: '#6b7280' },
    };
    const s = (status || 'none').toLowerCase();
    const style = map[s] || map.none;
    return (
        <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            background: style.bg,
            color: style.color,
            textTransform: 'uppercase',
        }}>
            {s}
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
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            background: style.bg,
            color: style.color,
            textTransform: 'capitalize',
        }}>
            {p}
        </span>
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

    const PAGE_SIZE = 20;

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        billingApi.listSubscriptions(page, PAGE_SIZE, statusFilter || null)
            .then(data => {
                setSubs(data.items || data.data || data.subscriptions || []);
                setTotal(data.total_count ?? data.total ?? 0);
            })
            .catch(e => setError(e?.response?.data?.detail || e.message || 'Failed to load subscriptions'))
            .finally(() => setLoading(false));
    }, [page, statusFilter]);

    useEffect(() => { setPage(0); }, [statusFilter]);
    useEffect(() => { load(); }, [load]);

    const activeCount = subs.filter(s => ['active', 'renewed'].includes((s.status || '').toLowerCase())).length;

    return (
        <div className="adm-card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Subscriptions</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                        {total > 0 ? `${total} total` : ''}{activeCount > 0 ? ` · ${activeCount} active` : ''}
                    </span>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="adm-select"
                        style={{ fontSize: 12, padding: '4px 8px' }}
                    >
                        <option value="">All statuses</option>
                        <option value="active">Active</option>
                        <option value="renewed">Renewed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="expired">Expired</option>
                        <option value="on_hold">On Hold</option>
                        <option value="failed">Failed</option>
                    </select>
                    <button className="adm-btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={load} disabled={loading}>
                        {loading ? '…' : 'Refresh'}
                    </button>
                </div>
            </div>

            {error && <div className="adm-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table className="adm-table" style={{ minWidth: 600 }}>
                    <thead>
                        <tr>
                            <th>Customer</th>
                            <th>Plan</th>
                            <th>Status</th>
                            <th>Next Billing</th>
                            <th>Created</th>
                            <th>Subscription ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && subs.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#6b7280', padding: '24px 0' }}>Loading…</td></tr>
                        ) : subs.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#6b7280', padding: '24px 0' }}>No subscriptions found</td></tr>
                        ) : subs.map(sub => {
                            const customer = sub.customer || {};
                            const meta = sub.metadata || {};
                            const plan = meta.plan || null;
                            return (
                                <tr key={sub.subscription_id || sub.id}>
                                    <td>
                                        <div style={{ fontSize: 13 }}>{customer.name || customer.email || '—'}</div>
                                        {customer.email && customer.name && (
                                            <div style={{ fontSize: 11, color: '#6b7280' }}>{customer.email}</div>
                                        )}
                                    </td>
                                    <td>{plan ? <PlanBadge plan={plan} /> : <span style={{ color: '#6b7280' }}>—</span>}</td>
                                    <td><StatusBadge status={sub.status} /></td>
                                    <td style={{ fontSize: 12, color: '#9ca3af' }}>{fmtDate(sub.next_billing_date)}</td>
                                    <td style={{ fontSize: 12, color: '#9ca3af' }}>{fmtDate(sub.created_at)}</td>
                                    <td style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {sub.subscription_id || sub.id || '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {total > PAGE_SIZE && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                    <button className="adm-btn-ghost" disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)} style={{ fontSize: 12, padding: '4px 10px' }}>← Prev</button>
                    <span style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
                    <button className="adm-btn-ghost" disabled={(page + 1) * PAGE_SIZE >= total || loading} onClick={() => setPage(p => p + 1)} style={{ fontSize: 12, padding: '4px 10px' }}>Next →</button>
                </div>
            )}
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

    function flash(msg) {
        setSuccess(msg);
        setTimeout(() => setSuccess(''), 3500);
    }

    async function handleCreate(e) {
        e.preventDefault();
        if (!form.amount) { setError('Amount is required'); return; }
        setCreating(true);
        setError('');
        try {
            const body = {
                discount_type: form.discount_type,
                amount: Number(form.amount),
            };
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
                    <button className="adm-btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={load} disabled={loading}>
                        {loading ? '…' : 'Refresh'}
                    </button>
                    <button
                        className="adm-btn"
                        style={{ fontSize: 12, padding: '4px 12px' }}
                        onClick={() => { setShowForm(v => !v); setError(''); }}
                    >
                        {showForm ? 'Cancel' : '+ New Discount'}
                    </button>
                </div>
            </div>

            {error && <div className="adm-error" style={{ marginBottom: 12 }}>{error}</div>}
            {success && <div className="adm-success" style={{ marginBottom: 12 }}>{success}</div>}

            {showForm && (
                <form onSubmit={handleCreate} style={{
                    background: '#111',
                    border: '1px solid #2a2a2a',
                    borderRadius: 8,
                    padding: '16px',
                    marginBottom: 20,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: 12,
                }}>
                    <div style={{ gridColumn: '1 / -1', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Create Discount</div>

                    <div>
                        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Type *</label>
                        <select
                            className="adm-select"
                            value={form.discount_type}
                            onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}
                            style={{ width: '100%', fontSize: 13 }}
                        >
                            <option value="percentage">Percentage (%)</option>
                            <option value="flat">Flat (cents)</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                            Amount * {form.discount_type === 'percentage' ? '(0–100)' : '(cents, e.g. 500 = $5)'}
                        </label>
                        <input
                            className="adm-input"
                            type="number"
                            min={1}
                            max={form.discount_type === 'percentage' ? 100 : undefined}
                            value={form.amount}
                            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                            placeholder={form.discount_type === 'percentage' ? '20' : '500'}
                            style={{ width: '100%', fontSize: 13 }}
                            required
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Code (optional)</label>
                        <input
                            className="adm-input"
                            type="text"
                            value={form.code}
                            onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                            placeholder="LAUNCH20"
                            style={{ width: '100%', fontSize: 13, textTransform: 'uppercase' }}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Name (optional)</label>
                        <input
                            className="adm-input"
                            type="text"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="Launch discount"
                            style={{ width: '100%', fontSize: 13 }}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Expires at (optional)</label>
                        <input
                            className="adm-input"
                            type="datetime-local"
                            value={form.expires_at}
                            onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                            style={{ width: '100%', fontSize: 13 }}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Usage limit (optional)</label>
                        <input
                            className="adm-input"
                            type="number"
                            min={1}
                            value={form.usage_limit}
                            onChange={e => setForm(f => ({ ...f, usage_limit: e.target.value }))}
                            placeholder="100"
                            style={{ width: '100%', fontSize: 13 }}
                        />
                    </div>

                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                        <button type="button" className="adm-btn-ghost" onClick={() => { setShowForm(false); setForm(INITIAL_FORM); setError(''); }} style={{ fontSize: 13 }}>
                            Cancel
                        </button>
                        <button type="submit" className="adm-btn" disabled={creating} style={{ fontSize: 13, minWidth: 100 }}>
                            {creating ? 'Creating…' : 'Create'}
                        </button>
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
                            return (
                                <tr key={d.discount_id || d.id}>
                                    <td style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em' }}>
                                        {d.code || <span style={{ color: '#6b7280', fontFamily: 'inherit', fontWeight: 400 }}>auto</span>}
                                    </td>
                                    <td style={{ fontSize: 12, textTransform: 'capitalize', color: '#9ca3af' }}>{d.type || '—'}</td>
                                    <td style={{ fontSize: 13, fontWeight: 600, color: '#4ade80' }}>{amtLabel}</td>
                                    <td style={{ fontSize: 12, color: '#9ca3af' }}>{usageLabel}</td>
                                    <td style={{ fontSize: 12, color: isExpired ? '#f87171' : '#9ca3af' }}>{fmtDate(d.expires_at)}</td>
                                    <td>
                                        <StatusBadge status={isExpired ? 'expired' : (d.status || 'active')} />
                                    </td>
                                    <td>
                                        <button
                                            className="adm-btn-ghost"
                                            style={{ fontSize: 11, padding: '3px 8px', color: '#f87171' }}
                                            onClick={() => handleDelete(d.discount_id || d.id, d.code)}
                                            disabled={deleting === (d.discount_id || d.id)}
                                        >
                                            {deleting === (d.discount_id || d.id) ? '…' : 'Delete'}
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

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function AdminBilling() {
    return (
        <div>
            <div style={{ marginBottom: 24 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>Billing</h2>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
                    Dodo Payments — subscription management and discount codes
                </p>
            </div>
            <SubscriptionsPanel />
            <DiscountsPanel />
        </div>
    );
}
