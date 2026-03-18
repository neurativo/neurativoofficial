import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

function App() {
    // ── Session ──────────────────────────────────────────
    const [lectureId, setLectureId]           = useState(null);
    const [sessionStatus, setSessionStatus]   = useState('idle'); // idle | recording | paused | ended
    const [errorMessage, setErrorMessage]     = useState(null);
    const [recordingSeconds, setRecordingSeconds] = useState(0);

    // ── Content ───────────────────────────────────────────
    const [transcript, setTranscript]         = useState([]);
    const [summary, setSummary]               = useState('');
    const [isSummaryUpdating, setIsSummaryUpdating] = useState(false);

    // ── Right panel ───────────────────────────────────────
    const [activeTab, setActiveTab]           = useState('summary');
    const [qaQuestion, setQaQuestion]         = useState('');
    const [qaHistory, setQaHistory]           = useState([]);
    const [qaLoading, setQaLoading]           = useState(false);

    // ── Audio calibration ─────────────────────────────────
    const [isCalibrating, setIsCalibrating]   = useState(false);

    // ── Overlays ──────────────────────────────────────────
    const [selectionInfo, setSelectionInfo]   = useState({ text: '', x: 0, y: 0, show: false });
    const [explainPanel, setExplainPanel]     = useState({ show: false, loading: false, data: null });
    const [exportModal, setExportModal]       = useState({ show: false, progress: 0, status: '' });

    // ── Refs ──────────────────────────────────────────────
    const timerRef            = useRef(null);
    const mediaRecorderRef    = useRef(null);
    const audioChunksRef      = useRef([]);
    const isRecordingRef      = useRef(false);
    const transcriptEndRef    = useRef(null);
    const qaEndRef            = useRef(null);
    const shouldAutoScrollRef = useRef(true);

    // ── Audio monitoring refs ──────────────────────────────
    const audioContextRef      = useRef(null);
    const analyserRef          = useRef(null);
    const animFrameRef         = useRef(null);
    const waveformBarsRef      = useRef(null);
    const peakSpeechEnergyRef  = useRef(0);    // peak speech-band energy in current chunk
    const noiseFloorRef        = useRef(0);    // estimated ambient noise level (speech band)
    const silentChunksRef      = useRef(0);    // consecutive silent chunk counter

    // Speech frequency band (human voice: 300–3400 Hz).
    // With fftSize=256, frequencyBinCount=128, at 44.1kHz each bin ≈ 172Hz.
    // Bin 2 ≈ 344Hz (speech low), bin 20 ≈ 3440Hz (speech high).
    // Skipping bin 0 (DC) and bin 1 (sub-bass rumble).
    const SPEECH_BIN_LOW  = 2;
    const SPEECH_BIN_HIGH = 20;
    const SILENCE_WARN_AFTER = 2; // warn after N consecutive silent chunks

    // ── Effects ───────────────────────────────────────────

    useEffect(() => {
        if (shouldAutoScrollRef.current && transcriptEndRef.current)
            transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [transcript]);

    useEffect(() => {
        if (qaEndRef.current)
            qaEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [qaHistory, qaLoading]);

    useEffect(() => {
        if (sessionStatus === 'recording') {
            timerRef.current = setInterval(() => setRecordingSeconds(p => p + 1), 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [sessionStatus]);

    useEffect(() => {
        const onEsc = (e) => { if (e.key === 'Escape') setExplainPanel(p => ({ ...p, show: false })); };
        window.addEventListener('keydown', onEsc);
        return () => window.removeEventListener('keydown', onEsc);
    }, []);

    // Cleanup audio monitoring on unmount
    useEffect(() => {
        return () => {
            cancelAnimationFrame(animFrameRef.current);
            if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
        };
    }, []);

    // ── Helpers ───────────────────────────────────────────

    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    const wordCount = transcript.reduce((n, seg) => n + seg.text.split(/\s+/).filter(Boolean).length, 0);

    const showError = (msg, duration = 4000) => {
        setErrorMessage(msg);
        if (duration) setTimeout(() => setErrorMessage(null), duration);
    };

    // ── Handlers ──────────────────────────────────────────

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 60;
    };

    const handleTextSelection = () => {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        if (text && text.length > 5) {
            const rect = selection.getRangeAt(0).getBoundingClientRect();
            setSelectionInfo({ text, x: rect.left + rect.width / 2, y: rect.top - 10, show: true });
        } else {
            setSelectionInfo(p => ({ ...p, show: false }));
        }
    };

    const startLiveSession = async () => {
        try {
            const res = await axios.post('/api/v1/live/start');
            setLectureId(res.data.lecture_id);
            setTranscript([]);
            setSummary('');
            setQaHistory([]);
            setQaQuestion('');
            setRecordingSeconds(0);
            setErrorMessage(null);
            setExplainPanel({ show: false, loading: false, data: null });
            startRecording(res.data.lecture_id);
        } catch (err) {
            const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
            showError(`Failed to start session: ${detail}`, 0);
        }
    };

    const stopAudioMonitoring = () => {
        cancelAnimationFrame(animFrameRef.current);
        if (audioContextRef.current?.state !== 'closed') {
            audioContextRef.current?.close();
            audioContextRef.current = null;
        }
    };

    // Returns average energy in the human speech frequency band (300–3400 Hz).
    // Using only these bins ignores low-frequency background noise (fans, AC, hum)
    // and high-frequency hiss that would otherwise corrupt the silence gate.
    const getSpeechEnergy = (dataArray) => {
        let sum = 0;
        const high = Math.min(SPEECH_BIN_HIGH, dataArray.length - 1);
        for (let i = SPEECH_BIN_LOW; i <= high; i++) sum += dataArray[i];
        return sum / (high - SPEECH_BIN_LOW + 1);
    };

    // Samples the speech band for ~1.5s to establish the ambient noise floor.
    // Returns the measured floor so it can be captured in the recording closure.
    const calibrateNoiseFloor = (dataArray) => new Promise((resolve) => {
        setIsCalibrating(true);
        const samples = [];
        const end = Date.now() + 1500;
        const tick = () => {
            analyserRef.current.getByteFrequencyData(dataArray);
            samples.push(getSpeechEnergy(dataArray));
            if (Date.now() < end) { setTimeout(tick, 50); return; }
            const floor = samples.reduce((a, b) => a + b, 0) / samples.length;
            noiseFloorRef.current = floor;
            setIsCalibrating(false);
            resolve(floor);
        };
        tick();
    });

    const startRecording = async (currentId) => {
        const targetId = currentId || lectureId;
        if (!targetId) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // ── Audio Analyser Setup ───────────────────────────
            stopAudioMonitoring();
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            audioContextRef.current = new AudioCtx();
            await audioContextRef.current.resume();
            analyserRef.current = audioContextRef.current.createAnalyser();
            // fftSize=256 → 128 bins at ~172Hz each (44.1kHz) — good speech-band resolution
            analyserRef.current.fftSize = 256;
            audioContextRef.current.createMediaStreamSource(stream).connect(analyserRef.current);

            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

            // ── Noise Floor Calibration ────────────────────────
            // Measure ambient noise level before recording starts.
            // Speech threshold = 2.5× the noise floor, clamped to a safe range.
            // e.g. quiet room floor=3 → threshold=7.5→clamp→8 (very sensitive)
            //      noisy room  floor=18 → threshold=45 (ignores AC/fan noise)
            const measuredFloor = await calibrateNoiseFloor(dataArray);
            // speechThreshold is captured in the recording closure below.
            // On each silent chunk we nudge the floor with a slow EMA so the
            // threshold stays calibrated if background noise changes mid-lecture.
            let speechThreshold = Math.max(8, Math.min(60, measuredFloor * 2.5));

            // ── Draw Loop (~60fps) ─────────────────────────────
            const drawLoop = () => {
                animFrameRef.current = requestAnimationFrame(drawLoop);
                analyserRef.current.getByteFrequencyData(dataArray);

                // Track peak speech-band energy for silence gate
                const energy = getSpeechEnergy(dataArray);
                if (energy > peakSpeechEnergyRef.current) peakSpeechEnergyRef.current = energy;

                // Drive level-meter bars directly (speech band only → visually
                // represents voice activity, not background rumble)
                if (waveformBarsRef.current) {
                    const bars  = waveformBarsRef.current.children;
                    const range = SPEECH_BIN_HIGH - SPEECH_BIN_LOW;
                    const step  = Math.max(1, Math.floor(range / bars.length));
                    for (let i = 0; i < bars.length; i++) {
                        const val = dataArray[SPEECH_BIN_LOW + i * step] / 255;
                        bars[i].style.height  = `${Math.max(8, val * 100)}%`;
                        bars[i].style.opacity = `${0.35 + val * 0.65}`;
                    }
                }
            };
            drawLoop();

            // ── Recording Loop (12s chunks) ────────────────────
            const startLoop = () => {
                if (!isRecordingRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
                peakSpeechEnergyRef.current = 0; // reset for this chunk window
                audioChunksRef.current = [];
                const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                mediaRecorderRef.current = recorder;
                recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
                recorder.onstop = () => {
                    const isSilent = peakSpeechEnergyRef.current < speechThreshold;

                    if (audioChunksRef.current.length > 0 && !isSilent) {
                        // Speech detected — upload and reset silent streak
                        silentChunksRef.current = 0;
                        uploadChunk(new Blob(audioChunksRef.current, { type: 'audio/webm' }), targetId);
                    } else if (isSilent) {
                        // No speech — use this chunk to slowly update the noise floor
                        // (exponential moving average, α=0.1 — adapts over ~10 silent chunks)
                        noiseFloorRef.current = 0.9 * noiseFloorRef.current + 0.1 * peakSpeechEnergyRef.current;
                        speechThreshold = Math.max(8, Math.min(60, noiseFloorRef.current * 2.5));

                        silentChunksRef.current += 1;
                        if (silentChunksRef.current >= SILENCE_WARN_AFTER) {
                            showError('No speech detected — is your microphone muted or too quiet?');
                            silentChunksRef.current = 0;
                        }
                    }
                    if (isRecordingRef.current) startLoop();
                    else stream.getTracks().forEach(t => t.stop());
                };
                recorder.start();
                setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 12000);
            };

            isRecordingRef.current = true;
            setSessionStatus('recording');
            startLoop();
        } catch (err) {
            setIsCalibrating(false);
            const reason = err.name === 'NotAllowedError'  ? 'Microphone access denied.'
                         : err.name === 'NotFoundError'    ? 'No microphone found on this device.'
                         : err.name === 'NotReadableError' ? 'Microphone is in use by another app.'
                         : `Microphone error: ${err.message}`;
            showError(reason, 0);
        }
    };

    const uploadChunk = async (blob, targetId) => {
        const formData = new FormData();
        formData.append('file', new File([blob], 'chunk.webm', { type: 'audio/webm' }));
        try {
            const res = await axios.post(`/api/v1/live/${targetId}/chunk`, formData);
            if (res.data.chunk_transcript)
                setTranscript(prev => [...prev, { id: Date.now(), text: res.data.chunk_transcript }]);
            if (res.data.summary_updated) {
                setIsSummaryUpdating(true);
                try {
                    const details = await axios.get(`/api/v1/lectures/${targetId}`);
                    if (details.data.summary) {
                        let s = details.data.summary;
                        if (s.startsWith('Summary Insights')) s = s.replace('Summary Insights', '').trim();
                        setSummary(s);
                    }
                } finally { setIsSummaryUpdating(false); }
            }
        } catch {
            setIsSummaryUpdating(false);
            showError('A chunk failed to upload — transcription may have gaps.');
        }
    };

    const pauseSession = () => {
        isRecordingRef.current = false;
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
        stopAudioMonitoring();
        silentChunksRef.current = 0;
        setIsCalibrating(false);
        setSessionStatus('paused');
    };

    const endSession = async () => {
        pauseSession();
        setSessionStatus('ended');
        try { await axios.post(`/api/v1/live/${lectureId}/end`); } catch {}
    };

    const handleExplainRequest = async () => {
        if (!lectureId || !selectionInfo.text) return;
        setSelectionInfo(p => ({ ...p, show: false }));
        setExplainPanel({ show: true, loading: true, data: null });
        try {
            const res = await axios.post(`/api/v1/explain/${lectureId}`, { text: selectionInfo.text, mode: 'simple' });
            setExplainPanel({ show: true, loading: false, data: res.data });
        } catch {
            setExplainPanel({ show: true, loading: false, data: { explanation: 'Failed to generate explanation.' } });
        }
    };

    const handleExportPDF = async () => {
        if (!lectureId) return;
        setExportModal({ show: true, progress: 10, status: 'Compiling lecture report...' });
        try {
            const res = await axios.get(`/api/v1/lectures/${lectureId}/export/pdf`, { responseType: 'blob' });
            setExportModal({ show: true, progress: 100, status: 'Ready!' });
            setTimeout(() => {
                const url = window.URL.createObjectURL(new Blob([res.data]));
                const a = document.createElement('a');
                a.href = url;
                a.setAttribute('download', 'Neurativo_Report.pdf');
                a.click();
                setExportModal(p => ({ ...p, show: false }));
            }, 800);
        } catch {
            setExportModal({ show: true, progress: 0, status: 'Export failed. Try again.' });
        }
    };

    const handleAsk = async (e) => {
        e.preventDefault();
        if (!lectureId || !qaQuestion.trim()) return;
        const question = qaQuestion;
        setQaQuestion('');
        setQaLoading(true);
        try {
            const res = await axios.post(`/api/v1/ask/${lectureId}`, { question });
            setQaHistory(prev => [...prev, { question, answer: res.data.answer }]);
        } catch {
            setQaHistory(prev => [...prev, { question, answer: "Couldn't get an answer. Please try again." }]);
        } finally {
            setQaLoading(false);
        }
    };

    // ── Sub-components ─────────────────────────────────────

    // Bars are driven directly by the analyser draw loop — no React re-renders
    const Waveform = () => (
        <div ref={waveformBarsRef} className="flex items-end gap-[3px] h-4">
            {[...Array(8)].map((_, i) => (
                <div key={i} className="w-[3px] bg-blue-500 rounded-full"
                    style={{ height: '8%', opacity: 0.4, transition: 'none' }} />
            ))}
        </div>
    );

    const TabButton = ({ id, label, badge }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex-1 h-8 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5
                ${activeTab === id
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:text-slate-700'}`}
        >
            {label}
            {badge > 0 && (
                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[10px] flex items-center justify-center font-bold leading-none">
                    {badge > 9 ? '9+' : badge}
                </span>
            )}
        </button>
    );

    // ═══════════════════════════════════════════
    //  IDLE: Welcome Screen
    // ═══════════════════════════════════════════

    if (sessionStatus === 'idle') {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                {errorMessage && (
                    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-3 animate-fade-in">
                        <span>{errorMessage}</span>
                        <button onClick={() => setErrorMessage(null)} className="opacity-60 hover:opacity-100 transition-opacity">✕</button>
                    </div>
                )}

                <div className="w-full max-w-sm animate-fade-in">
                    {/* Brand */}
                    <div className="flex items-center gap-2.5 mb-8">
                        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/30">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <span className="text-xl font-bold text-slate-900 font-heading">Neurativo</span>
                    </div>

                    {/* Headline */}
                    <h1 className="text-[28px] font-bold text-slate-900 leading-tight mb-3 font-heading">
                        Your AI<br />lecture assistant.
                    </h1>
                    <p className="text-slate-500 text-sm leading-relaxed mb-8">
                        Record any lecture and get live transcription, real-time summaries, and instant Q&A — as it happens.
                    </p>

                    {/* Features */}
                    <div className="space-y-2.5 mb-8">
                        {[
                            { icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z', label: 'Live transcription via Whisper' },
                            { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', label: 'Hierarchical AI summaries, live' },
                            { icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z', label: 'Ask anything about the lecture' },
                            { icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', label: 'Smart Explain for any term' },
                        ].map(({ icon, label }) => (
                            <div key={label} className="flex items-center gap-3 text-sm text-slate-600 bg-white border border-slate-100 rounded-xl px-4 py-3">
                                <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                                </svg>
                                {label}
                            </div>
                        ))}
                    </div>

                    {/* CTA */}
                    <button onClick={startLiveSession}
                        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2.5 text-[15px]">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        Start Live Session
                    </button>
                    <p className="text-center text-xs text-slate-400 mt-3">Microphone access required</p>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════
    //  ACTIVE SESSION
    // ═══════════════════════════════════════════

    return (
        <div className="h-screen bg-white flex flex-col overflow-hidden selection:bg-blue-100">

            {/* ── Error Toast ── */}
            {errorMessage && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-red-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg animate-fade-in flex items-center gap-3">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{errorMessage}</span>
                    <button onClick={() => setErrorMessage(null)} className="opacity-60 hover:opacity-100 transition-opacity ml-1">✕</button>
                </div>
            )}

            {/* ── Header ── */}
            <header className="h-14 border-b border-slate-100 flex items-center justify-between px-5 shrink-0 bg-white z-30">
                {/* Left: brand + status */}
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <span className="font-bold text-slate-900 font-heading text-[15px]">Neurativo</span>
                    </div>

                    <div className="h-4 w-px bg-slate-200" />

                    {sessionStatus === 'recording' && (
                        <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
                            <div className="w-2 h-2 rounded-full bg-red-500 pulse-red" />
                            <span className="font-mono text-[13px]">{formatTime(recordingSeconds)}</span>
                            <span className="text-[11px] font-normal text-red-400 uppercase tracking-wider">Live</span>
                        </div>
                    )}
                    {sessionStatus === 'paused' && (
                        <div className="flex items-center gap-2 text-[13px] text-amber-600 font-medium">
                            <div className="w-2 h-2 rounded-full bg-amber-400" />
                            <span>Paused · {formatTime(recordingSeconds)}</span>
                        </div>
                    )}
                    {sessionStatus === 'ended' && (
                        <div className="flex items-center gap-2 text-[13px] text-slate-400 font-medium">
                            <div className="w-2 h-2 rounded-full bg-slate-300" />
                            <span>Session ended · {formatTime(recordingSeconds)}</span>
                        </div>
                    )}
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-2">
                    {sessionStatus === 'ended' && (
                        <button onClick={() => {
                                setSessionStatus('idle');
                                setLectureId(null);
                                setTranscript([]);
                                setSummary('');
                                setQaHistory([]);
                                setQaQuestion('');
                                setExplainPanel({ show: false, loading: false, data: null });
                            }}
                            className="btn-ghost">
                            New Session
                        </button>
                    )}
                    {lectureId && (
                        <button onClick={handleExportPDF}
                            className="flex items-center gap-1.5 btn-ghost border border-slate-200">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Export PDF
                        </button>
                    )}
                    {sessionStatus !== 'ended' && (
                        <button onClick={endSession}
                            className="px-4 py-1.5 text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 rounded-lg transition-colors">
                            End Session
                        </button>
                    )}
                </div>
            </header>

            {/* ── Main: Transcript + Right Panel ── */}
            <div className="flex flex-1 overflow-hidden">

                {/* ── LEFT: Transcript ── */}
                <div className="flex-1 flex flex-col border-r border-slate-100 min-w-0">

                    {/* Panel header */}
                    <div className="panel-header">
                        <div className="flex items-center gap-3">
                            <span className="panel-label">Transcript</span>
                            {transcript.length > 0 && (
                                <span className="text-[11px] text-slate-400 font-mono">
                                    {transcript.length} segments · {wordCount.toLocaleString()} words
                                </span>
                            )}
                        </div>
                        {sessionStatus === 'recording' && <Waveform />}
                    </div>

                    {/* Scroll area */}
                    <div onScroll={handleScroll} className="flex-1 overflow-y-auto">
                        {transcript.length > 0 ? (
                            <div className="max-w-3xl mx-auto px-6 py-4 space-y-0.5 pb-10">
                                {transcript.map((seg, i) => (
                                    <div key={seg.id}
                                        className="group flex gap-4 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors animate-fade-in"
                                        style={{ animationDelay: `${Math.min(i, 4) * 0.04}s` }}>
                                        <span className="text-[11px] text-slate-300 font-mono pt-[3px] w-6 text-right shrink-0 select-none">
                                            {i + 1}
                                        </span>
                                        <p className="flex-1 text-[15px] leading-relaxed text-slate-700 group-hover:text-slate-900 transition-colors">
                                            {seg.text}
                                        </p>
                                    </div>
                                ))}

                                {/* Listening indicator */}
                                {sessionStatus === 'recording' && (
                                    <div className="flex gap-4 px-3 py-3">
                                        <span className="w-6" />
                                        <div className="flex items-center gap-2 text-slate-400">
                                            <div className="flex gap-1">
                                                {[0, 1, 2].map(i => (
                                                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce"
                                                        style={{ animationDelay: `${i * 0.15}s` }} />
                                                ))}
                                            </div>
                                            <span className="text-xs">Listening...</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Empty state */
                            <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-8">
                                {sessionStatus === 'recording' ? (
                                    <>
                                        <div className="flex items-end gap-1 h-8 mb-1">
                                            {[40, 65, 85, 55, 40].map((h, i) => (
                                                <div key={i} className="w-1.5 rounded-full bg-blue-200 animate-pulse"
                                                    style={{ height: `${h}%`, animationDelay: `${i * 0.2}s` }} />
                                            ))}
                                        </div>
                                        <p className="text-sm font-medium text-slate-600">Listening for speech...</p>
                                        <p className="text-xs text-slate-400">First transcript arrives in ~12 seconds</p>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-10 h-10 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                        </svg>
                                        <p className="text-sm text-slate-400">No transcript yet</p>
                                    </>
                                )}
                            </div>
                        )}
                        <div ref={transcriptEndRef} />
                    </div>
                </div>

                {/* ── RIGHT: Tabbed Panel ── */}
                <div className="w-[400px] shrink-0 flex flex-col bg-white">

                    {/* Tab bar */}
                    <div className="h-10 flex items-center gap-1 px-2 border-b border-slate-100 bg-slate-50/80 shrink-0">
                        <TabButton id="summary" label="Summary" />
                        <TabButton id="ask" label="Ask" badge={qaHistory.length} />
                    </div>

                    {/* ── Summary Tab ── */}
                    {activeTab === 'summary' && (
                        <div onMouseUp={handleTextSelection} className="flex-1 overflow-y-auto">
                            {summary ? (
                                <div className={`p-4 space-y-3 transition-opacity duration-500 ${isSummaryUpdating ? 'opacity-40' : 'opacity-100'}`}>
                                    {isSummaryUpdating && (
                                        <div className="flex items-center gap-2 text-blue-600 text-xs font-semibold px-1 py-0.5 animate-fade-in">
                                            <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                            Updating summary...
                                        </div>
                                    )}
                                    {summary.split('## ').filter(s => s.trim()).map((section, idx) => {
                                        const lines = section.split('\n');
                                        const title = lines[0].trim();
                                        const content = lines.slice(1).join('\n');
                                        return (
                                            <div key={idx}
                                                className="rounded-xl border border-slate-100 overflow-hidden animate-slide-up"
                                                style={{ animationDelay: `${idx * 0.05}s` }}>
                                                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                                                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{title}</h3>
                                                </div>
                                                <div className="px-4 py-3 space-y-2">
                                                    {content.split('\n').filter(l => l.trim()).map((line, li) => {
                                                        const isBullet = line.startsWith('- ');
                                                        const parts = line.split('**');
                                                        return (
                                                            <div key={li} className={`flex gap-2 ${isBullet ? 'items-start' : ''}`}>
                                                                {isBullet && <div className="w-1 h-1 rounded-full bg-blue-400 mt-[7px] shrink-0" />}
                                                                <p className="text-[13px] text-slate-600 leading-relaxed">
                                                                    {parts.map((t, ti) =>
                                                                        ti % 2 === 1
                                                                            ? <strong key={ti} className="text-slate-800 font-semibold">{t}</strong>
                                                                            : t.replace('- ', '')
                                                                    )}
                                                                </p>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <p className="text-[11px] text-slate-400 text-center py-2 italic">
                                        Select any text to get an AI explanation
                                    </p>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center p-8 text-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-500">No summary yet</p>
                                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                            Summary builds after enough content<br />has been captured
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Ask Tab ── */}
                    {activeTab === 'ask' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {/* Message history */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {qaHistory.length === 0 && !qaLoading ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                                            <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-500">Ask about the lecture</p>
                                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                                Questions are answered using<br />the live transcript
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    qaHistory.map((item, i) => (
                                        <div key={i} className="space-y-2 animate-fade-in">
                                            {/* Question bubble */}
                                            <div className="flex justify-end">
                                                <div className="max-w-[85%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[13px] leading-relaxed">
                                                    {item.question}
                                                </div>
                                            </div>
                                            {/* Answer bubble */}
                                            <div className="flex justify-start">
                                                <div className="max-w-[85%] bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-[13px] text-slate-700 leading-relaxed">
                                                    {item.answer}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}

                                {/* Typing indicator */}
                                {qaLoading && (
                                    <div className="flex justify-start animate-fade-in">
                                        <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                                            {[0, 1, 2].map(i => (
                                                <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
                                                    style={{ animationDelay: `${i * 0.15}s` }} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div ref={qaEndRef} />
                            </div>

                            {/* Input */}
                            <div className="p-3 border-t border-slate-100 shrink-0">
                                <form onSubmit={handleAsk}
                                    className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/10 transition-all">
                                    <input
                                        value={qaQuestion}
                                        onChange={e => setQaQuestion(e.target.value)}
                                        placeholder={lectureId ? 'Ask about the lecture...' : 'Start a session first'}
                                        disabled={!lectureId}
                                        className="flex-1 bg-transparent text-[13px] text-slate-800 placeholder:text-slate-400 outline-none"
                                    />
                                    <button type="submit"
                                        disabled={qaLoading || !lectureId || !qaQuestion.trim()}
                                        className="w-7 h-7 flex items-center justify-center bg-blue-600 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-lg transition-colors shrink-0">
                                        {qaLoading
                                            ? <div className="w-3 h-3 border-[2px] border-white border-t-transparent rounded-full animate-spin" />
                                            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14m-7-7l7 7-7 7" />
                                              </svg>
                                        }
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Control Bar ── */}
            <div className="h-16 bg-slate-900 flex items-center justify-between px-6 shrink-0">
                {/* Left: mic status + live level meter */}
                <div className="flex items-center gap-2.5 w-44">
                    {isCalibrating && (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <div className="w-3 h-3 border-2 border-slate-500 border-t-slate-300 rounded-full animate-spin shrink-0" />
                            <span className="text-xs text-slate-400 font-medium">Calibrating mic...</span>
                        </div>
                    )}
                    {sessionStatus === 'recording' && !isCalibrating && (
                        <>
                            <div className="w-7 h-7 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                                <svg className="w-3.5 h-3.5 text-red-400 pulse-red" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                                </svg>
                            </div>
                            {/* Live audio level meter — speech-band only, driven by analyser */}
                            <div ref={waveformBarsRef} className="flex items-end gap-[2px] h-5">
                                {[...Array(12)].map((_, i) => (
                                    <div key={i} className="w-[3px] bg-red-400 rounded-full"
                                        style={{ height: '8%', opacity: 0.4, transition: 'none' }} />
                                ))}
                            </div>
                        </>
                    )}
                    {sessionStatus === 'paused' && (
                        <>
                            <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center">
                                <svg className="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                                </svg>
                            </div>
                            <span className="text-xs text-slate-500 font-semibold">Mic off</span>
                        </>
                    )}
                    {sessionStatus === 'ended' && (
                        <span className="text-xs text-slate-600 font-semibold">Session complete</span>
                    )}
                </div>

                {/* Center: primary control */}
                <div className="flex items-center gap-3">
                    {sessionStatus === 'recording' && (
                        <button onClick={pauseSession}
                            className="flex items-center gap-2 px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-semibold transition-colors">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                            </svg>
                            Pause
                        </button>
                    )}
                    {sessionStatus === 'paused' && (
                        <button onClick={() => startRecording(lectureId)}
                            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            Resume
                        </button>
                    )}
                    {sessionStatus === 'ended' && (
                        <span className="text-xs text-slate-500 px-5 py-2">Listening stopped</span>
                    )}
                </div>

                {/* Right: stats */}
                <div className="flex items-center gap-5 w-36 justify-end">
                    <div className="text-right">
                        <div className="text-[13px] font-bold text-white font-mono leading-tight">{transcript.length}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">chunks</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[13px] font-bold text-white font-mono leading-tight">{wordCount.toLocaleString()}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">words</div>
                    </div>
                </div>
            </div>

            {/* ── Floating Explain Button ── */}
            {selectionInfo.show && (
                <button onClick={handleExplainRequest}
                    className="fixed z-50 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg shadow-2xl animate-fade-in hover:bg-blue-600 transition-colors flex items-center gap-1.5"
                    style={{ left: selectionInfo.x, top: selectionInfo.y, transform: 'translate(-50%, -100%)' }}>
                    <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Explain
                </button>
            )}

            {/* ── Explanation Side Panel ── */}
            {explainPanel.show && (
                <div className="fixed inset-0 z-[60] flex justify-end">
                    <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm"
                        onClick={() => setExplainPanel(p => ({ ...p, show: false }))} />
                    <div className="relative w-full max-w-[480px] bg-white h-full shadow-2xl animate-slide-in-right flex flex-col border-l border-slate-100">
                        {/* Panel header */}
                        <div className="h-14 px-5 flex items-center justify-between border-b border-slate-100 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-2 h-2 rounded-full bg-blue-600" />
                                <h3 className="font-bold text-slate-900 font-heading text-[15px]">Concept Breakdown</h3>
                            </div>
                            <button onClick={() => setExplainPanel(p => ({ ...p, show: false }))}
                                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Panel body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-5">
                            {explainPanel.loading ? (
                                <div className="h-full flex flex-col items-center justify-center gap-4">
                                    <div className="w-9 h-9 border-[3px] border-slate-100 border-t-blue-600 rounded-full animate-spin" />
                                    <p className="text-sm text-slate-400">Analyzing concept...</p>
                                </div>
                            ) : explainPanel.data ? (
                                <div className="space-y-5 animate-fade-in">
                                    {/* Explanation */}
                                    <div>
                                        <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest mb-2">Explanation</p>
                                        <p className="text-slate-800 leading-relaxed text-[15px]">{explainPanel.data.explanation}</p>
                                    </div>

                                    {/* Analogy */}
                                    {explainPanel.data.analogy && (
                                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                                            <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest mb-2">Analogy</p>
                                            <p className="text-slate-700 leading-relaxed italic text-sm">{explainPanel.data.analogy}</p>
                                        </div>
                                    )}

                                    {/* Step-by-step */}
                                    {explainPanel.data.breakdown && (
                                        <div>
                                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Step-by-Step</p>
                                            <div className="space-y-2">
                                                {explainPanel.data.breakdown.split('\n').filter(l => l.trim()).map((step, i) => (
                                                    <div key={i} className="flex gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                                        <span className="text-[11px] font-bold text-slate-300 font-mono mt-0.5 shrink-0">
                                                            {String(i + 1).padStart(2, '0')}
                                                        </span>
                                                        <p className="text-sm text-slate-600 leading-relaxed">
                                                            {step.replace(/^\d+\.\s*/, '')}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Export Modal ── */}
            {exportModal.show && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/50 backdrop-blur-md animate-fade-in">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-8 shadow-2xl text-center animate-slide-up border border-slate-100">
                        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                            {exportModal.progress === 100 ? (
                                <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                            ) : exportModal.progress === 0 ? (
                                <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            ) : (
                                <div className="w-7 h-7 border-[3px] border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                            )}
                        </div>
                        <h3 className="text-[17px] font-bold text-slate-900 mb-1 font-heading">
                            {exportModal.progress === 100 ? 'Export Ready' : exportModal.progress === 0 ? 'Export Failed' : 'Generating PDF'}
                        </h3>
                        <p className="text-slate-400 text-sm mb-6">{exportModal.status}</p>
                        {exportModal.progress > 0 && (
                            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-600 transition-all duration-500 rounded-full"
                                    style={{ width: `${exportModal.progress}%` }} />
                            </div>
                        )}
                        {exportModal.progress === 0 && (
                            <button onClick={() => setExportModal(p => ({ ...p, show: false }))}
                                className="mt-4 text-sm text-slate-500 hover:text-slate-700 transition-colors">
                                Dismiss
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
