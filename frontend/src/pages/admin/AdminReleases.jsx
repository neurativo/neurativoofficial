/**
 * AdminReleases — "What's New" release management page.
 *
 * Workflow:
 *  1. Create release (draft)
 *  2. Build feature items (icon, title, description, badge)
 *  3. Preview the modal
 *  4. Publish → all eligible users see it once next visit
 *  5. Unpublish if needed (retracts immediately)
 */
import React, { useEffect, useState, useCallback } from 'react';
import { releasesApi } from '../../lib/adminApi.js';

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

const BADGE_OPTIONS = ['', 'New', 'Improved', 'Beta'];
const BADGE_COLORS = {
    New:      { color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
    Improved: { color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
    Beta:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
};

// ── Preview modal (inline, mirrors WhatsNewModal) ─────────────────────────────
function ReleasePreview({ release, onClose }) {
    if (!release) return null;
    const features = release.features || [];
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
        }} onClick={onClose}>
            <div style={{
                background: 'var(--adm-card)',
                border: '1px solid var(--adm-border)',
                borderRadius: 24,
                boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
                width: '100%', maxWidth: 480,
                maxHeight: '90vh', overflowY: 'auto',
                display: 'flex', flexDirection: 'column',
            }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{
                    padding: '32px 28px 28px',
                    background: 'linear-gradient(135deg,#0f0f0f 0%,#1e1a2e 50%,#0f1929 100%)',
                    borderRadius: '24px 24px 0 0',
                    position: 'relative', overflow: 'hidden',
                }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 99,
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)',
                        marginBottom: 14,
                    }}>
                        <div style={{ width:5,height:5,borderRadius:'50%',background:'#10b981' }} />
                        What&apos;s new in Neurativo
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: -0.6, marginBottom: 6 }}>
                        {release.title || 'Release title'}
                    </div>
                    {release.subtitle && (
                        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>{release.subtitle}</div>
                    )}
                </div>
                {/* Features */}
                <div style={{ padding: '4px 28px 0', flex: 1 }}>
                    {features.length === 0 && (
                        <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
                            No features added yet
                        </div>
                    )}
                    {features.map((f, i) => (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 14,
                            padding: '14px 0',
                            borderBottom: i < features.length - 1 ? '1px solid var(--adm-border)' : 'none',
                        }}>
                            <div style={{
                                width: 40, height: 40, flexShrink: 0, borderRadius: 12,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 18, background: 'var(--adm-bg)',
                                border: '1px solid var(--adm-border)',
                            }}>{f.icon || '✦'}</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--adm-text)' }}>{f.title}</span>
                                    {f.badge && BADGE_COLORS[f.badge] && (
                                        <span style={{
                                            padding: '1px 7px', borderRadius: 99,
                                            fontSize: 10, fontWeight: 700,
                                            color: BADGE_COLORS[f.badge].color,
                                            background: BADGE_COLORS[f.badge].bg,
                                        }}>{f.badge}</span>
                                    )}
                                </div>
                                <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.55 }}>{f.description}</div>
                            </div>
                        </div>
                    ))}
                </div>
                {/* Footer */}
                <div style={{
                    padding: '20px 28px 24px',
                    borderTop: '1px solid var(--adm-border)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                    {release.cta_label && (
                        <button style={{
                            width: '100%', padding: '12px 20px',
                            fontSize: 14, fontWeight: 600,
                            border: 'none', borderRadius: 12,
                            background: '#111', color: '#fafaf9',
                            cursor: 'pointer', fontFamily: 'inherit',
                        }}>{release.cta_label || 'Start exploring'}</button>
                    )}
                    <button style={{
                        width: '100%', padding: '10px 20px',
                        fontSize: 13, fontWeight: 500,
                        border: '1px solid var(--adm-border)', borderRadius: 12,
                        background: 'transparent', color: '#6b7280',
                        cursor: 'pointer', fontFamily: 'inherit',
                    }} onClick={onClose}>Got it, thanks!</button>
                </div>
            </div>
        </div>
    );
}

