import React, { useEffect, useState, useCallback } from 'react';
import { betaApi } from '../../lib/adminApi.js';

function StatusChip({ status }) {
    const map = {
        pending:  { label: 'Pending',  bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
        approved: { label: 'Approved', bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
        rejected: { label: 'Rejected', bg: '#f5f5f4', color: '#78716c', border: '#e7e5e4' },
    };
    const s = map[status] || map.pending;
    return (
        <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 100,
            fontSize: 11, fontWeight: 600, letterSpacing: '0.3px',
            background: s.bg, color: s.color, border: `1px solid ${s.border}`,
        }}>
            {s.label}
        </span>
    );
}

function StarRating({ rating }) {
    return (
        <span style={{ color: '#f59e0b', letterSpacing: 1 }}>
            {'★'.repeat(rating || 0)}{'☆'.repeat(5 - (rating || 0))}
        </span>
    );
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminBeta() {
    const [betaOn, setBetaOn]           = useState(false);
    const [toggling, setToggling]       = useState(false);
    const [stats, setStats]             = useState(null);
    const [applications, setApplications] = useState([]);
    const [appsLoading, setAppsLoading] = useState(true);
    const [feedback, setFeedback]       = useState([]);
    const [fbTotal, setFbTotal]         = useState(0);
    const [fbPage, setFbPage]           = useState(1);
    const [fbLoading, setFbLoading]     = useState(false);
    const [actionLoading, setActionLoading] = useState({});

    const loadAll = useCallback(() => {
        betaApi.getBetaStatus().then(r => setBetaOn(r.enabled)).catch(() => {});
        betaApi.getBetaStats().then(r => setStats(r)).catch(() => {});
        setAppsLoading(true);
        betaApi.listBetaApplications().then(r => setApplications(Array.isArray(r) ? r : [])).catch(() => {}).finally(() => setAppsLoading(false));
        loadFeedback(1);
    }, []);

    function loadFeedback(page) {
        setFbLoading(true);
        betaApi.listBetaFeedback(page, 20)
            .then(r => { setFeedback(r.items || []); setFbTotal(r.total || 0); setFbPage(page); })
            .catch(() => {})
            .finally(() => setFbLoading(false));
    }

    useEffect(() => { loadAll(); }, [loadAll]);

    async function handleToggle() {
        setToggling(true);
        try {
            await betaApi.toggleBeta(!betaOn);
            setBetaOn(b => !b);
        } catch { /* silent */ } finally {
            setToggling(false);
        }
    }

    async function handleApprove(id) {
        setActionLoading(p => ({ ...p, [id]: 'approving' }));
        try {
            const updated = await betaApi.approveApplication(id);
            setApplications(prev => prev.map(a => a.id === id ? { ...a, ...updated } : a));
            betaApi.getBetaStats().then(r => setStats(r)).catch(() => {});
        } catch { /* silent */ } finally {
            setActionLoading(p => { const next = { ...p }; delete next[id]; return next; });
        }
    }

    async function handleReject(id) {
        setActionLoading(p => ({ ...p, [id]: 'rejecting' }));
        try {
            const updated = await betaApi.rejectApplication(id);
            setApplications(prev => prev.map(a => a.id === id ? { ...a, ...updated } : a));
        } catch { /* silent */ } finally {
            setActionLoading(p => { const next = { ...p }; delete next[id]; return next; });
        }
    }

    // Sort: pending first, then approved, then rejected
    const sortedApps = [...applications].sort((a, b) => {
        const order = { pending: 0, approved: 1, rejected: 2 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });

    const avgRating = stats?.avg_rating;
    const totalPages = Math.ceil(fbTotal / 20);

    return (
        <div>
            <div className="adm-page-title">Beta Testing Program</div>

            {/* ── Section 1: Control ── */}
            <div className="adm-card" style={{ marginBottom: 20 }}>
                <div className="adm-card-title">Program Control</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, color: 'var(--adm-sec, #6b6b6b)' }}>Beta Testing</span>
                        <button
                            onClick={handleToggle}
                            disabled={toggling}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 7,
                                padding: '6px 14px', borderRadius: 8, border: 'none',
                                fontSize: 13, fontWeight: 600, cursor: toggling ? 'not-allowed' : 'pointer',
                                fontFamily: 'inherit', transition: 'opacity 0.15s',
                                background: betaOn ? '#15803d' : '#e5e7eb',
                                color: betaOn ? '#fff' : '#374151',
                                opacity: toggling ? 0.6 : 1,
                            }}
                        >
                            <span style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: betaOn ? '#86efac' : '#9ca3af',
                            }} />
                            {betaOn ? 'ON' : 'OFF'}
                        </button>
                    </div>

                    {stats && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {[
                                { label: 'Pending', val: stats.pending, color: '#92400e', bg: '#fef3c7' },
                                { label: 'Approved', val: stats.approved, color: '#15803d', bg: '#f0fdf4' },
                                { label: 'Active', val: stats.active, color: '#1d4ed8', bg: '#eff6ff' },
                                { label: 'Expired', val: stats.expired, color: '#6b7280', bg: '#f3f4f6' },
                                { label: 'Feedback', val: stats.total_feedback, color: '#6b6b6b', bg: '#f5f5f4' },
                                avgRating !== null && avgRating !== undefined
                                    ? { label: 'Avg ★', val: avgRating, color: '#92400e', bg: '#fffbeb' }
                                    : null,
                            ].filter(Boolean).map(chip => (
                                <span key={chip.label} style={{
                                    padding: '3px 10px', borderRadius: 100,
                                    fontSize: 12, fontWeight: 600,
                                    background: chip.bg, color: chip.color,
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                }}>
                                    {chip.val} {chip.label}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Section 2: Applications ── */}
            <div className="adm-card" style={{ marginBottom: 20 }}>
                <div className="adm-card-title">Applications</div>
                {appsLoading ? (
                    <div style={{ fontSize: 13, color: 'var(--adm-muted, #a3a3a3)', padding: '12px 0' }}>Loading…</div>
                ) : sortedApps.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--adm-muted, #a3a3a3)', padding: '12px 0' }}>No applications yet.</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="adm-table" style={{ width: '100%', minWidth: 640 }}>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Studies</th>
                                    <th>Applied</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedApps.map(app => (
                                    <tr key={app.id}>
                                        <td>{app.full_name || '—'}</td>
                                        <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{app.email}</td>
                                        <td>{app.subject || '—'}</td>
                                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(app.created_at)}</td>
                                        <td><StatusChip status={app.status} /></td>
                                        <td>
                                            {app.status === 'pending' && (
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button
                                                        style={{
                                                            padding: '4px 10px', borderRadius: 7, border: '1px solid #bbf7d0',
                                                            background: '#f0fdf4', color: '#15803d', fontSize: 12, fontWeight: 600,
                                                            cursor: actionLoading[app.id] ? 'not-allowed' : 'pointer',
                                                            fontFamily: 'inherit', transition: 'background 0.12s',
                                                            opacity: actionLoading[app.id] ? 0.5 : 1,
                                                        }}
                                                        disabled={!!actionLoading[app.id]}
                                                        onClick={() => handleApprove(app.id)}
                                                    >
                                                        {actionLoading[app.id] === 'approving' ? '…' : 'Approve'}
                                                    </button>
                                                    <button
                                                        className="adm-btn-danger-sm"
                                                        disabled={!!actionLoading[app.id]}
                                                        onClick={() => handleReject(app.id)}
                                                    >
                                                        {actionLoading[app.id] === 'rejecting' ? '…' : 'Reject'}
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Section 3: Feedback ── */}
            <div className="adm-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div className="adm-card-title" style={{ margin: 0 }}>Feedback</div>
                    {stats?.avg_rating != null && (
                        <span style={{ fontSize: 13, color: '#92400e' }}>
                            Avg <StarRating rating={Math.round(stats.avg_rating)} /> ({stats.avg_rating})
                        </span>
                    )}
                </div>
                {fbLoading ? (
                    <div style={{ fontSize: 13, color: 'var(--adm-muted, #a3a3a3)', padding: '12px 0' }}>Loading…</div>
                ) : feedback.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--adm-muted, #a3a3a3)', padding: '12px 0' }}>No feedback submitted yet.</div>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="adm-table" style={{ width: '100%', minWidth: 500 }}>
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Rating</th>
                                        <th>Comment</th>
                                        <th>Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {feedback.map(fb => (
                                        <tr key={fb.id}>
                                            <td style={{ fontSize: 12, fontFamily: 'monospace', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {fb.user_id}
                                            </td>
                                            <td><StarRating rating={fb.rating} /></td>
                                            <td style={{ fontSize: 12, color: 'var(--adm-sec, #6b6b6b)', maxWidth: 280 }}>
                                                {fb.comment || <span style={{ color: 'var(--adm-muted, #a3a3a3)', fontStyle: 'italic' }}>—</span>}
                                            </td>
                                            <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(fb.created_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, justifyContent: 'flex-end' }}>
                                <button
                                    className="adm-btn-ghost"
                                    style={{ padding: '5px 12px', fontSize: 12 }}
                                    disabled={fbPage <= 1 || fbLoading}
                                    onClick={() => loadFeedback(fbPage - 1)}
                                >← Prev</button>
                                <span style={{ fontSize: 12, color: '#6b6b6b' }}>{fbPage} / {totalPages}</span>
                                <button
                                    className="adm-btn-ghost"
                                    style={{ padding: '5px 12px', fontSize: 12 }}
                                    disabled={fbPage >= totalPages || fbLoading}
                                    onClick={() => loadFeedback(fbPage + 1)}
                                >Next →</button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
