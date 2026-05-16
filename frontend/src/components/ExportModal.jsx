import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Check } from 'lucide-react';
import api from '../lib/api';

const STAGES = [
    { pct:  8, msg: 'Compiling lecture report',   icon: '📋' },
    { pct: 18, msg: 'Analysing transcript',        icon: '🔍' },
    { pct: 30, msg: 'Building section summaries',  icon: '📝' },
    { pct: 44, msg: 'Generating executive summary',icon: '✨' },
    { pct: 57, msg: 'Enriching glossary',          icon: '📖' },
    { pct: 68, msg: 'Preparing Q&A review',        icon: '💬' },
    { pct: 78, msg: 'Rendering PDF layout',        icon: '🎨' },
    { pct: 88, msg: 'Applying cover page',         icon: '🖼️' },
    { pct: 97, msg: 'Finalising document',         icon: '⚡' },
];

export default function ExportModal({ lectureId, onClose, onStart }) {
    const [progress, setProgress] = useState(STAGES[0].pct);
    const [status,   setStatus]   = useState(STAGES[0].msg);
    const [phase,    setPhase]    = useState('loading'); // loading | success | error
    const [errorMsg, setErrorMsg] = useState('');
    const inFlightRef = useRef(false);

    const runExport = useCallback(async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        onStart?.();
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
                inFlightRef.current = false;
                setTimeout(() => onClose(), 1600);
            }, 400);
        } catch (err) {
            clearInterval(interval);
            const msg = err?.response?.data?.detail || err?.message || 'Unknown error';
            setProgress(-1);
            setStatus('Export failed');
            setPhase('error');
            setErrorMsg(msg);
            inFlightRef.current = false;
        }
    }, [lectureId, onClose, onStart]);

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

    const currentStageIdx = STAGES.findIndex(s => s.pct === progress);

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 100,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 24,
                background: 'rgba(10,10,10,0.5)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                animation: 'em-fade 0.18s ease',
                padding: 'clamp(12px, 4vw, 24px)',
            }}
            onClick={() => !isLoading && onClose()}
        >
            <style>{`
                @keyframes em-fade { from { opacity:0; } to { opacity:1; } }
                @keyframes em-up   { from { opacity:0; transform:translateY(12px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
                @keyframes em-spin { to { transform: rotate(360deg); } }
                @keyframes em-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.35); } 50% { box-shadow: 0 0 0 6px rgba(99,102,241,0); } }
                .em-stage-list { overflow-y: auto; max-height: min(300px, 38vh); }
                .em-stage-list::-webkit-scrollbar { width: 4px; }
                .em-stage-list::-webkit-scrollbar-track { background: transparent; }
                .em-stage-list::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 4px; }
                @media (max-width: 440px) {
                    .em-card { border-radius: 16px !important; }
                    .em-header { padding: 18px 18px 0 !important; }
                    .em-progress { padding: 0 18px !important; }
                    .em-stage-list-wrap { margin: 0 18px 16px !important; }
                    .em-footer { padding: 0 18px 20px !important; }
                }
            `}</style>

            <div
                className="em-card"
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 22,
                    width: '100%',
                    maxWidth: 380,
                    animation: 'em-up 0.22s ease',
                    fontFamily: 'Inter, sans-serif',
                    overflow: 'hidden',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
                }}
            >
                {/* Header */}
                <div className="em-header" style={{ padding: '24px 24px 0', textAlign: 'center' }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isSuccess ? '#f0fdf4' : isError ? 'rgba(239,68,68,0.08)' : 'var(--color-bg)',
                        border: `1px solid ${isSuccess ? '#bbf7d0' : isError ? 'rgba(239,68,68,0.25)' : 'var(--color-border)'}`,
                        transition: 'all 0.4s',
                        animation: isLoading ? 'em-pulse 2s infinite' : 'none',
                    }}>
                        {isLoading && <Loader2 size={22} color="var(--color-text)" style={{ animation: 'em-spin 1.1s linear infinite' }} />}
                        {isSuccess && <CheckCircle2 size={22} color="#22c55e" />}
                        {isError   && <AlertCircle  size={22} color="#ef4444" />}
                    </div>

                    <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.4px', marginBottom: 4 }}>
                        {isSuccess ? 'Report Ready' : isError ? 'Export Failed' : 'Building Your Report'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.5, marginBottom: 20 }}>
                        {isSuccess ? 'Your PDF is downloading…' : status}
                    </div>
                </div>

                {/* Progress bar */}
                {(isLoading || isSuccess) && (
                    <div className="em-progress" style={{ padding: '0 24px', marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Progress</span>
                            <span style={{ fontSize: 11, color: 'var(--color-text)', fontWeight: 600, fontFamily: 'monospace' }}>
                                {isSuccess ? '100' : progress}%
                            </span>
                        </div>
                        <div style={{ width: '100%', background: 'var(--color-border)', height: 4, borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{
                                height: '100%', borderRadius: 99,
                                background: isSuccess ? '#22c55e' : 'var(--color-dark)',
                                width: isSuccess ? '100%' : `${progress}%`,
                                transition: 'width 0.7s ease-out',
                            }}/>
                        </div>
                    </div>
                )}

                {/* Stage list */}
                {isLoading && (
                    <div className="em-stage-list-wrap" style={{
                        margin: '0 24px 20px',
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 14,
                        overflow: 'hidden',
                    }}>
                        <div className="em-stage-list">
                        {STAGES.map((s, i) => {
                            const isCurrent = s.pct === progress;
                            const isDone = s.pct < progress;
                            return (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 12px',
                                    borderBottom: i < STAGES.length - 1 ? '1px solid var(--color-border)' : 'none',
                                    background: isCurrent ? 'var(--color-card)' : 'transparent',
                                    transition: 'background 0.3s',
                                }}>
                                    <div style={{
                                        width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 11,
                                        background: isDone ? 'rgba(34,197,94,0.12)' : isCurrent ? 'var(--color-border)' : 'transparent',
                                        border: isDone ? '1px solid rgba(34,197,94,0.3)' : isCurrent ? '1px solid var(--color-border)' : 'none',
                                    }}>
                                        {isDone
                                            ? <Check size={10} color="#22c55e" strokeWidth={3} />
                                            : isCurrent
                                                ? <Loader2 size={10} color="var(--color-muted)" style={{ animation: 'em-spin 1.1s linear infinite' }} />
                                                : <span style={{ fontSize: 9, opacity: 0.35 }}>{s.icon}</span>
                                        }
                                    </div>
                                    <span style={{
                                        fontSize: 12,
                                        color: isDone ? 'var(--color-muted)' : isCurrent ? 'var(--color-text)' : 'var(--color-muted)',
                                        fontWeight: isCurrent ? 500 : 400,
                                        opacity: (!isDone && !isCurrent) ? 0.5 : 1,
                                        transition: 'all 0.3s',
                                    }}>{s.msg}</span>
                                    {isCurrent && (
                                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-muted)', fontFamily: 'monospace' }}>{s.pct}%</span>
                                    )}
                                </div>
                            );
                        })}
                        </div>
                    </div>
                )}

                {/* Error detail */}
                {isError && errorMsg && (
                    <div style={{ margin: '0 24px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#f87171', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {errorMsg}
                    </div>
                )}

                {/* Footer actions */}
                <div className="em-footer" style={{ padding: '0 24px 24px', display: 'flex', gap: 8 }}>
                    {isError && (
                        <button onClick={runExport} style={{ flex: 1, padding: '11px 0', background: 'var(--color-dark)', color: 'var(--color-dark-fg)', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                            Try Again
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        style={{
                            flex: isError ? 1 : undefined, width: isError ? undefined : '100%',
                            padding: '11px 0', background: isError ? 'var(--color-bg)' : 'none',
                            border: isError ? '1px solid var(--color-border)' : 'none',
                            borderRadius: 12, fontSize: isLoading ? 12 : 13,
                            color: isLoading ? 'var(--color-muted)' : 'var(--color-text)',
                            cursor: isLoading ? 'default' : 'pointer',
                            fontFamily: 'Inter, sans-serif',
                            opacity: isLoading ? 0.5 : 1,
                        }}
                    >
                        {isLoading ? 'Please wait…' : isError ? 'Cancel' : 'Close'}
                    </button>
                </div>
            </div>
        </div>
    );
}
