import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const ACCEPTED = ['.mp3', '.m4a', '.wav', '.mp4', '.webm'];
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

const KNOWN_TOPICS_LIST = [
    'medicine','law','physics','computer science','history','mathematics',
    'economics','literature','chemistry','biology','psychology','philosophy',
    'engineering','business','linguistics','political science','sociology',
    'art','music','architecture',
];

const C = {
    bg: 'var(--color-bg)', card: 'var(--color-card)', text: 'var(--color-text)', sec: 'var(--color-sec)',
    muted: 'var(--color-muted)', border: 'var(--color-border)', borderHov: 'var(--color-border-hov)', dark: 'var(--color-dark)',
    accent: '#2563eb',
};

// Map job/summary statuses → { label, pct }
const STATUS_MAP = {
    uploading:    { label: 'Uploading your file…',        pct: 12 },
    queued:       { label: 'Processing audio…',           pct: 25 },
    importing:    { label: 'Processing audio…',           pct: 32 },
    transcribing: { label: 'Transcribing your lecture…',  pct: 55 },
    cleaning:     { label: 'Building your notes…',        pct: 72 },
    generating:   { label: 'Building your notes…',        pct: 83 },
    summarizing:  { label: 'Building your notes…',        pct: 83 },
    storing:      { label: 'Almost done…',                pct: 93 },
    done:         { label: 'Your notes are ready!',       pct: 100 },
};

