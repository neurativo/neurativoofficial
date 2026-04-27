import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../lib/adminApi.js';


function fmtDuration(secs) {
    if (!secs) return '—';
    const m = Math.floor(secs / 60);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminLectures() {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [userFilter, setUserFilter] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        adminApi.listLectures({ search, user_id: userFilter || undefined, page, page_size: 20 })
            .then(setData)
            .finally(() => setLoading(false));
    }, [search, userFilter, page]);

    useEffect(() => { load(); }, [load]);

    function showToast(msg) {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    }

    async function deleteLecture(id) {
        try {
            await adminApi.deleteLecture(id);
            setData(d => ({ ...d, lectures: d.lectures.filter(l => l.id !== id), total: (d.total || 1) - 1 }));
            showToast('Lecture deleted');
        } catch {
            showToast('Failed to delete lecture');
        }
    }

    const lectures = data?.lectures || [];
    const total = data?.total || 0;
    const totalPages = Math.ceil(total / 20) || 1;

    return (
        <div>
            <div className="adm-page-title">Lectures</div>

            <div className="adm-toolbar">
                <input
                    className="adm-input"
                    style={{ width: 220 }}
                    placeholder="Search by title…"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                />
                <input
                    className="adm-input"
                    style={{ width: 200 }}
                    placeholder="Filter by user ID…"
                    value={userFilter}
                    onChange={e => { setUserFilter(e.target.value); setPage(1); }}
                />
                <span className="adm-total">{total.toLocaleString()} lectures</span>
            </div>

            <div className="adm-table-wrap">
                <table className="adm-table">
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>User ID</th>
                            <th>Language</th>
                            <th>Duration</th>
                            <th>Chunks</th>
                            <th>Date</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && !lectures.length && (
                            <tr><td colSpan={7} className="adm-empty">Loading…</td></tr>
                        )}
                        {!loading && !lectures.length && (
                            <tr><td colSpan={7} className="adm-empty">No lectures found.</td></tr>
                        )}
                        {lectures.map(l => (
                            <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/lectures/${l.id}`)}>
                                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6366f1' }}>
                                    {l.title || 'Untitled'}
                                </td>
                                <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#c4c4c4' }}>
                                    {l.user_id ? l.user_id.slice(0, 14) + '…' : '—'}
                                </td>
                                <td style={{ color: '#a3a3a3', fontSize: 12 }}>{l.language || 'en'}</td>
                                <td>{fmtDuration(l.total_duration_seconds)}</td>
                                <td>{l.total_chunks ?? '—'}</td>
                                <td>{fmtDate(l.created_at)}</td>
                                <td>
                                    <button className="adm-btn-danger" onClick={e => { e.stopPropagation(); deleteLecture(l.id); }}>Delete</button>
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

            {toast && <div className="adm-toast">{toast}</div>}
        </div>
    );
}
