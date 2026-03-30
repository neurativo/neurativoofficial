import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../lib/adminApi.js';

const CSS = `
.adm-page-title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 24px; }
.adm-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 18px; flex-wrap: wrap; }
.adm-total { color: #888; font-size: 12px; }
.adm-table-wrap { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.adm-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #555; border-bottom: 1px solid #1e1e1e; background: #0f0f0f; text-transform: uppercase; letter-spacing: 0.06em; }
.adm-table td { padding: 11px 16px; border-bottom: 1px solid #111; color: #c8c8c8; vertical-align: middle; }
.adm-table tr:last-child td { border-bottom: none; }
.adm-table tr:hover td { background: #ffffff04; }
.adm-badge-active { display: inline-block; padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; background: #065f4622; color: #34d399; border: 1px solid #065f4644; }
.adm-badge-ended { display: inline-block; padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; background: #1e1e1e; color: #555; }
.adm-link-cell { cursor: pointer; color: #a78bfa; }
.adm-link-cell:hover { text-decoration: underline; }
.adm-pagination { display: flex; align-items: center; gap: 10px; margin-top: 16px; font-size: 13px; color: #555; }
.adm-pag-btn { padding: 6px 12px; background: #141414; border: 1px solid #2a2a2a; border-radius: 6px; color: #888; cursor: pointer; font-size: 12px; }
.adm-pag-btn:hover:not(:disabled) { border-color: #555; color: #e8e8e8; }
.adm-pag-btn:disabled { opacity: 0.3; cursor: default; }
.adm-empty { text-align: center; padding: 32px; color: #444; }
.adm-pulse { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #34d399; margin-right: 6px; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
`;

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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

    const load = useCallback(() => {
        setLoading(true);
        adminApi.listSessions({ page, page_size: 20 })
            .then(setData)
            .finally(() => setLoading(false));
    }, [page]);

    useEffect(() => { load(); }, [load]);

    const sessions = data?.sessions || [];
    const total = data?.total || 0;
    const totalPages = Math.ceil(total / 20) || 1;
    const activeSessions = sessions.filter(s => s.is_active).length;

    return (
        <div>
            <style>{CSS}</style>
            <div className="adm-page-title">Live Sessions</div>

            <div className="adm-toolbar">
                {activeSessions > 0 && (
                    <span style={{ fontSize: 13, color: '#34d399' }}>
                        <span className="adm-pulse" />
                        {activeSessions} active right now
                    </span>
                )}
                <span className="adm-total">{total.toLocaleString()} total sessions</span>
                <button
                    style={{ marginLeft: 'auto', padding: '6px 12px', background: '#141414', border: '1px solid #2a2a2a', borderRadius: 6, color: '#888', cursor: 'pointer', fontSize: 12 }}
                    onClick={load}
                >
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
                            <th>Session ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && !sessions.length && (
                            <tr><td colSpan={6} className="adm-empty">Loading…</td></tr>
                        )}
                        {!loading && !sessions.length && (
                            <tr><td colSpan={6} className="adm-empty">No sessions found.</td></tr>
                        )}
                        {sessions.map(s => (
                            <tr key={s.id}>
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
                                    style={{ fontFamily: 'monospace', fontSize: 11, color: s.user_id ? '#a78bfa' : '#444' }}
                                >
                                    {s.user_id ? s.user_id.slice(0, 16) + '…' : '—'}
                                </td>
                                <td style={{ fontSize: 12 }}>{fmtDate(s.created_at)}</td>
                                <td style={{ fontSize: 12, color: s.is_active ? '#34d399' : '#666' }}>
                                    {timeSince(s.last_chunk_at)}
                                </td>
                                <td style={{ fontFamily: 'monospace', fontSize: 10, color: '#444' }}>
                                    {s.id?.slice(0, 12)}…
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
        </div>
    );
}