// ── Feature item editor ────────────────────────────────────────────────────────
function FeatureItemEditor({ item, onChange, onRemove }) {
    return (
        <div style={{
            background: 'var(--adm-bg)',
            border: '1px solid var(--adm-border)',
            borderRadius: 10, padding: '12px 14px', marginBottom: 8,
        }}>
            <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr auto', gap: 8, marginBottom: 8 }}>
                <input
                    className="adm-input"
                    style={{ textAlign: 'center', fontSize: 20 }}
                    placeholder="✦"
                    value={item.icon || ''}
                    onChange={e => onChange({ ...item, icon: e.target.value })}
                    title="Emoji icon"
                />
                <input
                    className="adm-input"
                    placeholder="Feature title"
                    value={item.title || ''}
                    onChange={e => onChange({ ...item, title: e.target.value })}
                />
                <select
                    className="adm-select"
                    style={{ width: 100 }}
                    value={item.badge || ''}
                    onChange={e => onChange({ ...item, badge: e.target.value })}
                >
                    {BADGE_OPTIONS.map(b => <option key={b} value={b}>{b || 'No badge'}</option>)}
                </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'start' }}>
                <textarea
                    className="adm-input"
                    rows={2}
                    style={{ resize: 'vertical', fontSize: 12 }}
                    placeholder="Short description of this feature…"
                    value={item.description || ''}
                    onChange={e => onChange({ ...item, description: e.target.value })}
                />
                <button
                    className="adm-btn-ghost"
                    style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                    onClick={onRemove}
                >
                    Remove
                </button>
            </div>
        </div>
    );
}

// ── Release form (create / edit) ───────────────────────────────────────────────
function ReleaseForm({ initial, onSave, onCancel }) {
    const isNew = !initial?.id;
    const [form, setForm] = useState({
        title:        initial?.title        || '',
        subtitle:     initial?.subtitle     || '',
        cta_label:    initial?.cta_label    || 'Start exploring',
        cta_url:      initial?.cta_url      || '',
        target_plans: (initial?.target_plans || []).join(','),
        features:     initial?.features     || [],
    });
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState(false);
    const [err, setErr]       = useState('');

    function addFeature() {
        setForm(f => ({ ...f, features: [...f.features, { icon: '', title: '', description: '', badge: '' }] }));
    }
    function updateFeature(i, item) {
        setForm(f => ({ ...f, features: f.features.map((x, j) => j === i ? item : x) }));
    }
    function removeFeature(i) {
        setForm(f => ({ ...f, features: f.features.filter((_, j) => j !== i) }));
    }

    async function handleSave() {
        if (!form.title.trim()) { setErr('Title is required.'); return; }
        setSaving(true); setErr('');
        try {
            const plans = form.target_plans.split(',').map(s => s.trim()).filter(Boolean);
            await onSave({
                title:        form.title.trim(),
                subtitle:     form.subtitle.trim(),
                cta_label:    form.cta_label.trim() || 'Start exploring',
                cta_url:      form.cta_url.trim(),
                target_plans: plans,
                features:     form.features,
            });
        } catch (e) {
            setErr(e?.response?.data?.detail || 'Failed to save');
        } finally { setSaving(false); }
    }

    const previewRelease = {
        ...form,
        target_plans: form.target_plans.split(',').map(s => s.trim()).filter(Boolean),
    };

    return (
        <>
            {preview && <ReleasePreview release={previewRelease} onClose={() => setPreview(false)} />}
            <div style={{
                background: 'var(--adm-card)', border: '1px solid var(--adm-border)',
                borderRadius: 14, padding: '22px 24px', marginBottom: 20,
            }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--adm-text)', marginBottom: 18 }}>
                    {isNew ? 'New Release' : 'Edit Release'}
                </div>
                {err && <div className="adm-error" style={{ marginBottom: 12 }}>{err}</div>}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>Title <span style={{ color: '#ef4444' }}>*</span></div>
                        <input className="adm-input" placeholder="e.g. Study Tools Suite"
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                    </div>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>Subtitle</div>
                        <input className="adm-input" placeholder="Optional tagline"
                            value={form.subtitle}
                            onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 18 }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>CTA Button Label</div>
                        <input className="adm-input" placeholder="Start exploring"
                            value={form.cta_label}
                            onChange={e => setForm(f => ({ ...f, cta_label: e.target.value }))} />
                    </div>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>CTA URL <span style={{ fontWeight: 400 }}>(optional)</span></div>
                        <input className="adm-input" placeholder="/app or /pricing"
                            value={form.cta_url}
                            onChange={e => setForm(f => ({ ...f, cta_url: e.target.value }))} />
                    </div>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>Target Plans <span style={{ fontWeight: 400 }}>(leave blank = all)</span></div>
                        <input className="adm-input" placeholder="student, pro"
                            value={form.target_plans}
                            onChange={e => setForm(f => ({ ...f, target_plans: e.target.value }))} />
                    </div>
                </div>

                {/* Feature items */}
                <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--adm-text)' }}>Features</div>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>({form.features.length})</span>
                    </div>
                    {form.features.map((f, i) => (
                        <FeatureItemEditor
                            key={i}
                            item={f}
                            onChange={item => updateFeature(i, item)}
                            onRemove={() => removeFeature(i)}
                        />
                    ))}
                    <button className="adm-btn-ghost"
                        style={{ fontSize: 12, padding: '6px 14px', width: '100%', marginTop: 4 }}
                        onClick={addFeature}>
                        + Add feature item
                    </button>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="adm-btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving…' : isNew ? 'Create release' : 'Save changes'}
                    </button>
                    <button className="adm-btn-ghost" onClick={() => setPreview(true)}>
                        Preview modal
                    </button>
                    <button className="adm-btn-ghost" onClick={onCancel}>Cancel</button>
                </div>
            </div>
        </>
    );
}

