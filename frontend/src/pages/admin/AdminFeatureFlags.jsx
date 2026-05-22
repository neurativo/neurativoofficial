import React, { useEffect, useState, useCallback } from 'react';
import { featureFlagsApi } from '../../lib/adminApi.js';

const VIS_META = {
    internal: { label: 'Internal',  color: '#6366f1', bg: 'rgba(99,102,241,0.08)',  tip: 'Only specific user IDs (you + testers)' },
    beta:     { label: 'Beta',      color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   tip: 'Allowed user IDs (beta group)' },
    public:   { label: 'Public',    color: '#10b981', bg: 'rgba(16,185,129,0.09)',   tip: 'All authenticated users' },
};

function VisBadge({ vis }) {
    const m = VIS_META[vis] || VIS_META.internal;
    return (
        <span style={{
            display: 'inline-block', padding: '2px 9px', borderRadius: 99,
            fontSize: 11, fontWeight: 600,
            color: m.color, background: m.bg,
        }} title={m.tip}>
            {m.label}
        </span>
    );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
    return (
        <button
            onClick={() => !disabled && onChange(!checked)}
            disabled={disabled}
            style={{
                width: 42, height: 24, borderRadius: 99,
                background: checked ? '#10b981' : 'var(--adm-border)',
                border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
                position: 'relative', transition: 'background 0.2s',
                flexShrink: 0,
            }}
            aria-pressed={checked}
        >
            <span style={{
                position: 'absolute',
                top: 3, left: checked ? 21 : 3,
                width: 18, height: 18, borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
            }} />
        </button>
    );
}

