// frontend/src/components/JobProgress.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useJobsApi } from '../lib/jobsApi.js';

const STEPS = [
    { key: 'queued',       label: 'Queued' },
    { key: 'compressing',  label: 'Compressing' },
    { key: 'transcribing', label: 'Transcribing' },
    { key: 'cleaning',     label: 'Cleaning' },
    { key: 'generating',   label: 'Generating' },
    { key: 'storing',      label: 'Saving' },
    { key: 'done',         label: 'Done' },
];

export default function JobProgress({ lectureId, onDone }) {
    const api    = useJobsApi();
    const [job, setJob]   = useState(null);
    const [error, setErr] = useState(null);
    const timerRef = useRef(null);

    useEffect(() => {
        if (!lectureId) return;

        const poll = async () => {
            try {
                const data = await api.getStatus(lectureId);
                setJob(data);
                if (data.status === 'done') {
                    onDone?.();
                    return;   // stop polling
                }
                if (data.status === 'failed') {
                    setErr(data.error || 'Processing failed. Please try again.');
                    return;   // stop polling
                }
                timerRef.current = setTimeout(poll, 2500);  // poll every 2.5s
            } catch (e) {
                setErr('Could not check processing status.');
            }
        };

        poll();
        return () => clearTimeout(timerRef.current);
    }, [lectureId]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!job || job.status === 'done') return null;

    const progress = job.progress ?? 0;
    const isFailed = job.status === 'failed';

    return (
        <div style={{
            background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderRadius: 12, padding: '20px 24px', marginBottom: 16,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13 }}>
                <span style={{ fontWeight: 500, color: isFailed ? '#dc2626' : 'var(--color-text)' }}>
                    {isFailed ? '\u2717 Processing failed' : job.label || 'Processing\u2026'}
                </span>
                {!isFailed && <span style={{ color: 'var(--color-muted)' }}>{progress}%</span>}
            </div>

            {!isFailed && (
                <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 6, overflow: 'hidden', marginBottom: 14 }}>
                    <div style={{
                        height: '100%',
                        width: `${progress}%`,
                        background: progress === 100 ? '#22c55e' : '#6366f1',
                        borderRadius: 6,
                        transition: 'width 0.6s ease',
                    }} />
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {STEPS.filter(s => s.key !== 'done').map(s => {
                    const stepIdx = STEPS.findIndex(x => x.key === job.status);
                    const thisIdx = STEPS.findIndex(x => x.key === s.key);
                    const done    = thisIdx < stepIdx;
                    const active  = s.key === job.status;
                    return (
                        <span key={s.key} style={{
                            fontSize: 11, padding: '3px 9px', borderRadius: 6,
                            background: done ? '#f0fdf4' : active ? '#ede9fe' : 'var(--color-border)',
                            color: done ? '#16a34a' : active ? '#7c3aed' : 'var(--color-muted)',
                            fontWeight: active ? 600 : 400,
                        }}>
                            {done ? '\u2713 ' : active ? '\u27f3 ' : ''}{s.label}
                        </span>
                    );
                })}
            </div>

            {(error || isFailed) && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>
                    {error || job.error || 'Processing failed. Please try re-uploading.'}
                </div>
            )}
        </div>
    );
}
