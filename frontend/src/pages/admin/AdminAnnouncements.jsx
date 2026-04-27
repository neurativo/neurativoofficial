import React, { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi.js';

const CSS = `
.adm-page-title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 24px; }
.adm-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 20px; margin-bottom: 24px; }
.adm-card-title { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px; }
.adm-form-row { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.adm-label { font-size: 12px; color: #666; }
.adm-textarea { padding: 10px 12px; background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 7px; color: #e8e8e8; font-size: 13px; outline: none; resize: vertical; min-height: 72px; font-family: inherit; }
.adm-textarea:focus { border-color: #7c3aed; }
.adm-select { padding: 8px 12px; background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 7px; color: #e8e8e8; font-size: 13px; cursor: pointer; }
.adm-input { padding: 8px 12px; background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 7px; color: #e8e8e8; font-size: 13px; outline: none; }
.adm-input:focus { border-color: #7c3aed; }
.adm-btn-primary { background: #7c3aed; color: #fff; padding: 8px 18px; border-radius: 7px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; }
.adm-btn-primary:hover { background: #6d28d9; }
.adm-btn-primary:disabled { opacity: 0.5; cursor: default; }
.adm-form-result { font-size: 12px; color: #34d399; margin-top: 6px; }
.adm-table-wrap { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.adm-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #555; border-bottom: 1px solid #1e1e1e; background: #0f0f0f; text-transform: uppercase; letter-spacing: 0.06em; }
.adm-table td { padding: 11px 16px; border-bottom: 1px solid #111; color: #c8c8c8; vertical-align: middle; }
.adm-table tr:last-child td { border-bottom: none; }
.adm-empty { text-align: center; padding: 32px; color: #444; }
.adm-type-info { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #0369a122; color: #38bdf8; }
.adm-type-warning { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #78350f22; color: #fbbf24; }
.adm-type-maintenance { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #7f1d1d22; color: #f87171; }
.adm-btn-danger-sm { background: #7f1d1d22; border: 1px solid #7f1d1d55; color: #f87171; padding: 4px 10px; border-radius: 5px; font-size: 11px; cursor: pointer; }
.adm-btn-danger-sm:hover { background: #7f1d1d44; }
`;

function TypeBadge({ type }) {
    return <span className={`adm-type-${type || 'info'}`}>{type || 'info'}</span>;
}

export default function AdminAnnouncements() {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [text, setText] = useState('');
    const [annType, setAnnType] = useState('info');
    const [expiresAt, setExpiresAt] = useState('');
    const [creating, setCreating] = useState(false);
    const [createResult, setCreateResult] = useState('');

    function loadAnnouncements() {
        setLoading(true);
        adminApi.listAnnouncements()
            .then(r => setAnnouncements(r.announcements || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }

    useEffect(loadAnnouncements, []);

    async function handleCreate(e) {
        e.preventDefault();
        if (!text.trim()) return;
        setCreating(true);
        setCreateResult('');
        try {
            await adminApi.createAnnouncement({
                text: text.trim(),
                ann_type: annType,
                expires_at: expiresAt || null,
            });
            setCreateResult('✓ Announcement created');
            setText('');
            setAnnType('info');
            setExpiresAt('');
            loadAnnouncements();
        } catch {
            setCreateResult('✗ Failed to create');
        } finally {
            setCreating(false);
            setTimeout(() => setCreateResult(''), 3000);
        }
    }

    async function handleDelete(id) {
        try {
            await adminApi.deleteAnnouncement(id);
            setAnnouncements(prev => prev.filter(a => a.id !== id));
        } catch { /* silent */ }
    }

    return (
        <div>
            <style>{CSS}</style>
            <div className="adm-page-title">Broadcast Announcements</div>

            <div className="adm-card">
                <div className="adm-card-title">Create Announcement</div>
                <form onSubmit={handleCreate}>
                    <div className="adm-form-row">
                        <label className="adm-label">Message</label>
                        <textarea
                            className="adm-textarea"
                            placeholder="Scheduled maintenance on Friday at 3 PM UTC…"
                            value={text}
                            onChange={e => setText(e.target.value)}
                            maxLength={500}
                        />
                    </div>
                    <div className="adm-form-row">
                        <label className="adm-label">Type</label>
                        <select className="adm-select" value={annType} onChange={e => setAnnType(e.target.value)}>
                            <option value="info">Info (blue)</option>
                            <option value="warning">Warning (yellow)</option>
                            <option value="maintenance">Maintenance (red)</option>
                        </select>
                    </div>
                    <div className="adm-form-row">
                        <label className="adm-label">Expires at (optional — leave blank for permanent)</label>
                        <input
                            className="adm-input"
                            type="datetime-local"
                            value={expiresAt}
                            onChange={e => setExpiresAt(e.target.value)}
                            style={{ maxWidth: 260 }}
                        />
                    </div>
                    <button className="adm-btn-primary" type="submit" disabled={creating || !text.trim()}>
                        {creating ? 'Creating…' : 'Post Announcement'}
                    </button>
                    {createResult && <div className="adm-form-result">{createResult}</div>}
                </form>
            </div>

            <div className="adm-table-wrap">
                <table className="adm-table">
                    <thead>
                        <tr><th>Message</th><th>Type</th><th>Expires</th><th>Created</th><th></th></tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={5} className="adm-empty">Loading…</td></tr>}
                        {!loading && !announcements.length && (
                            <tr><td colSpan={5} className="adm-empty">No active announcements.</td></tr>
                        )}
                        {!loading && announcements.map(a => (
                            <tr key={a.id}>
                                <td style={{ maxWidth: 320 }}>{a.text}</td>
                                <td><TypeBadge type={a.ann_type} /></td>
                                <td style={{ color: '#555', fontSize: 12 }}>
                                    {a.expires_at
                                        ? new Date(a.expires_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                        : 'Never'}
                                </td>
                                <td style={{ color: '#555', fontSize: 12 }}>
                                    {new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric' })}
                                </td>
                                <td>
                                    <button className="adm-btn-danger-sm" onClick={() => handleDelete(a.id)}>Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
