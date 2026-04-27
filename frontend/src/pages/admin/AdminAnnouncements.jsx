import React, { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi.js';


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
                                <td style={{ color: '#a3a3a3', fontSize: 12 }}>
                                    {a.expires_at
                                        ? new Date(a.expires_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                        : 'Never'}
                                </td>
                                <td style={{ color: '#a3a3a3', fontSize: 12 }}>
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
