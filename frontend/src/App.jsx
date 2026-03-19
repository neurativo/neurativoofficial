import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

const LANGUAGE_NAMES = {
    en: 'English', ar: 'Arabic',  zh: 'Chinese',    fr: 'French',
    de: 'German',  hi: 'Hindi',   id: 'Indonesian',  it: 'Italian',
    ja: 'Japanese',ko: 'Korean',  ms: 'Malay',       nl: 'Dutch',
    pl: 'Polish',  pt: 'Portuguese', ru: 'Russian',  es: 'Spanish',
    sv: 'Swedish', ta: 'Tamil',   te: 'Telugu',      th: 'Thai',
    tr: 'Turkish', uk: 'Ukrainian',  ur: 'Urdu',     vi: 'Vietnamese',
};

function App() {
    // ── Session ──────────────────────────────────────────
    const [lectureId, setLectureId]           = useState(null);
    const [sessionStatus, setSessionStatus]   = useState('idle'); // idle | recording | paused | ended
    const [errorMessage, setErrorMessage]     = useState(null);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [detectedLanguage, setDetectedLanguage] = useState(null);
    const [detectedTopic, setDetectedTopic]       = useState(null);

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

    // ── Phase 5: new state ────────────────────────────────
    const [nastScore, setNastScore]           = useState(null);  // from SSE when backend sends it
    const [statsData, setStatsData]           = useState(null);
    const [statsLoading, setStatsLoading]     = useState(false);
    const [searchQuery, setSearchQuery]       = useState('');
    const [searchActive, setSearchActive]     = useState(false);
    const [copiedSectionIdx, setCopiedSectionIdx] = useState(null);
    const [newSectionIdx, setNewSectionIdx]   = useState(null);   // index of newest summary section
    const [activePanel, setActivePanel]       = useState('transcript'); // mobile nav: transcript | right
    const [recentSessions, setRecentSessions] = useState([]);

    // ── Refs ──────────────────────────────────────────────
    const timerRef            = useRef(null);
    const mediaRecorderRef    = useRef(null);
    const audioChunksRef      = useRef([]);
    const isRecordingRef      = useRef(false);
    const transcriptEndRef    = useRef(null);
    const qaEndRef            = useRef(null);
    const shouldAutoScrollRef = useRef(true);
    const sseRef              = useRef(null);
    const lastOverlapRef      = useRef('');
    const prevSectionCountRef = useRef(0);
    const searchInputRef      = useRef(null);

    // ── Audio monitoring refs ──────────────────────────────
    const audioContextRef      = useRef(null);
    const analyserRef          = useRef(null);
    const animFrameRef         = useRef(null);
    const waveformBarsRef      = useRef(null);
    const peakSpeechEnergyRef  = useRef(0);
    const noiseFloorRef        = useRef(0);
    const silentChunksRef      = useRef(0);

    const SPEECH_BIN_LOW  = 2;
    const SPEECH_BIN_HIGH = 20;
    const SILENCE_WARN_AFTER = 2;

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
        const onEsc = (e) => {
            if (e.key === 'Escape') {
                setExplainPanel(p => ({ ...p, show: false }));
                setSearchActive(false);
                setSearchQuery('');
            }
        };
        window.addEventListener('keydown', onEsc);
        return () => window.removeEventListener('keydown', onEsc);
    }, []);

    // Cleanup audio monitoring + SSE on unmount
    useEffect(() => {
        return () => {
            cancelAnimationFrame(animFrameRef.current);
            if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
            if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
        };
    }, []);

    // Stats tab: fetch analytics when tab opens
    useEffect(() => {
        if (activeTab === 'stats' && lectureId) {
            setStatsLoading(true);
            setStatsData(null);
            axios.get(`/api/v1/lectures/${lectureId}/analytics`)
                .then(res => setStatsData(res.data))
                .catch(() => {})
                .finally(() => setStatsLoading(false));
        }
    }, [activeTab, lectureId]);

    // Section slide-in: detect when new sections appear in summary
    useEffect(() => {
        if (!summary) { prevSectionCountRef.current = 0; return; }
        const sections = summary.split('## ').filter(s => s.trim());
        if (sections.length > prevSectionCountRef.current && prevSectionCountRef.current > 0) {
            setNewSectionIdx(sections.length - 1);
            const t = setTimeout(() => setNewSectionIdx(null), 2000);
            prevSectionCountRef.current = sections.length;
            return () => clearTimeout(t);
        }
        prevSectionCountRef.current = sections.length;
    }, [summary]);

    // Focus search input when activated
    useEffect(() => {
        if (searchActive && searchInputRef.current) searchInputRef.current.focus();
    }, [searchActive]);

    // Fetch recent sessions when on idle screen
    useEffect(() => {
        if (sessionStatus === 'idle') {
            axios.get('/api/v1/lectures?limit=5')
                .then(res => {
                    const list = Array.isArray(res.data) ? res.data
                               : Array.isArray(res.data?.lectures) ? res.data.lectures
                               : [];
                    setRecentSessions(list);
                })
                .catch(() => {}); // endpoint may not exist — fail silently
        }
    }, [sessionStatus]);

    // ── Helpers ───────────────────────────────────────────

    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    const wordCount = transcript.reduce((n, seg) => n + seg.text.split(/\s+/).filter(Boolean).length, 0);

    const showError = (msg, duration = 4000) => {
        setErrorMessage(msg);
        if (duration) setTimeout(() => setErrorMessage(null), duration);
    };

    // Filtered transcript for search
    const filteredTranscript = searchQuery.trim()
        ? transcript.filter(seg => seg.text.toLowerCase().includes(searchQuery.toLowerCase()))
        : transcript;

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

    const handleCopySection = (text, idx) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedSectionIdx(idx);
            setTimeout(() => setCopiedSectionIdx(p => (p === idx ? null : p)), 1500);
        }).catch(() => {});
    };

    // ── SSE helpers ───────────────────────────────────────

    const connectSSE = (id) => {
        if (sseRef.current) sseRef.current.close();
        const es = new EventSource(`/api/v1/live/${id}/stream`);
        es.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.summary) {
                    let s = data.summary;
                    if (s.startsWith('Summary Insights')) s = s.replace('Summary Insights', '').trim();
                    setIsSummaryUpdating(true);
                    setSummary(s);
                    setTimeout(() => setIsSummaryUpdating(false), 800);
                }
                if (data.topic) {
                    setDetectedTopic(prev => prev || data.topic);
                }
                if (data.nast_composite != null) {
                    setNastScore(data.nast_composite);
                }
            } catch {}
        };
        es.onerror = () => es.close();
        sseRef.current = es;
    };

    const disconnectSSE = () => {
        if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    };

    // ── Chunk overlap helper ──────────────────────────────
    const getLastTwoSentences = (text) => {
        if (!text) return '';
        const sentences = text.trim().split(/(?<=[.!?])\s+/);
        return sentences.slice(-2).join(' ').trim();
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
            setDetectedLanguage(null);
            setDetectedTopic(null);
            setNastScore(null);
            setStatsData(null);
            setSearchQuery('');
            setSearchActive(false);
            setActivePanel('transcript');
            prevSectionCountRef.current = 0;
            lastOverlapRef.current = '';
            setExplainPanel({ show: false, loading: false, data: null });
            connectSSE(res.data.lecture_id);
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

    const getSpeechEnergy = (dataArray) => {
        let sum = 0;
        const high = Math.min(SPEECH_BIN_HIGH, dataArray.length - 1);
        for (let i = SPEECH_BIN_LOW; i <= high; i++) sum += dataArray[i];
        return sum / (high - SPEECH_BIN_LOW + 1);
    };

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

            stopAudioMonitoring();
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            audioContextRef.current = new AudioCtx();
            await audioContextRef.current.resume();
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            audioContextRef.current.createMediaStreamSource(stream).connect(analyserRef.current);

            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

            const measuredFloor = await calibrateNoiseFloor(dataArray);
            let speechThreshold = Math.max(8, Math.min(60, measuredFloor * 2.5));

            const drawLoop = () => {
                animFrameRef.current = requestAnimationFrame(drawLoop);
                analyserRef.current.getByteFrequencyData(dataArray);
                const energy = getSpeechEnergy(dataArray);
                if (energy > peakSpeechEnergyRef.current) peakSpeechEnergyRef.current = energy;
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

            const startLoop = () => {
                if (!isRecordingRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
                peakSpeechEnergyRef.current = 0;
                audioChunksRef.current = [];
                const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                mediaRecorderRef.current = recorder;
                recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
                recorder.onstop = () => {
                    const isSilent = peakSpeechEnergyRef.current < speechThreshold;
                    if (audioChunksRef.current.length > 0 && !isSilent) {
                        silentChunksRef.current = 0;
                        uploadChunk(new Blob(audioChunksRef.current, { type: 'audio/webm' }), targetId);
                    } else if (isSilent) {
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
            if (res.data.chunk_transcript) {
                const rawText = res.data.chunk_transcript.trim();
                const overlap = lastOverlapRef.current;
                const displayText = overlap ? `${overlap} ${rawText}` : rawText;
                setTranscript(prev => [...prev, { id: Date.now(), text: displayText }]);
                lastOverlapRef.current = getLastTwoSentences(rawText);
            }
            if (res.data.language && !detectedLanguage) {
                setDetectedLanguage(res.data.language);
            }
            if (res.data.topic && !detectedTopic) {
                setDetectedTopic(res.data.topic);
            }
            if (res.data.nast?.composite != null) {
                setNastScore(res.data.nast.composite);
            }
        } catch {
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
        disconnectSSE();
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
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
                {/* Animated background blobs */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl animate-bg-pulse" />
                    <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-400/10 rounded-full blur-3xl animate-bg-pulse" style={{ animationDelay: '1.5s' }} />
                    <div className="absolute top-2/3 left-1/2 w-64 h-64 bg-teal-400/8 rounded-full blur-3xl animate-bg-pulse" style={{ animationDelay: '3s' }} />
                </div>

                {errorMessage && (
                    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-3 animate-fade-in">
                        <span>{errorMessage}</span>
                        <button onClick={() => setErrorMessage(null)} className="opacity-60 hover:opacity-100 transition-opacity">✕</button>
                    </div>
                )}

                <div className="relative w-full max-w-sm animate-fade-in">
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
                        Record any lecture and get live transcription, real-time summaries, and instant Q&amp;A — as it happens.
                    </p>

                    {/* Features — 6 cards matching actual capabilities */}
                    <div className="grid grid-cols-2 gap-2 mb-8">
                        {[
                            { icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z', label: 'Live transcription', sub: 'Whisper-powered' },
                            { icon: 'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129', label: 'Multilingual', sub: '30+ languages' },
                            { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', label: 'Topic-aware AI', sub: 'Smart summaries' },
                            { icon: 'M13 10V3L4 14h7v7l9-11h-7z', label: 'N.A.S.T. scoring', sub: 'Semantic novelty' },
                            { icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z', label: 'Citation Q&A', sub: 'Grounded answers' },
                            { icon: 'M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', label: 'Export to PDF', sub: 'Full report' },
                        ].map(({ icon, label, sub }) => (
                            <div key={label} className="flex items-start gap-3 text-sm bg-white border border-slate-100 rounded-xl px-3.5 py-3 shadow-sm">
                                <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                                </svg>
                                <div>
                                    <div className="text-[12px] font-semibold text-slate-700 leading-tight">{label}</div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
                                </div>
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

                    {/* Recent sessions */}
                    {recentSessions.length > 0 && (
                        <div className="mt-8">
                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Recent Sessions</p>
                            <div className="space-y-1.5">
                                {recentSessions.slice(0, 3).map(session => (
                                    <div key={session.id} className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-2.5">
                                        <svg className="w-3.5 h-3.5 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                        <span className="flex-1 truncate text-[13px] text-slate-600">{session.title || 'Untitled Session'}</span>
                                        {session.created_at && (
                                            <span className="text-[11px] text-slate-400 shrink-0">
                                                {new Date(session.created_at).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
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
            <header className="h-14 border-b border-slate-100 flex items-center justify-between px-4 md:px-5 shrink-0 bg-white z-30">
                {/* Left: brand + status */}
                <div className="flex items-center gap-2 md:gap-4 min-w-0">
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <span className="font-bold text-slate-900 font-heading text-[15px]">Neurativo</span>
                    </div>

                    <div className="h-4 w-px bg-slate-200 hidden md:block" />

                    {sessionStatus === 'recording' && (
                        <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
                            <div className="w-2 h-2 rounded-full bg-red-500 pulse-red" />
                            <span className="font-mono text-[13px]">{formatTime(recordingSeconds)}</span>
                            <span className="text-[11px] font-normal text-red-400 uppercase tracking-wider hidden md:inline">Live</span>
                        </div>
                    )}
                    {sessionStatus === 'paused' && (
                        <div className="flex items-center gap-2 text-[13px] text-amber-600 font-medium">
                            <div className="w-2 h-2 rounded-full bg-amber-400" />
                            <span className="hidden md:inline">Paused · </span><span>{formatTime(recordingSeconds)}</span>
                        </div>
                    )}
                    {sessionStatus === 'ended' && (
                        <div className="flex items-center gap-2 text-[13px] text-slate-400 font-medium">
                            <div className="w-2 h-2 rounded-full bg-slate-300" />
                            <span className="hidden md:inline">Session ended · {formatTime(recordingSeconds)}</span>
                        </div>
                    )}

                    {/* Language + Topic + N.A.S.T. badges */}
                    {(detectedLanguage || detectedTopic || nastScore != null) && (
                        <div className="flex items-center gap-1.5 overflow-hidden">
                            {detectedLanguage && (
                                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-semibold uppercase tracking-wide border border-blue-100 shrink-0">
                                    {LANGUAGE_NAMES[detectedLanguage] || detectedLanguage.toUpperCase()}
                                </span>
                            )}
                            {detectedTopic && (
                                <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 text-[11px] font-semibold capitalize tracking-wide border border-violet-100 shrink-0 hidden md:inline">
                                    {detectedTopic}
                                </span>
                            )}
                            {nastScore != null && (
                                <span className={`px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 text-[11px] font-semibold tracking-wide border border-teal-100 shrink-0 hidden md:inline ${isSummaryUpdating ? 'nast-glow' : ''}`}>
                                    N.A.S.T. {nastScore.toFixed(2)}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-2 shrink-0">
                    {sessionStatus === 'ended' && (
                        <button onClick={() => {
                                setSessionStatus('idle');
                                setLectureId(null);
                                setTranscript([]);
                                setSummary('');
                                setQaHistory([]);
                                setQaQuestion('');
                                setDetectedLanguage(null);
                                setDetectedTopic(null);
                                setNastScore(null);
                                setExplainPanel({ show: false, loading: false, data: null });
                            }}
                            className="btn-ghost">
                            New Session
                        </button>
                    )}
                    {lectureId && (
                        <button onClick={handleExportPDF}
                            className="hidden md:flex items-center gap-1.5 btn-ghost border border-slate-200">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Export PDF
                        </button>
                    )}
                    {sessionStatus !== 'ended' && (
                        <button onClick={endSession}
                            className="px-4 py-1.5 text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 rounded-lg transition-colors">
                            End
                        </button>
                    )}
                </div>
            </header>

            {/* ── Main: Transcript + Right Panel ── */}
            <div className="flex flex-1 overflow-hidden">

                {/* ── LEFT: Transcript ── */}
                <div className={`flex-1 flex flex-col border-r border-slate-100 min-w-0 ${activePanel !== 'transcript' ? 'hidden md:flex' : 'flex'}`}>

                    {/* Panel header */}
                    <div className="panel-header">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <span className="panel-label shrink-0">Transcript</span>
                            {!searchActive && transcript.length > 0 && (
                                <span className="text-[11px] text-slate-400 font-mono truncate">
                                    {transcript.length} segments · {wordCount.toLocaleString()} words
                                </span>
                            )}
                            {searchActive && (
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <input
                                        ref={searchInputRef}
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        placeholder="Search transcript..."
                                        className="flex-1 bg-transparent text-[12px] text-slate-700 placeholder:text-slate-400 outline-none min-w-0"
                                    />
                                    {searchQuery && (
                                        <span className="text-[11px] text-slate-400 shrink-0 font-mono">
                                            {filteredTranscript.length}/{transcript.length}
                                        </span>
                                    )}
                                    <button onClick={() => { setSearchActive(false); setSearchQuery(''); }}
                                        className="text-slate-400 hover:text-slate-600 shrink-0 transition-colors text-xs">✕</button>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {!searchActive && (
                                <button onClick={() => setSearchActive(true)}
                                    className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </button>
                            )}
                            {sessionStatus === 'recording' && !searchActive && <Waveform />}
                        </div>
                    </div>

                    {/* Scroll area */}
                    <div onScroll={handleScroll} className="flex-1 overflow-y-auto">
                        {filteredTranscript.length > 0 ? (
                            <div className="max-w-3xl mx-auto px-6 py-4 space-y-0.5 pb-10">
                                {filteredTranscript.map((seg, i) => {
                                    const query = searchQuery.toLowerCase();
                                    const text = seg.text;
                                    if (searchQuery && query) {
                                        const lower = text.toLowerCase();
                                        const parts = [];
                                        let last = 0;
                                        let idx = lower.indexOf(query);
                                        while (idx !== -1) {
                                            parts.push(text.slice(last, idx));
                                            parts.push(<mark key={idx} className="bg-yellow-200 rounded-sm">{text.slice(idx, idx + query.length)}</mark>);
                                            last = idx + query.length;
                                            idx = lower.indexOf(query, last);
                                        }
                                        parts.push(text.slice(last));
                                        return (
                                            <div key={seg.id} className="group flex gap-4 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors animate-fade-in">
                                                <span className="text-[11px] text-slate-300 font-mono pt-[3px] w-6 text-right shrink-0 select-none">{i + 1}</span>
                                                <p className="flex-1 text-[15px] leading-relaxed text-slate-700 group-hover:text-slate-900 transition-colors">{parts}</p>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={seg.id}
                                            className="group flex gap-4 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors animate-fade-in"
                                            style={{ animationDelay: `${Math.min(i, 4) * 0.04}s` }}>
                                            <span className="text-[11px] text-slate-300 font-mono pt-[3px] w-6 text-right shrink-0 select-none">{i + 1}</span>
                                            <p className="flex-1 text-[15px] leading-relaxed text-slate-700 group-hover:text-slate-900 transition-colors">{seg.text}</p>
                                        </div>
                                    );
                                })}

                                {/* Listening indicator */}
                                {sessionStatus === 'recording' && !searchQuery && (
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

                                {/* No results for search */}
                                {searchQuery && filteredTranscript.length === 0 && (
                                    <div className="py-12 text-center">
                                        <p className="text-sm text-slate-400">No matches for "{searchQuery}"</p>
                                    </div>
                                )}
                            </div>
                        ) : (
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
                <div className={`w-full md:w-[400px] shrink-0 flex flex-col bg-white ${activePanel === 'transcript' ? 'hidden md:flex' : 'flex'}`}>

                    {/* Tab bar */}
                    <div className="h-10 flex items-center gap-1 px-2 border-b border-slate-100 bg-slate-50/80 shrink-0">
                        <TabButton id="summary" label="Summary" />
                        <TabButton id="ask" label="Ask" badge={qaHistory.length} />
                        <TabButton id="stats" label="Stats" />
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
                                        const isNew = idx === newSectionIdx;
                                        return (
                                            <div key={idx}
                                                className={`rounded-xl border overflow-hidden animate-slide-up ${isNew ? 'section-new' : 'border-slate-100'}`}
                                                style={{ animationDelay: `${idx * 0.05}s` }}>
                                                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{title}</h3>
                                                    <button
                                                        onClick={() => handleCopySection(content.trim(), idx)}
                                                        title="Copy section"
                                                        className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded transition-colors shrink-0">
                                                        {copiedSectionIdx === idx ? (
                                                            <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                            </svg>
                                                        )}
                                                    </button>
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
                                            <div className="flex justify-end">
                                                <div className="max-w-[85%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[13px] leading-relaxed">
                                                    {item.question}
                                                </div>
                                            </div>
                                            <div className="flex justify-start">
                                                <div className="max-w-[85%] bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-[13px] text-slate-700 leading-relaxed">
                                                    {item.answer}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
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

                    {/* ── Stats Tab ── */}
                    {activeTab === 'stats' && (
                        <div className="flex-1 overflow-y-auto p-4">
                            {statsLoading ? (
                                <div className="h-full flex items-center justify-center">
                                    <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                                </div>
                            ) : statsData ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-2.5">
                                        {[
                                            { label: 'Words', value: statsData.word_count?.toLocaleString() ?? '—' },
                                            { label: 'Chunks', value: statsData.total_chunks ?? transcript.length ?? '—' },
                                            { label: 'Sections', value: statsData.total_sections ?? '—' },
                                            { label: 'Duration', value: statsData.total_duration_seconds ? formatTime(statsData.total_duration_seconds) : '—' },
                                            { label: 'Language', value: statsData.language ? (LANGUAGE_NAMES[statsData.language] || statsData.language.toUpperCase()) : (detectedLanguage ? (LANGUAGE_NAMES[detectedLanguage] || detectedLanguage.toUpperCase()) : '—') },
                                            { label: 'Topic', value: statsData.topic || detectedTopic || '—' },
                                            { label: 'Compression', value: statsData.compression_ratio ? `${(statsData.compression_ratio * 100).toFixed(0)}%` : '—' },
                                            { label: 'N.A.S.T.', value: nastScore != null ? nastScore.toFixed(2) : (statsData.nast_score ? Number(statsData.nast_score).toFixed(2) : '—') },
                                        ].map(({ label, value }) => (
                                            <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
                                                <div className="text-[15px] font-bold text-slate-900 font-mono capitalize truncate">{value}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={() => { setStatsData(null); setStatsLoading(true); axios.get(`/api/v1/lectures/${lectureId}/analytics`).then(r => setStatsData(r.data)).catch(() => {}).finally(() => setStatsLoading(false)); }}
                                        className="w-full py-2 text-[12px] text-slate-400 hover:text-slate-600 transition-colors border border-slate-100 rounded-xl hover:bg-slate-50">
                                        Refresh
                                    </button>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-500">No analytics yet</p>
                                        <p className="text-xs text-slate-400 mt-1">Stats appear after content is recorded</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Control Bar ── */}
            <div className="h-16 bg-slate-900 flex items-center justify-between px-4 md:px-6 shrink-0">
                {/* Left: mic status + live level meter */}
                <div className="flex items-center gap-2.5 w-36 md:w-44">
                    {isCalibrating && (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <div className="w-3 h-3 border-2 border-slate-500 border-t-slate-300 rounded-full animate-spin shrink-0" />
                            <span className="text-xs text-slate-400 font-medium hidden md:inline">Calibrating mic...</span>
                        </div>
                    )}
                    {sessionStatus === 'recording' && !isCalibrating && (
                        <>
                            <div className="w-7 h-7 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                                <svg className="w-3.5 h-3.5 text-red-400 pulse-red" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                                </svg>
                            </div>
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
                        <span className="text-xs text-slate-600 font-semibold">Complete</span>
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
                <div className="hidden md:flex items-center gap-5 w-36 justify-end">
                    <div className="text-right">
                        <div className="text-[13px] font-bold text-white font-mono leading-tight">{transcript.length}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">chunks</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[13px] font-bold text-white font-mono leading-tight">{wordCount.toLocaleString()}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">words</div>
                    </div>
                </div>
                {/* Mobile: compact stats */}
                <div className="flex md:hidden items-center gap-3 text-right">
                    <span className="text-[12px] font-bold text-white font-mono">{wordCount.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">w</span></span>
                </div>
            </div>

            {/* ── Mobile Bottom Nav ── */}
            <nav className="md:hidden flex items-center justify-around border-t border-slate-800 bg-slate-900 h-12 shrink-0">
                {[
                    { id: 'transcript', label: 'Transcript', tab: null, icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
                    { id: 'summary',    label: 'Summary',    tab: 'summary', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
                    { id: 'ask',        label: 'Ask',        tab: 'ask',     icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
                ].map(({ id, label, tab, icon }) => {
                    const isActive = id === 'transcript' ? activePanel === 'transcript' : (activePanel === 'right' && activeTab === tab);
                    return (
                        <button key={id}
                            onClick={() => {
                                if (id === 'transcript') {
                                    setActivePanel('transcript');
                                } else {
                                    setActivePanel('right');
                                    setActiveTab(tab);
                                }
                            }}
                            className={`flex flex-col items-center gap-0.5 px-6 py-1.5 transition-colors ${isActive ? 'text-blue-400' : 'text-slate-500 hover:text-slate-400'}`}>
                            <svg className="w-4.5 h-4.5" style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={icon} />
                            </svg>
                            <span className="text-[10px] font-semibold">{label}</span>
                        </button>
                    );
                })}
            </nav>

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

                        <div className="flex-1 overflow-y-auto p-6 space-y-5">
                            {explainPanel.loading ? (
                                <div className="h-full flex flex-col items-center justify-center gap-4">
                                    <div className="w-9 h-9 border-[3px] border-slate-100 border-t-blue-600 rounded-full animate-spin" />
                                    <p className="text-sm text-slate-400">Analyzing concept...</p>
                                </div>
                            ) : explainPanel.data ? (
                                <div className="space-y-5 animate-fade-in">
                                    <div>
                                        <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest mb-2">Explanation</p>
                                        <p className="text-slate-800 leading-relaxed text-[15px]">{explainPanel.data.explanation}</p>
                                    </div>
                                    {explainPanel.data.analogy && (
                                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                                            <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest mb-2">Analogy</p>
                                            <p className="text-slate-700 leading-relaxed italic text-sm">{explainPanel.data.analogy}</p>
                                        </div>
                                    )}
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
