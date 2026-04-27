import React, { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi.js';


function fmtLimit(v) {
    if (v === null || v === undefined) return '∞';
    if (typeof v === 'number' && v > 1000000) return `${(v / 1024 / 1024 / 1024).toFixed(1)} GB`;
    if (typeof v === 'number' && v >= 3600) return `${(v / 3600).toFixed(1)}h`;
    if (typeof v === 'number' && v >= 60) return `${Math.floor(v / 60)}m`;
    return String(v);
}

function actionClass(action) {
    if (action?.includes('delete')) return 'adm-action-badge adm-action-delete';
    if (action?.includes('update')) return 'adm-action-badge adm-action-update';
    if (action?.includes('cleanup')) return 'adm-action-badge adm-action-cleanup';
    if (action?.includes('suspend')) return 'adm-action-badge adm-action-suspend';
    return 'adm-action-badge';
}

const ACTION_OPTIONS = ['', 'delete_user', 'delete_lecture', 'update_plan', 'cleanup_chunks', 'suspend_user', 'unsuspend_user'];

export default function AdminSystem() {
    const [system, setSystem] = useState(null);
    const [editedLimits, setEditedLimits] = useState({});
    const [saving, setSaving] = useState({});
    const [saveResult, setSaveResult] = useState({});
    const [cleanupDays, setCleanupDays] = useState(0);
    const [cleaning, setCleaning] = useState(false);
    const [cleanResult, setCleanResult] = useState('');

    // Audit log state
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditTotal, setAuditTotal] = useState(0);
    const [auditPage, setAuditPage] = useState(1);
    const [auditAction, setAuditAction] = useState('');
    const [auditLoading, setAuditLoading] = useState(false);
    const PAGE_SIZE = 50;

    useEffect(() => { adminApi.getSystem().then(setSystem); }, []);

    useEffect(() => {
        setAuditLoading(true);
        adminApi.getAuditLog({ page: auditPage, page_size: PAGE_SIZE, action: auditAction })
            .then(r => { setAuditLogs(r.logs || []); setAuditTotal(r.total || 0); })
            .catch(() => {})
            .finally(() => setAuditLoading(false));
    }, [auditPage, auditAction]);

    async function runCleanup() {
        setCleaning(true);
        setCleanResult('');
        try {
            const r = await adminApi.triggerCleanup(cleanupDays);
            setCleanResult(`✓ Deleted ${r.deleted_chunks ?? 0} chunks`);
            adminApi.getSystem().then(setSystem);
            // Refresh audit log to show cleanup entry
            adminApi.getAuditLog({ page: 1, page_size: PAGE_SIZE, action: auditAction })
                .then(r => { setAuditLogs(r.logs || []); setAuditTotal(r.total || 0); setAuditPage(1); });
        } catch {
            setCleanResult('Cleanup failed');
        } finally {
            setCleaning(false);
        }
    }

    const plans = system?.plan_limits || {};
    const totalPages = Math.ceil(auditTotal / PAGE_SIZE);

    const NUMERIC_LIMIT_KEYS = [
        { key: 'live_lectures_per_month',     label: 'Live lectures / month' },
        { key: 'live_max_duration_seconds',   label: 'Max live duration (sec)' },
        { key: 'uploads_per_month',           label: 'Uploads / month' },
        { key: 'upload_max_duration_seconds', label: 'Max upload duration (sec)' },
        { key: 'upload_max_bytes',            label: 'Max upload bytes' },
        { key: 'total_minutes_per_month',     label: 'Total minutes / month' },
    ];
    const FEATURE_FLAG_KEYS = [
        'pdf_export', 'qa_enabled', 'sharing', 'multilingual',
        'visual_capture', 'flashcards', 'action_items',
        'speaker_diarization', 'lecture_comparison', 'bulk_export',
        'api_access', 'global_search', 'spaced_repetition', 'priority_processing',
    ];

    function getLimitEdit(tier, key, fallback) {
        return editedLimits[tier]?.[key] !== undefined ? editedLimits[tier][key] : fallback;
    }
    function setLimitEdit(tier, key, val) {
        setEditedLimits(prev => ({ ...prev, [tier]: { ...(prev[tier] || {}), [key]: val } }));
    }
    async function saveLimits(tier) {
        const changes = editedLimits[tier];
        if (!changes || !Object.keys(changes).length) return;
        setSaving(prev => ({ ...prev, [tier]: true }));
        setSaveResult(prev => ({ ...prev, [tier]: '' }));
        try {
            await adminApi.updatePlanLimits(tier, changes);
            setSaveResult(prev => ({ ...prev, [tier]: '✓ Saved' }));
            const fresh = await adminApi.getSystem();
            setSystem(fresh);
            setEditedLimits(prev => ({ ...prev, [tier]: {} }));
        } catch {
            setSaveResult(prev => ({ ...prev, [tier]: '✗ Failed' }));
        } finally {
            setSaving(prev => ({ ...prev, [tier]: false }));
            setTimeout(() => setSaveResult(prev => ({ ...prev, [tier]: '' })), 3000);
        }
    }

    return (
        <div>
            <div className="adm-page-title">System</div>

            <div className="adm-two-col" style={{ marginBottom: 28 }}>
                {Object.entries(plans).map(([tier, limits]) => (
                    <div className="adm-card" key={tier}>
                        <div className="adm-card-title">
                            <span className={`adm-plan-pill adm-plan-${tier}`}>{tier}</span>
                            {' '}Plan Limits
                        </div>

                        {NUMERIC_LIMIT_KEYS.map(({ key, label }) => {
                            const raw = getLimitEdit(tier, key, limits[key]);
                            return (
                                <div className="adm-limit-row" key={key}>
                                    <span className="adm-limit-label">{label}</span>
                                    <input
                                        className="adm-limit-input"
                                        type="number"
                                        min="0"
                                        placeholder="∞"
                                        value={raw === null || raw === undefined ? '' : raw}
                                        onChange={e => {
                                            const v = e.target.value === '' ? null : Number(e.target.value);
                                            setLimitEdit(tier, key, v);
                                        }}
                                    />
                                </div>
                            );
                        })}

                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0ede8' }}>
                            <div style={{ fontSize: 11, color: '#a3a3a3', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Feature flags</div>
                            {FEATURE_FLAG_KEYS.map(key => {
                                const val = getLimitEdit(tier, key, limits[key]);
                                return (
                                    <div className="adm-limit-row" key={key}>
                                        <span className="adm-limit-label">{key.replace(/_/g, ' ')}</span>
                                        <input
                                            className="adm-limit-checkbox"
                                            type="checkbox"
                                            checked={!!val}
                                            onChange={e => setLimitEdit(tier, key, e.target.checked)}
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        <div className="adm-card-footer">
                            {saveResult[tier] && <span className="adm-save-result">{saveResult[tier]}</span>}
                            <button
                                className="adm-btn-primary"
                                onClick={() => saveLimits(tier)}
                                disabled={saving[tier] || !editedLimits[tier] || !Object.keys(editedLimits[tier] || {}).length}
                            >
                                {saving[tier] ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="adm-card" style={{ marginBottom: 28 }}>
                <div className="adm-card-title">Storage Cleanup</div>
                <p style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 14, lineHeight: 1.6 }}>
                    Deletes raw <code style={{ fontFamily: 'monospace', fontSize: 12 }}>lecture_chunks</code> for
                    lectures that have a completed summary — chunks are never used again after summarisation finishes.
                    Set min age to 0 to clean all completed lectures, or enter a number to skip lectures newer than N days.
                </p>
                <div className="adm-cleanup-row">
                    <span style={{ fontSize: 13, color: '#6b6b6b' }}>Min age</span>
                    <input className="adm-input" type="number" min="0" max="365"
                        value={cleanupDays} onChange={e => setCleanupDays(Number(e.target.value))} />
                    <span style={{ fontSize: 13, color: '#6b6b6b' }}>days</span>
                    <button className="adm-btn-primary" onClick={runCleanup} disabled={cleaning}>
                        {cleaning ? 'Cleaning…' : 'Run Cleanup'}
                    </button>
                    {cleanResult && <span className="adm-result">{cleanResult}</span>}
                </div>
            </div>

            <div className="adm-section-title">
                Audit Log {auditTotal > 0 && <span style={{ color: '#a3a3a3', fontWeight: 400 }}>— {auditTotal} entries</span>}
            </div>
            <div className="adm-audit-wrap">
                <div className="adm-audit-toolbar">
                    <span style={{ fontSize: 12, color: '#a3a3a3' }}>Filter by action:</span>
                    <select className="adm-audit-select" value={auditAction}
                        onChange={e => { setAuditAction(e.target.value); setAuditPage(1); }}>
                        {ACTION_OPTIONS.map(a => (
                            <option key={a} value={a}>{a || 'All actions'}</option>
                        ))}
                    </select>
                </div>
                <table className="adm-table">
                    <thead>
                        <tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Detail</th></tr>
                    </thead>
                    <tbody>
                        {auditLoading && (
                            <tr><td colSpan={5} className="adm-empty">Loading…</td></tr>
                        )}
                        {!auditLoading && !auditLogs.length && (
                            <tr><td colSpan={5} className="adm-empty">No actions recorded yet.</td></tr>
                        )}
                        {!auditLoading && auditLogs.map((entry, i) => (
                            <tr key={entry.id ?? i}>
                                <td style={{ whiteSpace: 'nowrap' }}>
                                    {new Date(entry.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{entry.admin_id?.slice(0, 14)}…</td>
                                <td><span className={actionClass(entry.action)}>{entry.action}</span></td>
                                <td style={{ fontFamily: 'monospace', fontSize: 10, color: '#a3a3a3' }}>{entry.target_id?.slice(0, 14) || '—'}</td>
                                <td style={{ color: '#a3a3a3' }}>{entry.detail || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {totalPages > 1 && (
                    <div className="adm-pagination" style={{ borderTop: '1px solid #f0ede8' }}>
                        <button className="adm-btn-ghost" disabled={auditPage <= 1}
                            onClick={() => setAuditPage(p => p - 1)}>← Prev</button>
                        <span>{auditPage} / {totalPages}</span>
                        <button className="adm-btn-ghost" disabled={auditPage >= totalPages}
                            onClick={() => setAuditPage(p => p + 1)}>Next →</button>
                    </div>
                )}
            </div>
        </div>
    );
}