// ── Flag row ──────────────────────────────────────────────────────────────────
function FlagRow({ flag, onUpdate, onDelete }) {
    const [expanded, setExpanded]       = useState(false);
    const [saving, setSaving]           = useState(false);
    const [editData, setEditData]       = useState(null);

    function startEdit() {
        setEditData({
            name:             flag.name,
            description:      flag.description || '',
            visibility:       flag.visibility,
            allowed_user_ids: (flag.allowed_user_ids || []).join('\n'),
        });
        setExpanded(true);
    }

    async function saveEdit() {
        setSaving(true);
        try {
            const ids = editData.allowed_user_ids
                .split('\n').map(s => s.trim()).filter(Boolean);
            await onUpdate(flag.key, {
                name:             editData.name.trim(),
                description:      editData.description.trim(),
                visibility:       editData.visibility,
                allowed_user_ids: ids,
            });
            setEditData(null);
            setExpanded(false);
        } finally { setSaving(false); }
    }

    async function toggleEnabled() {
        setSaving(true);
        try { await onUpdate(flag.key, { enabled: !flag.enabled }); }
        finally { setSaving(false); }
    }

    const allowedCount = (flag.allowed_user_ids || []).length;

    return (
        <>
            <tr className="adm-tr-hover" style={{ cursor: 'pointer' }}
                onClick={() => !editData && setExpanded(e => !e)}>
                <td style={{ padding: '11px 12px', fontFamily: 'monospace', fontSize: 12, color: 'var(--adm-text)' }}>
                    {flag.key}
                </td>
                <td style={{ padding: '11px 12px', fontSize: 13, color: 'var(--adm-text)' }}>
                    {flag.name}
                </td>
                <td style={{ padding: '11px 12px' }}>
                    <VisBadge vis={flag.visibility} />
                </td>
                <td style={{ padding: '11px 12px', fontSize: 12, color: '#9ca3af' }}>
                    {allowedCount > 0 ? `${allowedCount} user${allowedCount !== 1 ? 's' : ''}` : '—'}
                </td>
                <td style={{ padding: '11px 12px' }} onClick={e => e.stopPropagation()}>
                    <Toggle checked={flag.enabled} onChange={toggleEnabled} disabled={saving} />
                </td>
                <td style={{ padding: '11px 12px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button className="adm-btn-ghost"
                            style={{ fontSize: 11, padding: '4px 10px' }}
                            onClick={startEdit}>
                            Edit
                        </button>
                        <button className="adm-btn-ghost"
                            style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                            onClick={() => onDelete(flag.key)}>
                            Delete
                        </button>
                    </div>
                </td>
            </tr>

            {expanded && editData && (
                <tr>
                    <td colSpan={6} style={{ padding: '0 12px 16px', background: 'var(--adm-bg)' }}>
                        <div style={{
                            background: 'var(--adm-card)',
                            border: '1px solid var(--adm-border)',
                            borderRadius: 12, padding: '16px 18px', marginTop: 4,
                        }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>Name</div>
                                    <input className="adm-input" value={editData.name}
                                        onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>Visibility</div>
                                    <select className="adm-select" value={editData.visibility}
                                        onChange={e => setEditData(d => ({ ...d, visibility: e.target.value }))}>
                                        <option value="internal">Internal — specific users only</option>
                                        <option value="beta">Beta — allowed user IDs</option>
                                        <option value="public">Public — all users</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>Description</div>
                                <input className="adm-input" value={editData.description}
                                    onChange={e => setEditData(d => ({ ...d, description: e.target.value }))}
                                    placeholder="What does this flag control?" />
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>
                                    Allowed User IDs <span style={{ fontWeight: 400 }}>(one per line — always bypasses visibility)</span>
                                </div>
                                <textarea className="adm-input" rows={4}
                                    style={{ fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
                                    value={editData.allowed_user_ids}
                                    onChange={e => setEditData(d => ({ ...d, allowed_user_ids: e.target.value }))}
                                    placeholder="user_2abc123..." />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="adm-btn-primary" onClick={saveEdit} disabled={saving}>
                                    {saving ? 'Saving…' : 'Save changes'}
                                </button>
                                <button className="adm-btn-ghost" onClick={() => { setEditData(null); setExpanded(false); }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
            )}

            {expanded && !editData && flag.description && (
                <tr>
                    <td colSpan={6} style={{ padding: '0 12px 12px', background: 'var(--adm-bg)' }}>
                        <div style={{
                            background: 'var(--adm-card)', border: '1px solid var(--adm-border)',
                            borderRadius: 10, padding: '10px 14px', marginTop: 4,
                            fontSize: 12, color: '#9ca3af',
                        }}>
                            {flag.description}
                            {allowedCount > 0 && (
                                <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 11 }}>
                                    Allowed: {(flag.allowed_user_ids || []).join(', ')}
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

// ── Create form ───────────────────────────────────────────────────────────────
function CreateFlagForm({ onCreate, onCancel }) {
    const [form, setForm] = useState({
        key: '', name: '', description: '', visibility: 'internal',
        enabled: false, allowed_user_ids: '',
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr]       = useState('');

    async function handleSubmit() {
        if (!form.key.trim() || !form.name.trim()) { setErr('Key and name are required.'); return; }
        setSaving(true);
        setErr('');
        try {
            const ids = form.allowed_user_ids.split('\n').map(s => s.trim()).filter(Boolean);
            await onCreate({
                key:             form.key.trim().toLowerCase().replace(/\s+/g, '_'),
                name:            form.name.trim(),
                description:     form.description.trim(),
                visibility:      form.visibility,
                enabled:         form.enabled,
                allowed_user_ids: ids,
            });
        } catch (e) {
            setErr(e?.response?.data?.detail || 'Failed to create flag');
        } finally { setSaving(false); }
    }

    return (
        <div style={{
            background: 'var(--adm-card)', border: '1px solid var(--adm-border)',
            borderRadius: 14, padding: '20px 22px', marginBottom: 20,
        }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--adm-text)', marginBottom: 16 }}>
                New Feature Flag
            </div>
            {err && <div className="adm-error" style={{ marginBottom: 12 }}>{err}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>Key <span style={{ color: '#ef4444' }}>*</span></div>
                    <input className="adm-input" placeholder="e.g. new_quiz_ui"
                        value={form.key}
                        onChange={e => setForm(f => ({ ...f, key: e.target.value }))} />
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>Lowercase, underscores only</div>
                </div>
                <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>Name <span style={{ color: '#ef4444' }}>*</span></div>
                    <input className="adm-input" placeholder="e.g. New Quiz UI"
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>Visibility</div>
                    <select className="adm-select" value={form.visibility}
                        onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}>
                        <option value="internal">Internal — specific users only</option>
                        <option value="beta">Beta — allowed user IDs</option>
                        <option value="public">Public — all users</option>
                    </select>
                </div>
                <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>Description</div>
                    <input className="adm-input" placeholder="What this flag controls"
                        value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
            </div>
            <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>
                    Allowed User IDs <span style={{ fontWeight: 400 }}>(one per line)</span>
                </div>
                <textarea className="adm-input" rows={3}
                    style={{ fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
                    placeholder="user_2abc123..."
                    value={form.allowed_user_ids}
                    onChange={e => setForm(f => ({ ...f, allowed_user_ids: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="adm-btn-primary" onClick={handleSubmit} disabled={saving}>
                    {saving ? 'Creating…' : 'Create flag'}
                </button>
                <button className="adm-btn-ghost" onClick={onCancel}>Cancel</button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginLeft: 'auto', fontSize: 12, cursor: 'pointer' }}>
                    <Toggle checked={form.enabled} onChange={v => setForm(f => ({ ...f, enabled: v }))} />
                    <span style={{ color: 'var(--adm-text)' }}>Enabled immediately</span>
                </label>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminFeatureFlags() {
    const [flags, setFlags]       = useState([]);
    const [loading, setLoading]   = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError]       = useState('');

    const load = useCallback(() => {
        setLoading(true);
        featureFlagsApi.list()
            .then(r => { setFlags(r.flags || []); setError(''); })
            .catch(e => setError(e?.response?.data?.detail || 'Failed to load'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    async function handleCreate(body) {
        await featureFlagsApi.create(body);
        load();
        setCreating(false);
    }

    async function handleUpdate(key, fields) {
        await featureFlagsApi.update(key, fields);
        setFlags(prev => prev.map(f => f.key === key ? { ...f, ...fields } : f));
    }

    async function handleDelete(key) {
        if (!confirm(`Delete flag "${key}"? This cannot be undone.`)) return;
        await featureFlagsApi.delete(key);
        setFlags(prev => prev.filter(f => f.key !== key));
    }

    const enabledCount = flags.filter(f => f.enabled).length;

    return (
        <div>
            <div className="adm-page-title">Feature Flags</div>

            {error && <div className="adm-error">{error}</div>}

            {/* Stats */}
            <div className="adm-cards" style={{ marginBottom: 20 }}>
                <div className="adm-card">
                    <div className="adm-card-label">Total Flags</div>
                    <div className="adm-card-value">{flags.length}</div>
                    <div className="adm-card-sub">defined</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Enabled</div>
                    <div className="adm-card-value" style={{ color: enabledCount > 0 ? '#10b981' : undefined }}>{enabledCount}</div>
                    <div className="adm-card-sub">currently active</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Public</div>
                    <div className="adm-card-value">{flags.filter(f => f.visibility === 'public' && f.enabled).length}</div>
                    <div className="adm-card-sub">visible to all users</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Internal</div>
                    <div className="adm-card-value">{flags.filter(f => f.visibility === 'internal').length}</div>
                    <div className="adm-card-sub">testing only</div>
                </div>
            </div>

            {/* How it works callout */}
            <div style={{
                background: 'rgba(99,102,241,0.05)',
                border: '1px solid rgba(99,102,241,0.18)',
                borderRadius: 12, padding: '14px 18px', marginBottom: 20,
                fontSize: 12, color: '#9ca3af', lineHeight: 1.65,
            }}>
                <span style={{ fontWeight: 700, color: '#6366f1' }}>How it works: </span>
                Create a flag with <strong>Internal</strong> visibility and add your own user ID to test a feature in production without anyone else seeing it.
                Expand to <strong>Beta</strong> by adding testers. Set to <strong>Public</strong> to roll out to everyone.
                Frontend checks flags via <code style={{ fontFamily: 'monospace', fontSize: 11 }}>useFeatureFlag('key')</code>.
            </div>

            {/* Create form or button */}
            {creating ? (
                <CreateFlagForm onCreate={handleCreate} onCancel={() => setCreating(false)} />
            ) : (
                <div style={{ marginBottom: 16 }}>
                    <button className="adm-btn-primary" onClick={() => setCreating(true)}>
                        + New Flag
                    </button>
                    <button className="adm-btn-ghost" style={{ marginLeft: 8 }} onClick={load}>
                        Refresh
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="adm-card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>Loading…</div>
                ) : flags.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
                        No feature flags yet. Create one to start testing features internally.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="adm-table" style={{ minWidth: 640 }}>
                            <thead>
                                <tr>
                                    <th>Key</th>
                                    <th>Name</th>
                                    <th>Visibility</th>
                                    <th>Allowed Users</th>
                                    <th>Enabled</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {flags.map(flag => (
                                    <FlagRow
                                        key={flag.key}
                                        flag={flag}
                                        onUpdate={handleUpdate}
                                        onDelete={handleDelete}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