const CSS = `
  .im-overlay { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.35); backdrop-filter: blur(5px); padding: 16px; }
  .im-modal { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 18px; width: 100%; max-width: 480px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.12); font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
  .im-header { padding: 22px 24px 0; display: flex; align-items: flex-start; justify-content: space-between; }
  .im-title { font-size: 16px; font-weight: 600; color: ${C.text}; letter-spacing: -0.4px; margin: 0; }
  .im-sub { font-size: 13px; color: ${C.muted}; margin: 4px 0 0; }
  .im-close { width: 28px; height: 28px; border-radius: 8px; background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: ${C.muted}; transition: background 0.12s, color 0.12s; flex-shrink: 0; }
  .im-close:hover { background: ${C.bg}; color: ${C.text}; }
  .im-body { padding: 20px 24px 24px; }

  /* Drop zone */
  .im-drop { border: 2px dashed ${C.borderHov}; border-radius: 14px; padding: 36px 20px; text-align: center; cursor: pointer; transition: border-color 0.15s, background 0.15s; position: relative; }
  .im-drop:hover, .im-drop.drag { border-color: ${C.accent}; background: #eff6ff; }
  .im-drop-icon { width: 40px; height: 40px; background: ${C.bg}; border: 1px solid ${C.border}; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; color: ${C.sec}; }
  .im-drop-title { font-size: 14px; font-weight: 500; color: ${C.text}; margin: 0 0 4px; }
  .im-drop-sub { font-size: 12px; color: ${C.muted}; margin: 0; }
  .im-drop-sub b { color: ${C.sec}; font-weight: 500; }
  .im-file-input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }

  /* Selected file */
  .im-file-info { display: flex; align-items: center; gap: 12px; background: ${C.bg}; border: 1px solid ${C.border}; border-radius: 12px; padding: 12px 14px; margin-top: 12px; }
  .im-file-icon { width: 36px; height: 36px; background: #eff6ff; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: ${C.accent}; }
  .im-file-name { font-size: 13px; font-weight: 500; color: ${C.text}; margin: 0 0 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: min(260px, 100%); }
  .im-file-size { font-size: 11px; color: ${C.muted}; margin: 0; }
  .im-file-remove { margin-left: auto; background: none; border: none; cursor: pointer; color: ${C.muted}; font-size: 18px; line-height: 1; padding: 0 2px; transition: color 0.12s; flex-shrink: 0; }
  .im-file-remove:hover { color: #ef4444; }

  /* ── Processing state ── */
  .im-processing { display: flex; flex-direction: column; align-items: center; padding: 8px 0 4px; text-align: center; }

  /* Spinner ring */
  @keyframes im-spin { to { transform: rotate(360deg); } }
  @keyframes im-done-pop { 0% { transform: scale(0.7); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
  .im-ring-wrap { position: relative; width: 64px; height: 64px; margin-bottom: 20px; }
  .im-ring { width: 64px; height: 64px; border-radius: 50%; border: 2.5px solid ${C.border}; border-top-color: ${C.accent}; animation: im-spin 0.9s linear infinite; }
  .im-ring.done { border-color: #22c55e; border-top-color: #22c55e; animation: none; }
  .im-ring-icon { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }

  /* Status text */
  .im-status-label { font-size: 15px; font-weight: 600; color: ${C.text}; letter-spacing: -0.3px; margin: 0 0 6px; transition: opacity 0.3s; }
  .im-status-label.done { color: #16a34a; }
  .im-status-file { font-size: 12px; color: ${C.muted}; margin: 0 0 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: min(320px, 100%); }

  /* Progress bar */
  .im-bar-wrap { width: 100%; }
  .im-bar-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .im-bar-pct { font-size: 11px; font-weight: 600; color: ${C.muted}; font-family: monospace; }
  .im-bar { height: 3px; background: ${C.border}; border-radius: 99px; overflow: hidden; }
  .im-bar-fill { height: 100%; border-radius: 99px; background: ${C.accent}; transition: width 0.8s cubic-bezier(0.4,0,0.2,1); }
  .im-bar-fill.done { background: #22c55e; }

  /* Safe-to-close notice */
  @keyframes im-fade-up { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .im-safe-notice { margin-top: 18px; background: ${C.bg}; border: 1px solid ${C.border}; border-radius: 12px; padding: 12px 14px; text-align: left; animation: im-fade-up 0.3s ease; }
  .im-safe-notice-row { display: flex; align-items: flex-start; gap: 9px; }
  .im-safe-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; margin-top: 5px; flex-shrink: 0; }
  .im-safe-text { font-size: 12px; color: ${C.sec}; line-height: 1.55; margin: 0; }
  .im-safe-btn { margin-top: 10px; width: 100%; padding: 9px; background: none; border: 1px solid ${C.border}; border-radius: 9px; font-size: 12px; font-weight: 500; color: ${C.text}; cursor: pointer; font-family: inherit; transition: border-color 0.15s, background 0.15s; }
  .im-safe-btn:hover { border-color: ${C.borderHov}; background: ${C.bg}; }

  /* Error */
  .im-error { font-size: 12px; color: #ef4444; margin-top: 10px; background: #fff5f5; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 12px; }

  /* No-credits inline card */
  .im-no-credits { margin-top: 12px; background: #fefce8; border: 1px solid #fde68a; border-radius: 12px; padding: 14px 16px; }
  .im-no-credits-title { font-size: 13px; font-weight: 600; color: #92400e; margin: 0 0 4px; }
  .im-no-credits-body { font-size: 12px; color: #78350f; margin: 0 0 10px; line-height: 1.5; }
  .im-no-credits-hint { font-size: 11px; color: #a16207; margin: 0 0 10px; }
  .im-no-credits-btn { display: inline-block; padding: 7px 14px; background: #d97706; color: #fff; font-size: 12px; font-weight: 600; border: none; border-radius: 8px; cursor: pointer; font-family: 'Inter', sans-serif; transition: opacity 0.15s; }
  .im-no-credits-btn:hover { opacity: 0.85; }
  .dark .im-no-credits { background: rgba(253,230,138,0.08); border-color: rgba(253,230,138,0.25); }
  .dark .im-no-credits-title { color: #fbbf24; }
  .dark .im-no-credits-body { color: #fcd34d; }
  .dark .im-no-credits-hint { color: #f59e0b; }
  .dark .im-no-credits-btn { background: #b45309; }

  /* Footer */
  .im-footer { display: flex; gap: 8px; margin-top: 20px; }
  .im-btn-cancel { flex: 1; padding: 10px; background: ${C.bg}; color: ${C.text}; font-size: 13px; border: 1px solid ${C.border}; border-radius: 10px; cursor: pointer; font-family: inherit; transition: border-color 0.15s; }
  .im-btn-cancel:hover { border-color: ${C.borderHov}; }
  .im-btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }
  .im-btn-submit { flex: 2; padding: 10px; background: ${C.dark}; color: #fafaf9; font-size: 13px; font-weight: 500; border: none; border-radius: 10px; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }
  .im-btn-submit:hover { opacity: 0.82; }
  .im-btn-submit:disabled { opacity: 0.45; cursor: not-allowed; }

  /* Domain picker */
  .im-domain-section { margin-top: 14px; }
  .im-domain-label { font-size: 12px; font-weight: 500; color: var(--color-sec); margin-bottom: 8px; }
  .im-domain-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .im-domain-pill { padding: 6px 4px; border-radius: 8px; border: 1.5px solid var(--color-border); background: none; cursor: pointer; font-size: 11px; font-weight: 500; color: var(--color-text); text-align: center; transition: all 0.12s; text-transform: capitalize; font-family: 'Inter', sans-serif; }
  .im-domain-pill:hover { border-color: #6366f1; color: #6366f1; }
  .im-domain-pill.active { background: #f3f0ff; border-color: #6366f1; color: #6366f1; }

  /* ── Mobile ── */
  @media (max-width: 440px) {
    .im-body { padding: 16px 18px 20px; }
    .im-header { padding: 18px 18px 0; }
    .im-drop { padding: 28px 14px; }
    .im-ring-wrap { width: 52px; height: 52px; margin-bottom: 16px; }
    .im-ring { width: 52px; height: 52px; }
    .im-status-label { font-size: 14px; }
    .im-domain-grid { grid-template-columns: repeat(2, 1fr); }
    .im-footer { flex-direction: column; }
    .im-btn-cancel, .im-btn-submit { flex: none; width: 100%; }
  }

  /* ── Dark mode ── */
  .dark .im-drop:hover, .dark .im-drop.drag { background: #0f1e38; border-color: #3b82f6; }
  .dark .im-file-icon { background: #0f1e38; }
  .dark .im-error { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #f87171; }
  .dark .im-btn-submit { color: var(--color-dark-fg); }
  .dark .im-ring { border-color: var(--color-border); border-top-color: #60a5fa; }
  .dark .im-bar-fill { background: #60a5fa; }
  .dark .im-domain-pill.active { background: rgba(99,102,241,0.15); }
`;

