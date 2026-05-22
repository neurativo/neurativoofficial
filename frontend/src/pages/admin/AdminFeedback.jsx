import React, { useEffect, useState, useCallback } from 'react';
import { feedbackApi } from '../../lib/adminApi.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function Stars({ rating }) {
    if (!rating) return <span style={{ color: '#9ca3af', fontSize: 11 }}>—</span>;
    return (
        <span style={{ fontSize: 13, letterSpacing: -1 }}>
            {[1,2,3,4,5].map(i => (
                <span key={i} style={{ color: i <= rating ? '#f59e0b' : '#d1d5db' }}>★</span>
            ))}
        </span>
    );
}

const TYPE_META = {
    bug:     { label: 'Bug',     color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
    feature: { label: 'Feature', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
    general: { label: 'General', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
};

const STATUS_META = {
    new:  { label: 'New',  color: '#2563eb', bg: 'rgba(37,99,235,0.08)' },
    read: { label: 'Read', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
    done: { label: 'Done', color: '#10b981', bg: 'rgba(16,185,129,0.09)' },
};

function TypeBadge({ type }) {
    const m = TYPE_META[type] || TYPE_META.general;
    return (
        <span style={{
            display: 'inline-block', padding: '2px 9px', borderRadius: 99,
            fontSize: 11, fontWeight: 600,
            color: m.color, background: m.bg,
        }}>
            {m.label}
        </span>
    );
}

function StatusSelect({ value, onChange, loading }) {
    const m = STATUS_META[value] || STATUS_META.new;
    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={loading}
            style={{
                padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                border: `1.5px solid ${m.color}`,
                color: m.color, background: m.bg,
                cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
                opacity: loading ? 0.5 : 1,
            }}
        >
            <option value="new">New</option>
            <option value="read">Read</option>
            <option value="done">Done</option>
        </select>
    );
}

// ── Expandable message row ─────────────────────────────────────────────────────

function FeedbackRow({ item, onStatusChange }) {
    const [expanded, setExpanded]   = useState(false);
    const [updating, setUpdating]   = useState(false);

    async function handleStatus(newStatus) {
        setUpdating(true);
        try {
            await feedbackApi.updateStatus(item.id, newStatus);
            onStatusChange(item.id, newStatus);
        } catch { /* silent */ }
        setUpdating(false);
    }

    const shortMsg = item.message.length > 90
        ? item.message.slice(0, 90) + '…'
        : item.message;

    return (
        <>
            <tr
                style={{ cursor: 'pointer', transition: 'background 0.12s' }}
                onClick={() => setExpanded(e => !e)}
                className="adm-tr-hover"
            >
                <td style={{ padding: '11px 12px', whiteSpace: 'nowrap', fontSize: 12, color: '#6b7280' }}>
                    {fmtDate(item.created_at)}
                </td>
                <td style={{ padding: '11px 12px' }}>
                    <TypeBadge type={item.type} />
                </td>
                <td style={{ padding: '11px 12px' }}>
                    <Stars rating={item.rating} />
                </td>
                <td style={{ padding: '11px 12px', fontSize: 13, color: 'var(--adm-text)', maxWidth: 340 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {shortMsg}
                    </span>
                </td>
                <td style={{ padding: '11px 12px', fontSize: 11, color: '#9ca3af', maxWidth: 140 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.page_path || '—'}
                    </span>
                </td>
                <td style={{ padding: '11px 12px' }} onClick={e => e.stopPropagation()}>
                    <StatusSelect value={item.status} onChange={handleStatus} loading={updating} />
                </td>
            </tr>
            {expanded && (
                <tr>
                    <td colSpan={6} style={{ padding: '0 12px 14px 12px', background: 'var(--adm-bg)' }}>
                        <div style={{
                            background: 'var(--adm-card)',
                            border: '1px solid var(--adm-border)',
                            borderRadius: 12,
                            padding: '14px 16px',
                            fontSize: 13,
                            color: 'var(--adm-text)',
                            lineHeight: 1.7,
                            marginTop: 4,
                        }}>
                            <div style={{ marginBottom: 10, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: '#9ca3af' }}>
                                <span>User: <span style={{ fontFamily: 'monospace', color: '#6b7280' }}>{item.user_id.slice(0,18)}…</span></span>
                                {item.lecture_id && (
                                    <span>Lecture: <span style={{ fontFamily: 'monospace', color: '#6b7280' }}>{item.lecture_id.slice(0,8)}…</span></span>
                                )}
                                {item.rating && <span>Rating: <Stars rating={item.rating} /></span>}
                            </div>
                            {item.message}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminFeedback() {
    const [items, setItems]           = useState([]);
    const [unread, setUnread]         = useState(0);
    const [loading, setLoading]       = useState(true);
    const [filterType, setFilterType] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [error, setError]           = useState('');

    const load = useCallback(() => {
        setLoading(true);
        const params = {};
        if (filterType)   params.type   = filterType;
        if (filterStatus) params.status = filterStatus;
        feedbackApi.list(params)
            .then(r => {
                setItems(r.feedback || []);
                setUnread(r.unread_count ?? 0);
                setError('');
            })
            .catch(e => setError(e?.response?.data?.detail || 'Failed to load'))
            .finally(() => setLoading(false));
    }, [filterType, filterStatus]);

    useEffect(() => { load(); }, [load]);

    function handleStatusChange(id, newStatus) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
        if (newStatus !== 'new') setUnread(c => Math.max(0, c - 1));
    }

    // Stats
    const avgRating = (() => {
        const rated = items.filter(i => i.rating);
        if (!rated.length) return null;
        return (rated.reduce((s, i) => s + i.rating, 0) / rated.length).toFixed(1);
    })();
    const typeCounts = items.reduce((a, i) => ({ ...a, [i.type]: (a[i.type] || 0) + 1 }), {});

    return (
        <div>
            <div className="adm-page-title">
                User Feedback
                {unread > 0 && (
                    <span style={{
                        marginLeft: 10, padding: '2px 9px', borderRadius: 99,
                        background: '#2563eb', color: '#fff',
                        fontSize: 12, fontWeight: 700, verticalAlign: 'middle',
                    }}>
                        {unread} new
                    </span>
                )}
            </div>

            {error && <div className="adm-error">{error}</div>}

            {/* Summary cards */}
            <div className="adm-cards" style={{ marginBottom: 20 }}>
                <div className="adm-card">
                    <div className="adm-card-label">Total</div>
                    <div className="adm-card-value">{items.length}</div>
                    <div className="adm-card-sub">submissions</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Unread</div>
                    <div className="adm-card-value" style={{ color: unread > 0 ? '#2563eb' : undefined }}>{unread}</div>
                    <div className="adm-card-sub">needs review</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Avg Rating</div>
                    <div className="adm-card-value">{avgRating ?? '—'}</div>
                    <div className="adm-card-sub">out of 5 stars</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Bug Reports</div>
                    <div className="adm-card-value" style={{ color: typeCounts.bug > 0 ? '#ef4444' : undefined }}>{typeCounts.bug || 0}</div>
                    <div className="adm-card-sub">need fixing</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Feature Requests</div>
                    <div className="adm-card-value" style={{ color: '#6366f1' }}>{typeCounts.feature || 0}</div>
                    <div className="adm-card-sub">ideas submitted</div>
                </div>
            </div>

            {/* Filters */}
            <div className="adm-card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginRight: 4 }}>Filter:</div>
                    <select
                        className="adm-select"
                        style={{ minWidth: 130, fontSize: 12, padding: '5px 10px' }}
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                    >
                        <option value="">All types</option>
                        <option value="bug">Bug</option>
                        <option value="feature">Feature</option>
                        <option value="general">General</option>
                    </select>
                    <select
                        className="adm-select"
                        style={{ minWidth: 130, fontSize: 12, padding: '5px 10px' }}
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                    >
                        <option value="">All statuses</option>
                        <option value="new">New</option>
                        <option value="read">Read</option>
                        <option value="done">Done</option>
                    </select>
                    <button
                        className="adm-btn-ghost"
                        style={{ marginLeft: 'auto', fontSize: 12, padding: '5px 12px' }}
                        onClick={load}
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="adm-card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
                        Loading…
                    </div>
                ) : items.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
                        No feedback yet
                        {(filterType || filterStatus) && ' matching these filters'}
                        .
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="adm-table" style={{ minWidth: 700 }}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Rating</th>
                                    <th>Message</th>
                                    <th>Page</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(item => (
                                    <FeedbackRow
                                        key={item.id}
                                        item={item}
                                        onStatusChange={handleStatusChange}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af', textAlign: 'right' }}>
                Click any row to expand full message
            </div>
        </div>
    );
}
