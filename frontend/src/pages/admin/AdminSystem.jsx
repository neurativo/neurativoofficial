import React, { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi.js';

const CSS = `
.adm-page-title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 24px; }
.adm-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
.adm-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 20px; }
.adm-card-title { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px; }
.adm-plan-row { display: flex; justify-content: space-between; align-items: baseline; padding: 10px 0; border-bottom: 1px solid #111; }
.adm-plan-row:last-child { border-bottom: none; }
.adm-plan-name { font-size: 13px; font-weight: 600; color: #e8e8e8; }
.adm-plan-pill { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; }
.adm-plan-free { background: #ffffff0f; color: #888; }
.adm-plan-student { background: #7c3aed22; color: #a78bfa; border: 1px solid #7c3aed44; }
.adm-plan-pro { background: #0369a122; color: #38bdf8; border: 1px solid #0369a144; }
.adm-limits-list { margin: 0; padding: 0; list-style: none; }
.adm-limits-list li { display: flex; justify-content: space-between; font-size: 12px; color: #888; padding: 5px 0; border-bottom: 1px solid #0d0d0d; }
.adm-limits-list li:last-child { border-bottom: none; }
.adm-limits-list .val { color: #c8c8c8; }
.adm-cleanup-row { display: flex; gap: 10px; align-items: center; }
.adm-input { padding: 8px 12px; background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 7px; color: #e8e8e8; font-size: 13px; outline: none; width: 80px; }
.adm-btn-primary { background: #7c3aed; color: #fff; padding: 8px 16px; border-radius: 7px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; }
.adm-btn-primary:hover { background: #6d28d9; }
.adm-btn-primary:disabled { opacity: 0.5; cursor: default; }
.adm-result { font-size: 12px; color: #888; }
.adm-section-title { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; margin-top: 28px; }
.adm-audit-wrap { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.adm-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #555; border-bottom: 1px solid #1e1e1e; background: #0f0f0f; text-transform: uppercase; letter-spacing: 0.06em; }
.adm-table td { padding: 10px 16px; border-bottom: 1px solid #111; color: #888; vertical-align: middle; }
.adm-table tr:last-child td { border-bottom: none; }
.adm-empty { text-align: center; padding: 24px; color: #444; }
.adm-action-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #1e1e1e; color: #888; }
.adm-action-delete { background: #7f1d1d22; color: #f87171; }
.adm-action-update { background: #7c3aed22; color: #a78bfa; }
.adm-action-cleanup { background: #065f4622; color: #34d399; }
@media (max-width: 800px) { .adm-two-col { grid-template-columns: 1fr; } }
`;

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
    return 'adm-action-badge';
}

export default function AdminSystem() {
    const [system, setSystem] = useState(null);
    const [cleanupDays, setCleanupDays] = useState(30);
    const [cleaning, setCleaning] = useState(false);
    const [cleanResult, setCleanResult] = useState('');

    useEffect(() => { adminApi.getSystem().then(setSystem); }, []);

    async function runCleanup() {
        setCleaning(true);
        setCleanResult('');
        try {
            const r = await adminApi.triggerCleanup(cleanupDays);
            setCleanResult(`✓ Deleted ${r.deleted_chunks ?? 0} chunks`);
            adminApi.getSystem().then(setSystem); // refresh audit log
        } catch {
            setCleanResult('Cleanup failed');
        } finally {
            setCleaning(false);
        }
    }

    const plans = system?.plan_limits || {};
    const auditLog = system?.audit_log || [];

    return (
        <div>
            <style>{CSS}</style>
            <div className="adm-page-title">System</div>

            <div className="adm-two-col">
                {Object.entries(plans).map(([tier, limits]) => (
                    <div className="adm-card" key={tier}>
                        <div className="adm-card-title">
                            <span className={`adm-plan-pill adm-plan-${tier}`}>{tier}</span>
                            {' '}Plan Limits
                        </div>
                        <ul className="adm-limits-list">
                            <li>
                                <span>Live lectures / month</span>
                                <span className="val">{fmtLimit(limits.live_lectures_per_month)}</span>
                            </li>
                            <li>
                                <span>Max live duration</span>
                                <span className="val">{fmtLimit(limits.live_max_duration_seconds)}</span>
                            </li>
                            <li>
                                <span>Audio uploads / month</span>
                                <span className="val">{fmtLimit(limits.uploads_per_month)}</span>
                            </li>
                            <li>
                                <span>Max upload duration</span>
                                <span className="val">{fmtLimit(limits.upload_max_duration_seconds)}</span>
                            </li>
                            <li>
                                <span>Max upload size</span>
                                <span className="val">{fmtLimit(limits.upload_max_bytes)}</span>
                            </li>
                        </ul>
                    </div>
                ))}
            </div>

            <div className="adm-card" style={{ marginBottom: 28 }}>
                <div className="adm-card-title">Storage Cleanup</div>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>
                    Delete lecture_chunks older than N days for lectures with completed summaries.
                    Reduces Supabase storage usage.
                </p>
                <div className="adm-cleanup-row">
                    <input
                        className="adm-input"
                        type="number"
                        min="1"
                        max="365"
                        value={cleanupDays}
                        onChange={e => setCleanupDays(Number(e.target.value))}
                    />
                    <span style={{ fontSize: 13, color: '#666' }}>days</span>
                    <button className="adm-btn-primary" onClick={runCleanup} disabled={cleaning}>
                        {cleaning ? 'Cleaning…' : 'Run Cleanup'}
                    </button>
                    {cleanResult && <span className="adm-result">{cleanResult}</span>}
                </div>
            </div>

            <div className="adm-section-title">Audit Log</div>
            <div className="adm-audit-wrap">
                <table className="adm-table">
                    <thead>
                        <tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Detail</th></tr>
                    </thead>
                    <tbody>
                        {!auditLog.length && (
                            <tr><td colSpan={5} className="adm-empty">No actions recorded yet.</td></tr>
                        )}
                        {auditLog.map((entry, i) => (
                            <tr key={i}>
                                <td style={{ whiteSpace: 'nowrap' }}>
                                    {new Date(entry.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{entry.admin_id?.slice(0, 14)}…</td>
                                <td><span className={actionClass(entry.action)}>{entry.action}</span></td>
                                <td style={{ fontFamily: 'monospace', fontSize: 10, color: '#555' }}>{entry.target_id?.slice(0, 14) || '—'}</td>
                                <td style={{ color: '#555' }}>{entry.detail || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