function fmtBytes(b) {
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// Spinner when processing, checkmark when done
function RingIcon({ isDone }) {
    if (isDone) {
        return (
            <div className="im-ring-wrap">
                <div className="im-ring done" />
                <div className="im-ring-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'im-done-pop 0.35s ease' }}>
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </div>
            </div>
        );
    }
    return (
        <div className="im-ring-wrap">
            <div className="im-ring" />
        </div>
    );
}

export default function ImportModal({ onClose, onImportStarted }) {
    const navigate = useNavigate();
    const [file, setFile]                   = useState(null);
    const [drag, setDrag]                   = useState(false);
    const [jobStatus, setJobStatus]         = useState(null);  // raw backend status key
    const [pct, setPct]                     = useState(0);
    const [statusLabel, setStatusLabel]     = useState('');
    const [lectureId, setLectureId]         = useState(null);
    const [uploadDone, setUploadDone]       = useState(false); // show safe-to-close notice
    const [error, setError]                 = useState('');
    const [usage, setUsage]                 = useState(null);
    const [selectedDomain, setSelectedDomain] = useState('');
    const inputRef  = useRef(null);
    const pollingRef = useRef(false);

    useEffect(() => {
        api.get('/api/v1/usage').then(res => setUsage(res.data)).catch(() => {});
    }, []);

    const applyStatus = (key) => {
        const info = STATUS_MAP[key];
        if (!info) return;
        setJobStatus(key);
        setStatusLabel(info.label);
        setPct(info.pct);
    };

    const pickFile = useCallback((f) => {
        setError('');
        if (!f) return;
        const ext = '.' + f.name.split('.').pop().toLowerCase();
        if (!ACCEPTED.includes(ext)) {
            setError(`Unsupported format. Please use: ${ACCEPTED.join(', ')}`);
            return;
        }
        if (f.size > MAX_BYTES) {
            setError('File exceeds 500 MB limit.');
            return;
        }
        setFile(f);
    }, []);

    const onDrop = (e) => {
        e.preventDefault();
        setDrag(false);
        pickFile(e.dataTransfer.files[0]);
    };

    const onInputChange = (e) => pickFile(e.target.files[0]);

    const handleSubmit = async () => {
        if (!file || jobStatus) return;
        setError('');

        const formData = new FormData();
        formData.append('file', file);
        if (selectedDomain) formData.append('topic', selectedDomain);

        try {
            applyStatus('uploading');

            const res = await api.post('/api/v1/transcribe', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (e) => {
                    // Smooth upload progress within the uploading band (0–12%)
                    if (e.total) {
                        const uploadPct = Math.round((e.loaded / e.total) * 12);
                        setPct(Math.max(uploadPct, 2));
                    }
                    if (e.loaded >= e.total) applyStatus('queued');
                },
                timeout: 120_000,
            });

            const id = res.data?.lecture_id;
            setLectureId(id);
            setUploadDone(true);  // file is on the server — safe to close
            if (id && onImportStarted) onImportStarted(id);
            applyStatus('queued');

            // Dual polling: jobs API (granular) + lectures API (final status)
            pollingRef.current = true;
            const POLL_MS  = 3000;
            const MAX_WAIT = 20 * 60 * 1000;
            const deadline = Date.now() + MAX_WAIT;

            while (pollingRef.current && Date.now() < deadline) {
                await new Promise(r => setTimeout(r, POLL_MS));
                try {
                    // Jobs API — granular stage
                    try {
                        const job = await api.get(`/api/v1/jobs/${id}`);
                        const s = job.data?.status;
                        if (s && STATUS_MAP[s]) applyStatus(s);
                        if (s === 'failed') {
                            setError(job.data?.error || 'Processing failed. Please try again.');
                            setJobStatus('failed');
                            return;
                        }
                    } catch { /* jobs endpoint optional */ }

                    // Lectures API — final gate
                    const check = await api.get(`/api/v1/lectures/${id}`);
                    const summaryStatus = check.data?.summary_status;

                    if (summaryStatus === 'summarizing') applyStatus('generating');

                    if (summaryStatus === 'final') {
                        applyStatus('done');
                        await new Promise(r => setTimeout(r, 900));
                        navigate(`/lecture/${id}`);
                        return;
                    }

                    // Legacy backend without summary_status
                    const transcript = check.data?.transcript;
                    if (!summaryStatus && transcript && transcript.length > 10) {
                        applyStatus('generating');
                        await new Promise(r => setTimeout(r, 5000));
                        applyStatus('done');
                        await new Promise(r => setTimeout(r, 900));
                        navigate(`/lecture/${id}`);
                        return;
                    }
                } catch { /* keep polling */ }
            }

            // Timed out — tell user to check dashboard
            setError('Transcription is taking longer than expected. Your lecture will appear in the dashboard once it finishes.');
            setJobStatus(null);
            setPct(0);

        } catch (err) {
            const status = err?.response?.status;
            const detail = err?.response?.data?.detail;
            let msg;
            if (status === 402) {
                const required = detail?.required ?? 1;
                const have     = detail?.credits  ?? 0;
                msg = `__no_credits__:${required}:${have}`;
            } else if (status === 403 && detail?.error === 'upload_limit_reached') {
                const resetDate = detail.resets_at
                    ? new Date(detail.resets_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
                    : 'next month';
                msg = `You've used all ${detail.limit} free imports this month. Imports reset on ${resetDate}.`;
            } else if (status === 413 && detail?.error === 'file_too_large') {
                const mb = detail.max_bytes ? Math.round(detail.max_bytes / (1024 * 1024)) : 500;
                msg = `This file exceeds your plan limit of ${mb} MB. Upgrade to import larger files.`;
            } else {
                msg = (typeof detail === 'string' ? detail : null) || err?.message || 'Import failed. Please try again.';
            }
            setError(msg);
            setJobStatus(null);
            setPct(0);
        }
    };

    // Stop polling when modal closes
    const handleClose = () => {
        pollingRef.current = false;
        onClose();
    };

    const isProcessing = jobStatus && jobStatus !== 'done' && jobStatus !== 'failed';
    const isDone       = jobStatus === 'done';

    return (
        <>
            <style>{CSS}</style>
            <div className="im-overlay" onClick={() => !isProcessing && handleClose()}>
                <div className="im-modal" onClick={e => e.stopPropagation()}>

                    {/* Header — hide during processing to give status more room */}
                    {!isProcessing && !isDone && (
                        <div className="im-header">
                            <div>
                                <p className="im-title">Import recording</p>
                                <p className="im-sub">MP3, M4A, WAV, MP4 or WebM · max 500 MB</p>
                            </div>
                            <button className="im-close" onClick={handleClose}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                    )}

                    <div className="im-body">

                        {/* ── Processing / done state ── */}
                        {(isProcessing || isDone) && (
                            <div className="im-processing">
                                <RingIcon isDone={isDone} />

                                <p className={`im-status-label${isDone ? ' done' : ''}`}>
                                    {statusLabel}
                                </p>
                                {file && (
                                    <p className="im-status-file">
                                        {file.name} · {fmtBytes(file.size)}
                                    </p>
                                )}

                                {/* Progress bar */}
                                <div className="im-bar-wrap">
                                    <div className="im-bar-row">
                                        <span style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Progress</span>
                                        <span className="im-bar-pct">{pct}%</span>
                                    </div>
                                    <div className="im-bar">
                                        <div className={`im-bar-fill${isDone ? ' done' : ''}`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>

                                {/* Safe-to-close notice (appears once file is on server) */}
                                {uploadDone && !isDone && (
                                    <div className="im-safe-notice">
                                        <div className="im-safe-notice-row">
                                            <div className="im-safe-dot" />
                                            <p className="im-safe-text">
                                                Your file is processing on our servers — you can safely close this and your lecture will appear in the dashboard when ready.
                                            </p>
                                        </div>
                                        <button
                                            className="im-safe-btn"
                                            onClick={() => { pollingRef.current = false; navigate('/app'); onClose(); }}
                                        >
                                            Open dashboard
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Idle state ── */}
                        {!isProcessing && !isDone && (
                            <>
                                {/* Drop zone */}
                                <div
                                    className={`im-drop${drag ? ' drag' : ''}`}
                                    onDragOver={e => { e.preventDefault(); setDrag(true); }}
                                    onDragLeave={() => setDrag(false)}
                                    onDrop={onDrop}
                                    onClick={() => !file && inputRef.current?.click()}
                                >
                                    <input
                                        ref={inputRef}
                                        type="file"
                                        accept={ACCEPTED.join(',')}
                                        className="im-file-input"
                                        onChange={onInputChange}
                                        style={{ pointerEvents: file ? 'none' : 'auto' }}
                                    />
                                    <div className="im-drop-icon">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                                        </svg>
                                    </div>
                                    <p className="im-drop-title">{file ? 'Drop to replace' : 'Drag & drop your audio file'}</p>
                                    <p className="im-drop-sub">or <b>click to browse</b></p>
                                </div>

                                {/* Plan limit hint */}
                                {usage && (
                                    <p style={{ fontSize: 12, color: C.muted, marginTop: 10, textAlign: 'center' }}>
                                        {usage.plan_tier === 'free'
                                            ? `Free plan: up to ${usage.upload_max_duration_label || '60 min'} audio · ${usage.uploads_limit ?? 3} imports/month (${usage.uploads_this_month} used)`
                                            : usage.plan_tier === 'student'
                                            ? `Student plan: up to ${usage.upload_max_duration_label || '3 hours'} · Unlimited imports`
                                            : 'Pro plan: unlimited imports · any file size'
                                        }
                                    </p>
                                )}

                                {/* Selected file info */}
                                {file && (
                                    <div className="im-file-info">
                                        <div className="im-file-icon">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                                            </svg>
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p className="im-file-name">{file.name}</p>
                                            <p className="im-file-size">{fmtBytes(file.size)}</p>
                                        </div>
                                        <button className="im-file-remove" onClick={() => { setFile(null); setError(''); }}>×</button>
                                    </div>
                                )}

                                {/* Domain picker */}
                                {file && (
                                    <div className="im-domain-section">
                                        <p className="im-domain-label">Field (optional — AI detects if blank)</p>
                                        <div className="im-domain-grid">
                                            {KNOWN_TOPICS_LIST.map(t => (
                                                <button
                                                    key={t}
                                                    className={`im-domain-pill${selectedDomain === t ? ' active' : ''}`}
                                                    onClick={() => setSelectedDomain(d => d === t ? '' : t)}
                                                >
                                                    {t}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Error / no-credits */}
                                {error && (() => {
                                    if (error.startsWith('__no_credits__:')) {
                                        const [, req, have] = error.split(':');
                                        return (
                                            <div className="im-no-credits">
                                                <p className="im-no-credits-title">Not enough credits</p>
                                                <p className="im-no-credits-body">
                                                    This import needs <strong>{req} credit{Number(req) !== 1 ? 's' : ''}</strong>.
                                                    You have <strong>{have}</strong>.
                                                </p>
                                                <p className="im-no-credits-hint">1 credit = up to 30 min · 2-hr lecture = 4 credits</p>
                                                <button className="im-no-credits-btn" onClick={() => { onClose(); navigate('/credits'); }}>
                                                    Buy credits →
                                                </button>
                                            </div>
                                        );
                                    }
                                    return <div className="im-error">{error}</div>;
                                })()}

                                {/* Footer */}
                                <div className="im-footer">
                                    <button className="im-btn-cancel" onClick={handleClose}>Cancel</button>
                                    <button
                                        className="im-btn-submit"
                                        onClick={handleSubmit}
                                        disabled={!file}
                                    >
                                        Import and transcribe
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
