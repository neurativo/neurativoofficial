import React, { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../../lib/adminApi.js';

const CSS = `
.adm-page-title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 24px; }
.adm-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 18px; flex-wrap: wrap; }
.adm-input { padding: 8px 12px; background: #141414; border: 1px solid #2a2a2a; border-radius: 7px; color: #e8e8e8; font-size: 13px; outline: none; transition: border-color 0.15s; }
.adm-input:focus { border-color: #7c3aed; }
.adm-total { color: #888; font-size: 12px; }
.adm-table-wrap { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.adm-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #555; border-bottom: 1px solid #1e1e1e; background: #0f0f0f; text-transform: uppercase; letter-spacing: 0.06em; }
.adm-table td { padding: 11px 16px; border-bottom: 1px solid #111; color: #c8c8c8; vertical-align: middle; }
.adm-table tr:last-child td { border-bottom: none; }
.adm-table tr:hover td { background: #ffffff04; }
.adm-btn-danger { background: #7f1d1d22; border: 1px solid #7f1d1d55; color: #f87171; padding: 5px 11px; border-radius: 6px; font-size: 11px; cursor: pointer; }
.adm-btn-danger:hover { background: #7f1d1d44; }
.adm-pagination { display: flex; align-items: center; gap: 10px; margin-top: 16px; font-size: 13px; color: #555; }
.adm-pag-btn { padding: 6px 12px; background: #141414; border: 1px solid #2a2a2a; border-radius: 6px; color: #888; cursor: pointer; font-size: 12px; }
.adm-pag-btn:hover:not(:disabled) { border-color: #555; color: #e8e8e8; }
.adm-pag-btn:disabled { opacity: 0.3; cursor: default; }
.adm-empty { text-align: center; padding: 32px; color: #444; }
.adm-toast { position: fixed; bottom: 24px; right: 24px; background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 8px; padding: 12px 18px; font-size: 13px; color: #e8e8e8; z-index: 9999; }
`;

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
            <style>{CSS}</style>
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
                            <tr key={l.id}>
                                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {l.title || 'Untitled'}
                                </td>
                                <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#666' }}>
                                    {l.user_id ? l.user_id.slice(0, 14) + '…' : '—'}
                                </td>
                                <td style={{ color: '#666', fontSize: 12 }}>{l.language || 'en'}</td>
                                <td>{fmtDuration(l.total_duration_seconds)}</td>
                                <td>{l.total_chunks ?? '—'}</td>
                                <td>{fmtDate(l.created_at)}</td>
                                <td>
                                    <button className="adm-btn-danger" onClick={() => deleteLecture(l.id)}>Delete</button>
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
