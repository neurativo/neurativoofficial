import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/react';
import { adminApi } from '../../lib/adminApi.js';

// ── Add Admin Modal ────────────────────────────────────────────────────────────
function AddAdminModal({ onClose, onAdded }) {
    const [search, setSearch]     = useState('');
    const [results, setResults]   = useState([]);
    const [selected, setSelected] = useState(null);
    const [note, setNote]         = useState('');
    const [searching, setSearching] = useState(false);
    const [adding, setAdding]     = useState(false);
    const [error, setError]       = useState('');

    const doSearch = useCallback(async () => {
        if (!search.trim()) return;
        setSearching(true);
        setResults([]);
        setSelected(null);
        setError('');
        try {
            const res = await adminApi.listUsers({ search: search.trim(), page: 1, page_size: 10 });
            setResults(res.users || []);
            if ((res.users || []).length === 0) setError('No users found with that name or email.');
        } catch (e) {
            setError(e.message || 'Search failed');
        } finally {
            setSearching(false);
        }
    }, [search]);

    const handleAdd = async () => {
        if (!selected) return;
        setAdding(true);
        setError('');
        try {
            await adminApi.addAdmin({ user_id: selected.id, note: note || null });
            onAdded();
            onClose();
        } catch (e) {
            setError(e.message || 'Failed to add admin');
        } finally {
            setAdding(false);
        }
    };

    return (
        <>
            <div onClick={onClose}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300 }} />
            <div style={{
                position: 'fixed', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 'min(480px, calc(100vw - 32px))',
                background: 'white', borderRadius: 12, padding: '24px 24px 20px',
                zIndex: 301, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Add Admin</h3>
                    <button onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}>×</button>
                </div>

                {/* Step 1: search */}
                <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                        Search by name or email
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            className="adm-input"
                            placeholder="e.g. john@example.com"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && doSearch()}
                            style={{ flex: 1, fontSize: 14 }}
                        />
                        <button
                            onClick={doSearch}
                            disabled={searching || !search.trim()}
                            className="adm-btn"
                            style={{ whiteSpace: 'nowrap' }}>
                            {searching ? '…' : 'Search'}
                        </button>
                    </div>
                </div>

                {/* Results list */}
                {results.length > 0 && (
                    <div style={{ marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                        {results.map(u => {
                            const email = u.email || u.email_address || '';
                            const name  = u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || email;
                            const isSel = selected?.id === u.id;
                            return (
                                <div key={u.id}
                                    onClick={() => setSelected(u)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '10px 14px', cursor: 'pointer',
                                        background: isSel ? '#eff6ff' : 'white',
                                        borderBottom: '1px solid #f3f4f6',
                                        borderLeft: isSel ? '3px solid #2563eb' : '3px solid transparent',
                                    }}>
                                    {u.image_url
                                        ? <img src={u.image_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                                        : <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#dbeafe',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>
                                            {(name[0] || '?').toUpperCase()}
                                          </div>
                                    }
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{name}</div>
                                        <div style={{ fontSize: 12, color: '#6b7280' }}>{email}</div>
                                        <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{u.id}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Optional note */}
                {selected && (
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                            Note <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
                        </label>
                        <input
                            className="adm-input"
                            placeholder="e.g. Support team lead"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            style={{ width: '100%', fontSize: 13 }}
                        />
                    </div>
                )}

                {error && <div className="adm-error" style={{ marginBottom: 12 }}>{error}</div>}

                {selected && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
                        padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#166534' }}>
                        Ready to grant admin access to <strong>{selected.name || selected.email || selected.id}</strong>.
                        They will be able to access all admin panel pages immediately.
                    </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={onClose} className="adm-btn-ghost" style={{ flex: 1 }}>Cancel</button>
                    <button
                        onClick={handleAdd}
                        disabled={!selected || adding}
                        className="adm-btn"
                        style={{ flex: 2 }}>
                        {adding ? 'Adding…' : 'Grant Admin Access'}
                    </button>
                </div>
            </div>
        </>
    );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AdminAdmins() {
    const { isLoaded, isSignedIn } = useAuth();
    const [admins, setAdmins]     = useState([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');
    const [showModal, setShowModal] = useState(false);
    const [removing, setRemoving] = useState(null);
    const [removeError, setRemoveError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await adminApi.listAdmins();
            setAdmins(res.admins || []);
        } catch (e) {
            setError(e.message || 'Failed to load admins');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isLoaded && isSignedIn) load();
    }, [load, isLoaded, isSignedIn]);

    const handleRemove = async (userId) => {
        if (!window.confirm('Remove admin access for this user?')) return;
        setRemoving(userId);
        setRemoveError('');
        try {
            await adminApi.removeAdmin(userId);
            setAdmins(a => a.filter(x => x.user_id !== userId));
        } catch (e) {
            setRemoveError(e.message || 'Failed to remove admin');
        } finally {
            setRemoving(null);
        }
    };

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111827' }}>Admin Access</h2>
                    <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b7280' }}>
                        Manage who has access to this admin panel. Superadmins are set via the server environment and cannot be removed here.
                    </p>
                </div>
                <button onClick={() => setShowModal(true)} className="adm-btn" style={{ whiteSpace: 'nowrap' }}>
                    + Add Admin
                </button>
            </div>

            {removeError && <div className="adm-error" style={{ marginBottom: 16 }}>{removeError}</div>}

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[1, 2].map(i => (
                        <div key={i} className="adm-card" style={{ height: 72, background: '#f9fafb', boxShadow: 'none' }} />
                    ))}
                </div>
            ) : error ? (
                <div className="adm-card" style={{ textAlign: 'center', padding: 32 }}>
                    <p style={{ color: '#ef4444', marginBottom: 12 }}>{error}</p>
                    <button onClick={load} className="adm-btn-ghost">Retry</button>
                </div>
            ) : (
                <div className="adm-card" style={{ padding: 0, overflow: 'hidden' }}>
                    {admins.length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
                            No admins found.
                        </div>
                    ) : (
                        admins.map((a, idx) => {
                            const initial = (a.name?.[0] || a.email?.[0] || '?').toUpperCase();
                            const isEnv   = a.source === 'env';
                            const isLast  = idx === admins.length - 1;
                            return (
                                <div key={a.user_id} style={{
                                    display: 'flex', alignItems: 'center', gap: 14,
                                    padding: '14px 20px',
                                    borderBottom: isLast ? 'none' : '1px solid #f3f4f6',
                                }}>
                                    {/* Avatar */}
                                    {a.image_url
                                        ? <img src={a.image_url} alt=""
                                            style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                        : <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                                            background: isEnv ? '#fef3c7' : '#dbeafe',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 15, fontWeight: 700,
                                            color: isEnv ? '#92400e' : '#1d4ed8' }}>
                                            {initial}
                                          </div>
                                    }

                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                                                {a.name || a.email || a.user_id}
                                            </span>
                                            {isEnv && (
                                                <span style={{
                                                    fontSize: 11, fontWeight: 700, padding: '2px 7px',
                                                    borderRadius: 20, background: '#fef3c7', color: '#92400e',
                                                    letterSpacing: '0.03em',
                                                }}>SUPERADMIN</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                                            {a.email && <span>{a.email}</span>}
                                            {a.note && <span style={{ marginLeft: 8, color: '#9ca3af' }}>· {a.note}</span>}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#d1d5db', fontFamily: 'monospace', marginTop: 2 }}>
                                            {a.user_id}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    {!isEnv && (
                                        <button
                                            onClick={() => handleRemove(a.user_id)}
                                            disabled={removing === a.user_id}
                                            style={{
                                                background: 'none', border: '1px solid #fca5a5',
                                                color: '#ef4444', borderRadius: 6, padding: '6px 12px',
                                                cursor: 'pointer', fontSize: 13, flexShrink: 0,
                                                opacity: removing === a.user_id ? 0.5 : 1,
                                            }}>
                                            {removing === a.user_id ? 'Removing…' : 'Remove'}
                                        </button>
                                    )}
                                    {isEnv && (
                                        <span style={{ fontSize: 12, color: '#d1d5db', flexShrink: 0 }}>
                                            via env var
                                        </span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Info box */}
            <div style={{ marginTop: 20, background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 8, padding: '14px 16px', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                <strong style={{ color: '#374151' }}>How it works:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    <li><strong>Superadmins</strong> are set via the <code>ADMIN_USER_IDS</code> environment variable on Railway. They always have access and cannot be removed here.</li>
                    <li><strong>Admins</strong> added here get full access to this admin panel immediately. Remove them any time.</li>
                    <li>To permanently remove a superadmin, update <code>ADMIN_USER_IDS</code> in Railway and redeploy.</li>
                </ul>
            </div>

            {showModal && (
                <AddAdminModal
                    onClose={() => setShowModal(false)}
                    onAdded={load}
                />
            )}
        </div>
    );
}