// ── Release card in list ──────────────────────────────────────────────────────
function ReleaseCard({ release, onEdit, onPublish, onUnpublish, onDelete }) {
    const [loading, setLoading] = useState(false);
    const isPublished = Boolean(release.published_at);
    const featCount = (release.features || []).length;
    const dismissed = release.stats?.dismissed_count || 0;

    async function togglePublish() {
        setLoading(true);
        try {
            if (isPublished) await onUnpublish(release.id);
            else await onPublish(release.id);
        } finally { setLoading(false); }
    }

    return (
        <div style={{
            background: 'var(--adm-card)',
            border: `1px solid ${isPublished ? 'rgba(16,185,129,0.25)' : 'var(--adm-border)'}`,
            borderRadius: 14, padding: '18px 20px', marginBottom: 12,
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--adm-text)' }}>
                            {release.title}
                        </span>
                        <span style={{
                            padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                            color: isPublished ? '#10b981' : '#9ca3af',
                            background: isPublished ? 'rgba(16,185,129,0.09)' : 'var(--adm-bg)',
                            border: `1px solid ${isPublished ? 'rgba(16,185,129,0.25)' : 'var(--adm-border)'}`,
                        }}>
                            {isPublished ? 'Published' : 'Draft'}
                        </span>
                    </div>
                    {release.subtitle && (
                        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>{release.subtitle}</div>
                    )}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: '#9ca3af' }}>
                        <span>{featCount} feature{featCount !== 1 ? 's' : ''}</span>
                        {isPublished && <span>Published {fmtDate(release.published_at)}</span>}
                        {!isPublished && <span>Created {fmtDate(release.created_at)}</span>}
                        {isPublished && <span style={{ color: '#6366f1' }}>{dismissed} user{dismissed !== 1 ? 's' : ''} seen it</span>}
                        {(release.target_plans?.length > 0) && (
                            <span>Plans: {release.target_plans.join(', ')}</span>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                    <button className="adm-btn-ghost"
                        style={{ fontSize: 11, padding: '5px 11px' }}
                        onClick={() => onEdit(release)}>
                        Edit
                    </button>
                    <button
                        className="adm-btn-ghost"
                        style={{
                            fontSize: 11, padding: '5px 11px',
                            color: isPublished ? '#f59e0b' : '#10b981',
                            borderColor: isPublished ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)',
                        }}
                        onClick={togglePublish}
                        disabled={loading}
                    >
                        {loading ? '…' : isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                    <button className="adm-btn-ghost"
                        style={{ fontSize: 11, padding: '5px 11px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                        onClick={() => onDelete(release.id)}>
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminReleases() {
    const [releases, setReleases]   = useState([]);
    const [loading, setLoading]     = useState(true);
    const [creating, setCreating]   = useState(false);
    const [editing, setEditing]     = useState(null);
    const [error, setError]         = useState('');

    const load = useCallback(() => {
        setLoading(true);
        releasesApi.list()
            .then(r => { setReleases(r.releases || []); setError(''); })
            .catch(e => setError(e?.response?.data?.detail || 'Failed to load'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    async function handleCreate(body) {
        await releasesApi.create(body);
        load();
        setCreating(false);
    }

    async function handleEdit(body) {
        await releasesApi.update(editing.id, body);
        load();
        setEditing(null);
    }

    async function handlePublish(id) {
        await releasesApi.publish(id);
        load();
    }

    async function handleUnpublish(id) {
        if (!confirm('Unpublish this release? Users who already dismissed it will not see it again even if republished.')) return;
        await releasesApi.unpublish(id);
        load();
    }

    async function handleDelete(id) {
        if (!confirm('Delete this release? This cannot be undone.')) return;
        await releasesApi.delete(id);
        setReleases(prev => prev.filter(r => r.id !== id));
    }

    const publishedCount = releases.filter(r => r.published_at).length;
    const draftCount = releases.filter(r => !r.published_at).length;

    return (
        <div>
            <div className="adm-page-title">What&apos;s New — Releases</div>
            {error && <div className="adm-error">{error}</div>}

            {/* Stats */}
            <div className="adm-cards" style={{ marginBottom: 20 }}>
                <div className="adm-card">
                    <div className="adm-card-label">Total</div>
                    <div className="adm-card-value">{releases.length}</div>
                    <div className="adm-card-sub">releases</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Published</div>
                    <div className="adm-card-value" style={{ color: publishedCount > 0 ? '#10b981' : undefined }}>{publishedCount}</div>
                    <div className="adm-card-sub">live to users</div>
                </div>
                <div className="adm-card">
                    <div className="adm-card-label">Drafts</div>
                    <div className="adm-card-value" style={{ color: draftCount > 0 ? '#f59e0b' : undefined }}>{draftCount}</div>
                    <div className="adm-card-sub">in progress</div>
                </div>
            </div>

            {/* How it works */}
            <div style={{
                background: 'rgba(16,185,129,0.05)',
                border: '1px solid rgba(16,185,129,0.18)',
                borderRadius: 12, padding: '14px 18px', marginBottom: 20,
                fontSize: 12, color: '#9ca3af', lineHeight: 1.65,
            }}>
                <span style={{ fontWeight: 700, color: '#10b981' }}>How it works: </span>
                Create a release in <strong>Draft</strong> mode. Build your feature list and use <strong>Preview modal</strong> to see exactly what users will see.
                Hit <strong>Publish</strong> to make it live — each eligible user sees it once in a beautiful popup, then it&apos;s dismissed forever.
            </div>

            {/* Edit form */}
            {editing && (
                <ReleaseForm
                    initial={editing}
                    onSave={handleEdit}
                    onCancel={() => setEditing(null)}
                />
            )}

            {/* Create form or button */}
            {!editing && (
                creating ? (
                    <ReleaseForm
                        initial={null}
                        onSave={handleCreate}
                        onCancel={() => setCreating(false)}
                    />
                ) : (
                    <div style={{ marginBottom: 20 }}>
                        <button className="adm-btn-primary" onClick={() => setCreating(true)}>
                            + New Release
                        </button>
                        <button className="adm-btn-ghost" style={{ marginLeft: 8 }} onClick={load}>
                            Refresh
                        </button>
                    </div>
                )
            )}

            {/* Releases list */}
            {loading ? (
                <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>Loading…</div>
            ) : releases.length === 0 ? (
                <div style={{
                    padding: 40, textAlign: 'center', fontSize: 13, color: '#9ca3af',
                    background: 'var(--adm-card)', border: '1px solid var(--adm-border)',
                    borderRadius: 14,
                }}>
                    No releases yet. Create your first release to announce new features to users.
                </div>
            ) : (
                releases.map(rel => (
                    <ReleaseCard
                        key={rel.id}
                        release={rel}
                        onEdit={r => { setCreating(false); setEditing(r); }}
                        onPublish={handlePublish}
                        onUnpublish={handleUnpublish}
                        onDelete={handleDelete}
                    />
                ))
            )}
        </div>
    );
}
