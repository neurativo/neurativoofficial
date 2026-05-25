import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { adminGetOrg, adminUpdateOrg, updateMember } from '../../lib/teamsApi.js';

export default function AdminTeamDetail() {
    const { slug } = useParams();
    const [data, setData]     = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]   = useState('');

    // Edit fields
    const [seatLimit, setSeatLimit] = useState('');
    const [status, setStatus]       = useState('');
    const [saving, setSaving]       = useState(false);
    const [msg, setMsg]             = useState({ type: '', text: '' });

    function load() {
        setLoading(true);
        adminGetOrg(slug)
            .then(r => {
                setData(r.data);
                setSeatLimit(String(r.data.org.seat_limit));
                setStatus(r.data.org.status);
            })
            .catch(() => setError('Failed to load organization'))
            .finally(() => setLoading(false));
    }

    useEffect(() => { load(); }, [slug]);

    async function handleSave() {
        setSaving(true);
        setMsg({ type: '', text: '' });
        try {
            await adminUpdateOrg(slug, {
                seat_limit: parseInt(seatLimit, 10),
                status,
            });
            setMsg({ type: 'ok', text: 'Saved.' });
            load();
        } catch (err) {
            setMsg({ type: 'err', text: err.response?.data?.detail || 'Save failed.' });
        } finally {
            setSaving(false);
        }
    }

    async function handleTierChange(memberId, tier) {
        await updateMember(slug, memberId, { seat_tier: tier }).catch(() => {});
        setData(prev => prev ? ({
            ...prev,
            members: (prev.members || []).map(m => m.id === memberId ? { ...m, seat_tier: tier } : m),
        }) : prev);
    }

    async function handleRemove(memberId) {
        if (!confirm('Remove this member?')) return;
        await updateMember(slug, memberId, { status: 'removed' }).catch(() => {});
        load();
    }

    if (loading) return <div><p style={{ color: '#6b6b6b', fontSize: 14 }}>Loading…</p></div>;
    if (error) return <div><p style={{ color: '#ef4444', fontSize: 14 }}>{error}</p></div>;

    const { org, members, seat_counts } = data;

    return (
        <div>
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Link to="/admin/teams" style={{ fontSize: 13, color: '#6b6b6b', textDecoration: 'none' }}>← Teams</Link>
                <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.4px' }}>{org.name}</h1>
                <span style={{ fontSize: 12, color: '#6b6b6b', fontFamily: 'monospace', background: '#f0ede8', padding: '2px 8px', borderRadius: 6 }}>
                    {org.slug}
                </span>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 12, marginBottom: 24 }}>
                {[
                    { label: 'Active seats', val: seat_counts.total },
                    { label: 'Seat limit', val: org.seat_limit },
                    { label: 'Pro seats', val: seat_counts.pro },
                    { label: 'Student seats', val: seat_counts.student },
                ].map(s => (
                    <div key={s.label} style={{ background: '#fff', border: '1.5px solid #f0ede8', borderRadius: 10, padding: '14px 16px' }}>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{s.val}</div>
                        <div style={{ fontSize: 12, color: '#6b6b6b' }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Admin controls */}
            <div style={{ background: '#fff', border: '1.5px solid #f0ede8', borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Admin controls</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginBottom: 4 }}>Seat limit</label>
                        <input
                            type="number" min="0"
                            value={seatLimit}
                            onChange={e => setSeatLimit(e.target.value)}
                            style={{ width: 100, padding: '7px 10px', border: '1.5px solid #e5e2dd', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginBottom: 4 }}>Status</label>
                        <select
                            value={status}
                            onChange={e => setStatus(e.target.value)}
                            style={{ padding: '7px 10px', border: '1.5px solid #e5e2dd', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' }}
                        >
                            <option value="active">active</option>
                            <option value="past_due">past_due</option>
                            <option value="cancelled">cancelled</option>
                        </select>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{ padding: '8px 18px', background: '#1a1a1a', color: '#fafaf9', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: saving ? .5 : 1 }}
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
                {msg.text && <div style={{ fontSize: 12, color: msg.type === 'ok' ? '#16a34a' : '#ef4444', marginTop: 8 }}>{msg.text}</div>}
            </div>

            {/* Members table */}
            <div style={{ background: '#fff', border: '1.5px solid #f0ede8', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0ede8', fontSize: 14, fontWeight: 600 }}>
                    Members ({members.filter(m => m.status !== 'removed').length})
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr>
                            {['Email', 'Role', 'Tier', 'Status', 'Joined', ''].map(h => (
                                <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontWeight: 500, color: '#6b6b6b', borderBottom: '1px solid #f0ede8', fontSize: 12 }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {members.filter(m => m.status !== 'removed').map(m => (
                            <tr key={m.id}>
                                <td style={{ padding: '9px 14px' }}>{m.email}</td>
                                <td style={{ padding: '9px 14px', color: '#6b6b6b' }}>{m.role}</td>
                                <td style={{ padding: '9px 14px' }}>
                                    <select
                                        value={m.seat_tier}
                                        onChange={e => handleTierChange(m.id, e.target.value)}
                                        style={{ fontSize: 12, border: '1.5px solid #e5e2dd', borderRadius: 6, padding: '3px 8px', background: '#fff', fontFamily: 'inherit' }}
                                    >
                                        <option value="student">student</option>
                                        <option value="pro">pro</option>
                                    </select>
                                </td>
                                <td style={{ padding: '9px 14px', color: '#6b6b6b', fontSize: 12 }}>{m.status}</td>
                                <td style={{ padding: '9px 14px', color: '#a3a3a3', fontSize: 12 }}>
                                    {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}
                                </td>
                                <td style={{ padding: '9px 14px' }}>
                                    {m.user_id !== org.owner_id && m.status === 'active' && (
                                        <button onClick={() => handleRemove(m.id)} style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 8px', borderRadius: 6 }}>
                                            Remove
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
