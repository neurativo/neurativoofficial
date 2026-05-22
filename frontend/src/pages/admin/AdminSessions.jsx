import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../lib/adminApi.js';


function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(secs) {
    if (!secs) return '—';
    const m = Math.floor(secs / 60);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function timeSince(iso) {
    if (!iso) return '—';
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export default function AdminSessions() {
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        adminApi.listSessions({ page, page_size: 20 })
            .then(setData)
            .catch(e => setError(e?.response?.data?.detail || e.message || 'Failed to load sessions'))
            .finally(() => setLoading(false));
    }, [page]);

    useEffect(() => { load(); }, [load]);

    const sessions = data?.sessions || [];
    const total = data?.total || 0;
    const totalPages = Math.ceil(total / 20) || 1;
    const activeSessions = sessions.filter(s => s.is_active).length;

    return (
        <div>
            <div className="adm-page-title">Live Sessions</div>

            {error && <div className="adm-error">Error: {error}</div>}
            <div className="adm-toolbar">
                {activeSessions > 0 && (
                    <span style={{ fontSize: 13, color: '#16a34a' }}>
                        <span className="adm-pulse" />
                        {activeSessions} active right now
                    </span>
                )}
                <span className="adm-total">{total.toLocaleString()} total sessions</span>
                <button className="adm-btn-ghost" style={{ marginLeft: 'auto' }} onClick={load}>
                    ↻ Refresh
                </button>
            </div>

            <div className="adm-table-wrap">
                <table className="adm-table">
                    <thead>
                        <tr>
                            <th>Status</th>
                            <th>Lecture</th>
                            <th>User ID</th>
                            <th>Started</th>
                            <th>Last Chunk</th>
                            <th>Duration</th>
                            <th>Chunks</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && !sessions.length && (
                            <tr><td colSpan={7} className="adm-empty">Loading…</td></tr>
                        )}
                        {!loading && !sessions.length && (
                            <tr><td colSpan={7} className="adm-empty">No sessions found.</td></tr>
                        )}
                        {sessions.map(s => (
                            <tr key={s.id} className="adm-tr-hover">
                                <td>
                                    {s.is_active
                                        ? <span className="adm-badge-active"><span className="adm-pulse" />Active</span>
                                        : <span className="adm-badge-ended">Ended</span>
                                    }
                                </td>
                                <td
                                    className="adm-link-cell"
                                    onClick={() => navigate(`/admin/lectures/${s.lecture_id}`)}
                                    style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                >
                                    {s.lecture_title || 'Untitled'}
                                </td>
                                <td
                                    className="adm-link-cell"
                                    onClick={() => s.user_id && navigate(`/admin/users/${s.user_id}`)}
                                    style={{ fontFamily: 'monospace', fontSize: 11, color: s.user_id ? '#6366f1' : 'var(--adm-text-muted)' }}
                                >
                                    {s.user_id ? s.user_id.slice(0, 16) + '…' : '—'}
                                </td>
                                <td style={{ fontSize: 12 }}>{fmtDate(s.created_at)}</td>
                                <td style={{ fontSize: 12, color: s.is_active ? '#16a34a' : 'var(--adm-text-muted)' }}>
                                    {timeSince(s.last_chunk_at)}
                                </td>
                                <td style={{ fontSize: 12 }}>{fmtDuration(s.total_duration_seconds)}</td>
                                <td style={{ fontSize: 12 }}>{s.total_chunks || '—'}</td>
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
