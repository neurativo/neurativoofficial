import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const ACCEPTED = ['.mp3', '.m4a', '.wav', '.mp4', '.webm'];
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

const C = {
    bg: '#fafaf9', card: '#ffffff', text: '#1a1a1a', sec: '#6b6b6b',
    muted: '#a3a3a3', border: '#f0ede8', borderHov: '#e8e4de', dark: '#1a1a1a',
    accent: '#2563eb',
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
  .im-file-name { font-size: 13px; font-weight: 500; color: ${C.text}; margin: 0 0 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
  .im-file-size { font-size: 11px; color: ${C.muted}; margin: 0; }
  .im-file-remove { margin-left: auto; background: none; border: none; cursor: pointer; color: ${C.muted}; font-size: 18px; line-height: 1; padding: 0 2px; transition: color 0.12s; flex-shrink: 0; }
  .im-file-remove:hover { color: #ef4444; }

  /* Progress */
  .im-progress { margin-top: 16px; }
  .im-progress-label { font-size: 13px; color: ${C.sec}; margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
  .im-progress-label-dot { width: 6px; height: 6px; border-radius: 50%; background: ${C.accent}; animation: im-pulse 1.2s ease-in-out infinite; }
  @keyframes im-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  .im-progress-bar { height: 4px; background: ${C.border}; border-radius: 4px; overflow: hidden; }
  .im-progress-fill { height: 100%; background: ${C.accent}; border-radius: 4px; transition: width 0.4s ease; }

  /* Error */
  .im-error { font-size: 12px; color: #ef4444; margin-top: 10px; background: #fff5f5; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 12px; }

  /* Footer */
  .im-footer { display: flex; gap: 8px; margin-top: 20px; }
  .im-btn-cancel { flex: 1; padding: 10px; background: ${C.bg}; color: ${C.text}; font-size: 13px; border: 1px solid ${C.border}; border-radius: 10px; cursor: pointer; font-family: inherit; transition: border-color 0.15s; }
  .im-btn-cancel:hover { border-color: ${C.borderHov}; }
  .im-btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }
  .im-btn-submit { flex: 2; padding: 10px; background: ${C.dark}; color: #fafaf9; font-size: 13px; font-weight: 500; border: none; border-radius: 10px; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }
  .im-btn-submit:hover { opacity: 0.82; }
  .im-btn-submit:disabled { opacity: 0.45; cursor: not-allowed; }
`;

function fmtBytes(b) {
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const STAGES = [
    { key: 'uploading',    label: 'Uploading…',           pct: 20 },
    { key: 'transcribing', label: 'Transcribing audio…',  pct: 60 },
    { key: 'summarizing',  label: 'Generating summary…',  pct: 85 },
    { key: 'done',         label: 'Done!',                pct: 100 },
];

export default function ImportModal({ onClose }) {
    const navigate = useNavigate();
    const [file, setFile]       = useState(null);
    const [drag, setDrag]       = useState(false);
    const [stage, setStage]     = useState(null); // null | 'uploading' | 'transcribing' | 'summarizing' | 'done'
    const [error, setError]     = useState('');
    const inputRef = useRef(null);

    const stageInfo = STAGES.find(s => s.key === stage);

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
        if (!file || stage) return;
        setError('');

        const formData = new FormData();
        formData.append('file', file);

        try {
            setStage('uploading');
            // Brief pause to show uploading state before axios fires
            await new Promise(r => setTimeout(r, 300));

            setStage('transcribing');
            // POST to /api/v1/transcribe — this is where the real work happens
            const res = await api.post('/api/v1/transcribe', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (e) => {
                    // Upload done → show transcribing
                    if (e.loaded === e.total) setStage('transcribing');
                },
            });

            setStage('summarizing');
            // Trigger summarization
            const lectureId = res.data?.lecture_id;
            if (lectureId) {
                try { await api.post(`/api/v1/summarize/${lectureId}`); } catch { /* non-fatal */ }
            }

            setStage('done');
            await new Promise(r => setTimeout(r, 600));
            navigate(`/lecture/${lectureId}`);
        } catch (err) {
            const msg = err?.response?.data?.detail || err?.message || 'Import failed. Please try again.';
            setError(msg);
            setStage(null);
        }
    };

    const busy = stage !== null && stage !== 'done';

    return (
        <>
            <style>{CSS}</style>
            <div className="im-overlay" onClick={() => !busy && onClose()}>
                <div className="im-modal" onClick={e => e.stopPropagation()}>
                    <div className="im-header">
                        <div>
                            <p className="im-title">Import recording</p>
                            <p className="im-sub">MP3, M4A, WAV, MP4 or WebM · max 500 MB</p>
                        </div>
                        <button className="im-close" onClick={() => !busy && onClose()} disabled={busy}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>

                    <div className="im-body">
                        {/* Drop zone (hide when busy) */}
                        {!busy && (
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
                        )}

                        {/* Selected file info */}
                        {file && !busy && (
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

                        {/* Progress */}
                        {busy && stageInfo && (
                            <div className="im-progress">
                                <p className="im-progress-label">
                                    <span className="im-progress-label-dot" />
                                    {stageInfo.label}
                                </p>
                                <div className="im-progress-bar">
                                    <div className="im-progress-fill" style={{ width: `${stageInfo.pct}%` }} />
                                </div>
                                {file && (
                                    <p style={{ fontSize: 12, color: '#a3a3a3', marginTop: 8 }}>{file.name}</p>
                                )}
                            </div>
                        )}

                        {/* Error */}
                        {error && <div className="im-error">{error}</div>}

                        {/* Footer */}
                        <div className="im-footer">
                            <button className="im-btn-cancel" onClick={onClose} disabled={busy}>Cancel</button>
                            <button
                                className="im-btn-submit"
                                onClick={handleSubmit}
                                disabled={!file || busy}
                            >
                                {busy ? stageInfo?.label : 'Import and transcribe'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
