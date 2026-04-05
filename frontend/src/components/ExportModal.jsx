import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

const STAGES = [
    { pct:  8, msg: 'Compiling lecture report...' },
    { pct: 18, msg: 'Analysing transcript...' },
    { pct: 30, msg: 'Building section summaries...' },
    { pct: 44, msg: 'Generating executive summary...' },
    { pct: 57, msg: 'Enriching glossary...' },
    { pct: 68, msg: 'Preparing Q&A review...' },
    { pct: 78, msg: 'Rendering PDF layout...' },
    { pct: 88, msg: 'Applying cover page...' },
    { pct: 97, msg: 'Finalising document...' },
];

export default function ExportModal({ lectureId, onClose }) {
    const [progress, setProgress] = useState(STAGES[0].pct);
    const [status,   setStatus]   = useState(STAGES[0].msg);
    const [phase,    setPhase]    = useState('loading'); // loading | success | error
    const [errorMsg, setErrorMsg] = useState('');

    const runExport = useCallback(async () => {
        setPhase('loading');
        setProgress(STAGES[0].pct);
        setStatus(STAGES[0].msg);
        setErrorMsg('');

        let stageIdx = 0;
        const interval = setInterval(() => {
            stageIdx = Math.min(stageIdx + 1, STAGES.length - 1);
            setProgress(STAGES[stageIdx].pct);
            setStatus(STAGES[stageIdx].msg);
        }, 2500);

        try {
            const res = await api.get(`/api/v1/lectures/${lectureId}/export/pdf`, { responseType: 'blob' });
            clearInterval(interval);
            setProgress(100);
            setStatus('Your report is ready!');
            setPhase('success');

            setTimeout(() => {
                const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = 'Neurativo_Report.pdf';
                a.click();
                window.URL.revokeObjectURL(url);
                setTimeout(() => onClose(), 1600);
            }, 400);
        } catch (err) {
            clearInterval(interval);
            const msg = err?.response?.data?.detail || err?.message || 'Unknown error';
            setProgress(-1);
            setStatus('Export failed');
            setPhase('error');
            setErrorMsg(msg);
        }
    }, [lectureId, onClose]);

    useEffect(() => { runExport(); }, [runExport]);

    // Close on Escape (only when not loading)
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape' && phase !== 'loading') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [phase, onClose]);

    const isLoading = phase === 'loading';
    const isSuccess = phase === 'success';
    const isError   = phase === 'error';

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 100,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 24,
                background: 'rgba(10,10,10,0.45)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                animation: 'em-fade 0.18s ease',
            }}
            onClick={() => !isLoading && onClose()}
        >
            <style>{`
                @keyframes em-fade { from { opacity:0; } to { opacity:1; } }
                @keyframes em-up   { from { opacity:0; transform:translateY(10px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
                @keyframes em-spin { to { transform: rotate(360deg); } }
                @keyframes em-bar  { from { width:0; } to { width:100%; } }
            `}</style>

            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 20,
                    padding: '36px 32px 28px',
                    width: '100%',
                    maxWidth: 360,
                    animation: 'em-up 0.22s ease',
                    fontFamily: 'Inter, sans-serif',
                }}
            >
                {/* Icon */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 16,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isSuccess ? '#f0fdf4' : isError ? 'rgba(239,68,68,0.1)' : 'var(--color-bg)',
                        border: `1px solid ${isSuccess ? '#bbf7d0' : isError ? 'rgba(239,68,68,0.3)' : 'var(--color-border)'}`,
                        transition: 'background 0.3s, border-color 0.3s',
                    }}>
                        {isLoading && (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"
                                style={{ animation: 'em-spin 1.1s linear infinite', transformOrigin: 'center' }}>
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                        )}
                        {isSuccess && (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                        {isError && (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="#ef4444"/>
                            </svg>
                        )}
                    </div>
                </div>

                {/* Title */}
                <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text)', textAlign: 'center', letterSpacing: '-0.4px', margin: '0 0 4px' }}>
                    {isSuccess ? 'Export Ready' : isError ? 'Export Failed' : 'Generating PDF'}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--color-muted)', textAlign: 'center', margin: '0 0 24px', lineHeight: 1.5 }}>
                    {status}
                </p>

                {/* Progress bar */}
                {isLoading && (
                    <div style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 500 }}>Progress</span>
                            <span style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 600, fontFamily: 'monospace' }}>{progress}%</span>
                        </div>
                        <div style={{ width: '100%', background: 'var(--color-border)', height: 5, borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{
                                height: '100%', background: 'var(--color-dark)', borderRadius: 99,
                                width: `${progress}%`, transition: 'width 0.7s ease-out',
                            }} />
                        </div>
                    </div>
                )}

                {/* Success bar */}
                {isSuccess && (
                    <div style={{ marginBottom: 8 }}>
                        <div style={{ width: '100%', background: '#dcfce7', height: 5, borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: '#22c55e', width: '100%', borderRadius: 99 }} />
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--color-sec)', textAlign: 'center', marginTop: 12 }}>
                            Downloading…
                        </p>
                    </div>
                )}

                {/* Error detail + buttons */}
                {isError && (
                    <div>
                        {errorMsg && (
                            <div style={{
                                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10,
                                padding: '10px 12px', fontSize: 12, color: '#f87171',
                                fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 16,
                            }}>
                                {errorMsg}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={runExport}
                                style={{
                                    flex: 1, padding: '10px 0', background: 'var(--color-dark)', color: 'var(--color-dark-fg)',
                                    border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 500,
                                    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                                }}
                            >
                                Try Again
                            </button>
                            <button
                                onClick={onClose}
                                style={{
                                    flex: 1, padding: '10px 0', background: 'var(--color-bg)', color: 'var(--color-text)',
                                    border: '1px solid var(--color-border)', borderRadius: 10, fontSize: 13,
                                    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Cancel while loading */}
                {isLoading && (
                    <button
                        onClick={onClose}
                        style={{
                            display: 'block', width: '100%', marginTop: 14,
                            padding: '8px 0', background: 'none', border: 'none',
                            fontSize: 12, color: '#a3a3a3', cursor: 'pointer',
                            fontFamily: 'Inter, sans-serif',
                        }}
                    >
                        Cancel
                    </button>
                )}
            </div>
        </div>
    );
}
