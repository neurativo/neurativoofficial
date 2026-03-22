import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from './lib/api';
import { supabase } from './lib/supabase';
import QAAnswer from './components/QAAnswer';

const LANGUAGE_NAMES = {
    en: 'English', ar: 'Arabic',  zh: 'Chinese',    fr: 'French',
    de: 'German',  hi: 'Hindi',   id: 'Indonesian',  it: 'Italian',
    ja: 'Japanese',ko: 'Korean',  ms: 'Malay',       nl: 'Dutch',
    pl: 'Polish',  pt: 'Portuguese', ru: 'Russian',  es: 'Spanish',
    sv: 'Swedish', ta: 'Tamil',   te: 'Telugu',      th: 'Thai',
    tr: 'Turkish', uk: 'Ukrainian',  ur: 'Urdu',     vi: 'Vietnamese',
};

// ── Timestamp formatter ────────────────────────────────────────────────────
function fmtTs(seconds) {
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// ── Summary parser ─────────────────────────────────────────────────────────
// Converts the master_summary string (## sections) into structured objects
// for the redesigned summary panel cards.
// Handles both the new structured format and old legacy format as fallback.
function parseSummary(text) {
    if (!text) return [];
    return text.split('## ').filter(s => s.trim()).map((block) => {
        const lines = block.split('\n');
        const title = lines[0].trim();
        const highlights = [];
        const concepts = [];
        const examples = [];
        const proseLines = [];

        for (const line of lines.slice(1)) {
            const l = line.trim();
            // Skip empty lines and section separators
            if (!l || l === '---') continue;

            // Highlight lines: start with ">" (new and old format)
            if (l.startsWith('>')) {
                highlights.push(l.replace(/^>\s*/, ''));
                continue;
            }

            // New format: "Key concepts: `term`, `term`, ..."
            if (/^key concepts:/i.test(l)) {
                const matches = l.match(/`([^`]+)`/g);
                if (matches) matches.forEach(m => concepts.push(m.replace(/`/g, '').trim()));
                continue;
            }

            // New format: "Examples:" header line — skip, the → lines below are handled
            if (/^examples:$/i.test(l)) continue;

            // New format: lines starting with "→" are example items
            if (l.startsWith('→')) {
                examples.push(l.replace(/^→\s*/, '').trim());
                continue;
            }

            // Old format: "- " bullet lines
            if (l.startsWith('- ')) {
                const content = l.slice(2).trim();
                const lc = content.toLowerCase();
                if (content.startsWith('→') || lc.includes('example') || lc.includes('e.g.')) {
                    examples.push(content.replace(/^→\s*/, ''));
                } else if (/`[^`]+`/.test(content) || content.split(/\s+/).length < 5) {
                    concepts.push(content.replace(/`/g, '').trim());
                } else {
                    proseLines.push(content);
                }
                continue;
            }

            proseLines.push(l);
        }

        // Strip **bold** markdown so asterisks never appear as literal characters
        const fullProse = proseLines
            .map(l => l.replace(/\*\*(.*?)\*\*/g, '$1'))
            .join(' ')
            .trim();

        // Lead sentence: first sentence (up to '. ') that is >= 40 chars.
        // If no sentence reaches 40 chars, use the whole prose as lead.
        let lead_sentence = fullProse;
        let prose = '';
        let searchFrom = 0;
        let found = false;
        while (searchFrom < fullProse.length) {
            const idx = fullProse.indexOf('. ', searchFrom);
            if (idx === -1) break;
            if (idx + 1 >= 40) {             // sentence including period is >= 40 chars
                lead_sentence = fullProse.slice(0, idx + 1);
                prose = fullProse.slice(idx + 2).trim();
                found = true;
                break;
            }
            searchFrom = idx + 2;
        }
        // If nothing met the 40-char bar, fall back to the first '. ' split
        if (!found) {
            const fallbackDot = fullProse.indexOf('. ');
            if (fallbackDot !== -1) {
                lead_sentence = fullProse.slice(0, fallbackDot + 1);
                prose = fullProse.slice(fallbackDot + 2).trim();
            }
        }

        return { title, lead_sentence, prose, concepts, examples, highlights };
    });
}

function App({ user }) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

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
    const [endModal, setEndModal]             = useState(false);

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

    // ── CIF: student questions detected in transcript ──
    const [studentQuestions, setStudentQuestions] = useState([]);
    const [questionsOpen, setQuestionsOpen]       = useState(true);

    // ── Resilience state ──────────────────────────────────
    const [isOnline, setIsOnline]               = useState(navigator.onLine);
    const [connQuality, setConnQuality]         = useState('good'); // 'good' | 'poor' | 'offline'
    const [chunkBufferCount, setChunkBufferCount] = useState(0);
    const [recoverySession, setRecoverySession] = useState(null);

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
    // Fix 5 + 10: stable refs for async callbacks (beforeunload, SSE reconnect)
    const lectureIdRef        = useRef(null);
    const sessionStatusRef    = useRef('idle');
    // Resilience refs
    const chunkBufferRef      = useRef([]);           // offline chunk queue
    const uploadQueueRef      = useRef(Promise.resolve()); // serializes uploads
    const wakeLockRef         = useRef(null);         // screen wake lock
    const timerWorkerRef      = useRef(null);         // 12s chunk timer worker
    const sseReconnectRef     = useRef(0);            // SSE reconnect attempt count

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
        const onKey = (e) => {
            if (e.key === 'Escape') {
                setExplainPanel(p => ({ ...p, show: false }));
                setSearchActive(false);
                setSearchQuery('');
            }
            // Keyboard shortcuts only when no input is focused
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
            const st = sessionStatusRef.current;
            if (e.key === ' ' && (st === 'recording' || st === 'paused')) {
                e.preventDefault();
                if (st === 'recording') pauseSession();
                else startRecording(lectureIdRef.current);
            }
            if (e.key === 'e' && (st === 'recording' || st === 'paused')) {
                e.preventDefault();
                endSession();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Fix 5 + 10: keep stable refs in sync with state for use in async callbacks
    useEffect(() => { lectureIdRef.current     = lectureId;     }, [lectureId]);
    useEffect(() => { sessionStatusRef.current = sessionStatus; }, [sessionStatus]);

    // Resilience 8 / Fix 10: graceful session end + wake lock release on tab close
    useEffect(() => {
        const onUnload = () => {
            const id = lectureIdRef.current;
            const st = sessionStatusRef.current;
            if (id && (st === 'recording' || st === 'paused')) {
                navigator.sendBeacon(`/api/v1/live/${id}/end`);
            }
            releaseWakeLock();
        };
        window.addEventListener('beforeunload', onUnload);
        return () => window.removeEventListener('beforeunload', onUnload);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Fix 10 / Resilience: complete cleanup on component unmount
    useEffect(() => {
        return () => {
            isRecordingRef.current = false;
            cancelAnimationFrame(animFrameRef.current);
            if (audioContextRef.current?.state !== 'closed') {
                audioContextRef.current?.close();
                audioContextRef.current = null;
            }
            if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
            if (timerWorkerRef.current) {
                timerWorkerRef.current.postMessage('stop');
                timerWorkerRef.current.terminate();
                timerWorkerRef.current = null;
            }
            releaseWakeLock();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Stats tab: fetch analytics + lecture details when tab opens
    useEffect(() => {
        if (activeTab === 'stats' && lectureId) {
            setStatsLoading(true);
            setStatsData(null);
            Promise.all([
                api.get(`/api/v1/lectures/${lectureId}/analytics`),
                api.get(`/api/v1/lectures/${lectureId}`).catch(() => ({ data: {} })),
            ]).then(([analyticsRes, lectureRes]) => {
                setStatsData({ ...analyticsRes.data, _lecture: lectureRes.data });
            }).catch(() => {}).finally(() => setStatsLoading(false));
        }
    }, [activeTab, lectureId]);

    // Section slide-in: detect when new sections appear in summary
    useEffect(() => {
        if (!summary) { prevSectionCountRef.current = 0; return; }
        const sections = summary.split('## ').filter(s => s.trim());
        if (sections.length > prevSectionCountRef.current && prevSectionCountRef.current > 0) {
            setNewSectionIdx(sections.length - 1);
            const t = setTimeout(() => setNewSectionIdx(null), 3000);
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
            api.get('/api/v1/lectures?limit=5')
                .then(res => {
                    const list = Array.isArray(res.data) ? res.data
                               : Array.isArray(res.data?.lectures) ? res.data.lectures
                               : [];
                    setRecentSessions(list);
                })
                .catch(() => {}); // endpoint may not exist — fail silently
        }
    }, [sessionStatus]);

    // Resilience 1: online/offline detection + buffer drain on reconnect
    useEffect(() => {
        const goOnline = () => {
            setIsOnline(true);
            setConnQuality('good');
            // Drain buffered chunks through the upload queue
            const buffer = chunkBufferRef.current.splice(0);
            setChunkBufferCount(0);
            for (const { blob, targetId } of buffer) {
                uploadQueueRef.current = uploadQueueRef.current
                    .then(() => uploadChunkWithRetry(blob, targetId))
                    .catch(() => {});
            }
        };
        const goOffline = () => { setIsOnline(false); setConnQuality('offline'); };
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Resilience 6: check for interrupted session on app load
    useEffect(() => {
        try {
            const saved = sessionStorage.getItem('neurativo_session');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.lectureId && (parsed.sessionStatus === 'recording' || parsed.sessionStatus === 'paused')) {
                    setRecoverySession(parsed);
                } else {
                    sessionStorage.removeItem('neurativo_session');
                }
            }
        } catch {}
    }, []);

    // Load lecture from URL param (?lecture=id) — view a completed session from dashboard
    useEffect(() => {
        const paramId = searchParams.get('lecture');
        if (!paramId) return;
        api.get(`/api/v1/lectures/${paramId}`)
            .then(res => {
                setLectureId(paramId);
                if (res.data.transcript) setTranscript([{ id: Date.now(), text: res.data.transcript }]);
                const ms = res.data.master_summary || res.data.summary;
                if (ms) setSummary(ms);
                if (res.data.language) setDetectedLanguage(res.data.language);
                if (res.data.topic) setDetectedTopic(res.data.topic);
                setSessionStatus('ended');
            })
            .catch(() => {});
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Resilience 6: persist session state to sessionStorage on every relevant change
    useEffect(() => {
        if (lectureId && sessionStatus !== 'idle') {
            try {
                sessionStorage.setItem('neurativo_session', JSON.stringify({
                    lectureId, sessionStatus, recordingSeconds, detectedLanguage, detectedTopic,
                }));
            } catch {}
        }
        if (sessionStatus === 'idle') {
            sessionStorage.removeItem('neurativo_session');
        }
    }, [lectureId, sessionStatus, recordingSeconds, detectedLanguage, detectedTopic]);

    // Resilience 5: re-acquire wake lock when tab becomes visible again
    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === 'visible' && isRecordingRef.current) {
                requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Helpers ───────────────────────────────────────────

    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    const wordCount = transcript.reduce((n, seg) => n + seg.text.split(/\s+/).filter(Boolean).length, 0);

    const showError = (msg, duration = 4000) => {
        setErrorMessage(msg);
        if (duration) setTimeout(() => setErrorMessage(null), duration);
    };

    // Resilience 5: Screen Wake Lock — prevents device sleep during lecture recording
    const requestWakeLock = async () => {
        if (!('wakeLock' in navigator)) return;
        try {
            wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch (err) {
            // wake lock unavailable on this device/browser
        }
    };

    const releaseWakeLock = () => {
        wakeLockRef.current?.release();
        wakeLockRef.current = null;
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
            // Resilience 10: reset reconnect counter on any successful message
            sseReconnectRef.current = 0;
            try {
                const data = JSON.parse(e.data);
                if (data.event === 'session-timeout') {
                    es.close();
                    sseRef.current = null;
                    return;
                }
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

        // Resilience 10: exponential backoff reconnect with polling fallback
        es.onerror = () => {
            es.close();
            sseRef.current = null;
            const st = sessionStatusRef.current;
            if (st !== 'recording' && st !== 'paused') return;

            const MAX_SSE_RECONNECTS = 10;
            if (sseReconnectRef.current >= MAX_SSE_RECONNECTS) {
                // Fall back to polling every 30s after exhausting reconnects
                const pollInterval = setInterval(async () => {
                    const currentSt = sessionStatusRef.current;
                    if (currentSt !== 'recording' && currentSt !== 'paused') {
                        clearInterval(pollInterval);
                        return;
                    }
                    try {
                        const res = await api.get(`/api/v1/lectures/${lectureIdRef.current}`);
                        if (res.data.master_summary) setSummary(res.data.master_summary);
                    } catch {}
                }, 30000);
                return;
            }

            sseReconnectRef.current += 1;
            const delay = Math.min(1000 * sseReconnectRef.current, 10000);
            setTimeout(() => {
                const currentSt = sessionStatusRef.current;
                if (currentSt === 'recording' || currentSt === 'paused') {
                    connectSSE(id);
                    // Catchup: fetch latest summary immediately after reconnect
                    api.get(`/api/v1/lectures/${id}`).then(res => {
                        if (res.data.master_summary) setSummary(res.data.master_summary);
                    }).catch(() => {});
                }
            }, delay);
        };

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
            const res = await api.post('/api/v1/live/start');
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
            setStudentQuestions([]);
            setQuestionsOpen(true);
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

            // Fix 6: recover from unexpected microphone disconnects
            stream.getTracks().forEach(track => {
                track.onended = () => {
                    // If we stopped intentionally (pause/end), isRecordingRef is already false — ignore
                    if (!isRecordingRef.current) return;
                    showError('Microphone disconnected. Reconnecting…', 0);
                    isRecordingRef.current = false;
                    setSessionStatus('paused');
                    stopAudioMonitoring();
                    setTimeout(() => startRecording(targetId), 2000);
                };
            });

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

            // Resilience 5: request screen wake lock so device doesn't sleep
            await requestWakeLock();

            // Resilience 7: create Web Worker for 12s tick — not throttled in background tabs
            if (timerWorkerRef.current) {
                timerWorkerRef.current.postMessage('stop');
                timerWorkerRef.current.terminate();
                timerWorkerRef.current = null;
            }
            timerWorkerRef.current = new Worker(
                new URL('./workers/timerWorker.js', import.meta.url)
            );

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
                // Resilience 7: point worker tick at the current recorder instance
                if (timerWorkerRef.current) {
                    timerWorkerRef.current.onmessage = () => {
                        if (recorder.state === 'recording') recorder.stop();
                    };
                }
                recorder.start();
                // setTimeout replaced by timerWorker (not throttled in background tabs)
            };

            isRecordingRef.current = true;
            setSessionStatus('recording');
            startLoop();
            // Start the 12s worker tick after the first recorder starts
            timerWorkerRef.current?.postMessage('start');
        } catch (err) {
            setIsCalibrating(false);
            const reason = err.name === 'NotAllowedError'  ? 'Microphone access denied.'
                         : err.name === 'NotFoundError'    ? 'No microphone found on this device.'
                         : err.name === 'NotReadableError' ? 'Microphone is in use by another app.'
                         : `Microphone error: ${err.message}`;
            showError(reason, 0);
        }
    };

    // Resilience 3: actual upload with 25s axios timeout + exponential backoff retry
    // Resilience 4: measure round-trip latency to set connQuality
    const uploadChunkWithRetry = async (blob, targetId, attempt = 0) => {
        const formData = new FormData();
        formData.append('file', new File([blob], 'chunk.webm', { type: 'audio/webm' }));
        const start = Date.now();
        try {
            const res = await api.post(
                `/api/v1/live/${targetId}/chunk`,
                formData,
                { timeout: 25000 },
            );
            // Resilience 4: update connection quality from round-trip latency
            const latency = Date.now() - start;
            setConnQuality(latency > 8000 ? 'poor' : 'good');

            if (res.data.chunk_transcript) {
                const rawText = res.data.chunk_transcript.trim();
                const overlap = lastOverlapRef.current;
                const displayText = overlap ? `${overlap} ${rawText}` : rawText;
                setTranscript(prev => [...prev, { id: Date.now(), text: displayText, timestamp: fmtTs(prev.length * 12) }]);
                lastOverlapRef.current = getLastTwoSentences(rawText);
            }
            // Use functional updates — safe in stale closures (online/offline drain effect)
            if (res.data.language) setDetectedLanguage(prev => prev || res.data.language);
            if (res.data.topic)    setDetectedTopic(prev => prev || res.data.topic);
            if (res.data.nast?.composite != null) setNastScore(res.data.nast.composite);
            if (res.data.cif_type === 'STUDENT_QUESTION' && res.data.cif_confidence > 0.75) {
                if (res.data.chunk_transcript) {
                    setStudentQuestions(prev => [...prev, {
                        id: Date.now(),
                        text: res.data.chunk_transcript.trim(),
                    }]);
                }
            }
        } catch (err) {
            if (attempt < 2 && navigator.onLine) {
                await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
                return uploadChunkWithRetry(blob, targetId, attempt + 1);
            }
            if (!navigator.onLine) {
                // Re-buffer on failure when offline (will drain on next 'online' event)
                if (chunkBufferRef.current.length >= 5) chunkBufferRef.current.shift();
                chunkBufferRef.current.push({ blob, targetId });
                setChunkBufferCount(chunkBufferRef.current.length);
            } else {
                showError('Upload failed after 3 attempts — small gap may exist', 3000);
            }
        }
    };

    // Resilience 1: buffer offline chunks; Resilience 2: serialize uploads via queue
    const uploadChunk = (blob, targetId) => {
        if (!navigator.onLine) {
            // Buffer up to 5 chunks while offline; drop oldest beyond that
            if (chunkBufferRef.current.length >= 5) chunkBufferRef.current.shift();
            chunkBufferRef.current.push({ blob, targetId });
            setChunkBufferCount(chunkBufferRef.current.length);
            return;
        }
        // Chain onto queue — next upload waits for previous to finish
        uploadQueueRef.current = uploadQueueRef.current
            .then(() => uploadChunkWithRetry(blob, targetId))
            .catch(() => {});
    };

    const pauseSession = () => {
        isRecordingRef.current = false;
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
        stopAudioMonitoring();
        silentChunksRef.current = 0;
        setIsCalibrating(false);
        // Resilience 7: stop worker tick
        if (timerWorkerRef.current) {
            timerWorkerRef.current.postMessage('stop');
            timerWorkerRef.current.terminate();
            timerWorkerRef.current = null;
        }
        // Resilience 5: release wake lock on pause
        releaseWakeLock();
        setSessionStatus('paused');
    };

    const endSession = async () => {
        pauseSession(); // stops worker + releases wake lock
        disconnectSSE();
        sseReconnectRef.current = 0;
        sessionStorage.removeItem('neurativo_session');
        setSessionStatus('ended');
        setEndModal(true);
        try { await api.post(`/api/v1/live/${lectureId}/end`); } catch {}
    };

    const handleExplainRequest = async () => {
        if (!lectureId || !selectionInfo.text) return;
        setSelectionInfo(p => ({ ...p, show: false }));
        setExplainPanel({ show: true, loading: true, data: null });
        try {
            const res = await api.post(`/api/v1/explain/${lectureId}`, { text: selectionInfo.text, mode: 'simple' });
            setExplainPanel({ show: true, loading: false, data: res.data });
        } catch {
            setExplainPanel({ show: true, loading: false, data: { explanation: 'Failed to generate explanation.' } });
        }
    };

    const handleExportPDF = async () => {
        if (!lectureId) return;
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
        let stageIdx = 0;
        setExportModal({ show: true, progress: STAGES[0].pct, status: STAGES[0].msg, error: null });
        const interval = setInterval(() => {
            stageIdx = Math.min(stageIdx + 1, STAGES.length - 1);
            setExportModal(p => ({ ...p, progress: STAGES[stageIdx].pct, status: STAGES[stageIdx].msg }));
        }, 2500);
        try {
            const res = await api.get(`/api/v1/lectures/${lectureId}/export/pdf`, { responseType: 'blob' });
            clearInterval(interval);
            setExportModal({ show: true, progress: 100, status: 'Your report is ready!', error: null });
            setTimeout(() => {
                const url = window.URL.createObjectURL(new Blob([res.data]));
                const a = document.createElement('a');
                a.href = url;
                a.setAttribute('download', 'Neurativo_Report.pdf');
                a.click();
                setTimeout(() => setExportModal(p => ({ ...p, show: false })), 1500);
            }, 400);
        } catch (err) {
            clearInterval(interval);
            const msg = err?.response?.data?.detail || err?.message || 'Unknown error';
            setExportModal({ show: true, progress: -1, status: 'Export failed', error: msg });
        }
    };

    const handleAsk = async (e) => {
        e.preventDefault();
        if (!lectureId || !qaQuestion.trim()) return;
        const question = qaQuestion;
        setQaQuestion('');
        setQaLoading(true);
        try {
            const res = await api.post(`/api/v1/ask/${lectureId}`, { question });
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
                <div key={i} className="w-[3px] bg-[#1a1a1a] rounded-full"
                    style={{ height: '8%', opacity: 0.4, transition: 'none' }} />
            ))}
        </div>
    );

    const TabButton = ({ id, label, badge }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex-1 h-8 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5
                ${activeTab === id
                    ? 'bg-white text-[#1a1a1a] shadow-sm border border-[#f0ede8]'
                    : 'text-[#6b6b6b] hover:text-[#1a1a1a]'}`}
        >
            {label}
            {badge > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#f0ede8] text-[#1a1a1a] text-[10px] flex items-center justify-center font-bold leading-none">
                    {badge > 9 ? '9+' : badge}
                </span>
            )}
        </button>
    );

    // ═══════════════════════════════════════════
    //  IDLE: Welcome Screen
    // ═══════════════════════════════════════════

    // Resilience 6: session recovery flow
    const handleResumeSession = async () => {
        const { lectureId: savedId, detectedLanguage: savedLang, detectedTopic: savedTopic } = recoverySession;
        setRecoverySession(null);
        setLectureId(savedId);
        setRecordingSeconds(recoverySession.recordingSeconds || 0);
        if (savedLang) setDetectedLanguage(savedLang);
        if (savedTopic) setDetectedTopic(savedTopic);
        try {
            const res = await api.get(`/api/v1/lectures/${savedId}`);
            if (res.data.transcript) {
                setTranscript([{ id: Date.now(), text: res.data.transcript }]);
            }
            const masterSummary = res.data.master_summary || res.data.summary;
            if (masterSummary) setSummary(masterSummary);
        } catch {}
        connectSSE(savedId);
        setSessionStatus('paused'); // user must manually resume — mic requires user gesture
    };

    if (sessionStatus === 'idle') {
        return (
            <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center p-6 relative overflow-hidden">
                {/* Subtle background texture */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-[#f0ede8]/60 rounded-full blur-3xl" />
                    <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-[#f0ede8]/40 rounded-full blur-3xl" />
                </div>

                {/* Resilience 6: Session recovery modal */}
                {recoverySession && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
                        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mb-4">
                                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                            </div>
                            <h2 className="text-[15px] font-bold text-[#1a1a1a] mb-1">Session interrupted</h2>
                            <p className="text-[13px] text-[#6b6b6b] mb-5 leading-relaxed">
                                You have an active session from before. Would you like to resume where you left off?
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleResumeSession}
                                    className="flex-1 py-2.5 bg-[#1a1a1a] hover:opacity-80 text-[#fafaf9] text-[13px] font-bold rounded-xl transition-colors">
                                    Resume Session
                                </button>
                                <button
                                    onClick={() => { setRecoverySession(null); sessionStorage.removeItem('neurativo_session'); }}
                                    className="flex-1 py-2.5 bg-[#f0ede8] hover:bg-[#e8e4de] text-[#1a1a1a] text-[13px] font-semibold rounded-xl transition-colors">
                                    Start New
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {errorMessage && (
                    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-3 animate-fade-in">
                        <span>{errorMessage}</span>
                        <button onClick={() => setErrorMessage(null)} className="opacity-60 hover:opacity-100 transition-opacity">✕</button>
                    </div>
                )}

                <div className="relative w-full max-w-sm animate-fade-in">
                    {/* Brand + nav */}
                    <div className="flex items-center gap-2.5 mb-8">
                        <div className="w-9 h-9 rounded-xl bg-[#1a1a1a] flex items-center justify-center ">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <span className="text-xl font-bold text-[#1a1a1a] font-heading flex-1">Neurativo</span>
                        {/* Dashboard link */}
                        <button
                            onClick={() => navigate('/app')}
                            className="text-[12px] text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors flex items-center gap-1"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
                            </svg>
                            Dashboard
                        </button>
                        {/* User avatar */}
                        {user && (
                            <button
                                onClick={async () => { await supabase.auth.signOut(); navigate('/auth'); }}
                                title={`Signed in as ${user.email} — click to sign out`}
                                className="w-7 h-7 rounded-full bg-[#1a1a1a] text-[#fafaf9] text-[11px] font-bold flex items-center justify-center hover:opacity-80 transition-opacity ml-1"
                            >
                                {user.email?.[0].toUpperCase() ?? '?'}
                            </button>
                        )}
                    </div>

                    {/* Headline */}
                    <h1 className="text-[28px] font-bold text-[#1a1a1a] leading-tight mb-3 font-heading">
                        Your AI<br />lecture assistant.
                    </h1>
                    <p className="text-[#6b6b6b] text-sm leading-relaxed mb-8">
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
                            <div key={label} className="flex items-start gap-3 text-sm bg-white border border-[#f0ede8] rounded-xl px-3.5 py-3 shadow-sm">
                                <svg className="w-4 h-4 text-[#6b6b6b] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                                </svg>
                                <div>
                                    <div className="text-[12px] font-semibold text-[#1a1a1a] leading-tight">{label}</div>
                                    <div className="text-[11px] text-[#a3a3a3] mt-0.5">{sub}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* CTA */}
                    <button onClick={startLiveSession}
                        className="w-full py-3.5 bg-[#1a1a1a] hover:opacity-80 text-[#fafaf9] font-bold rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 text-[15px]">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        Start Live Session
                    </button>
                    <p className="text-center text-xs text-[#a3a3a3] mt-3">Microphone access required</p>

                    {/* Recent sessions */}
                    {recentSessions.length > 0 && (
                        <div className="mt-8">
                            <p className="text-[11px] font-semibold text-[#a3a3a3] uppercase tracking-wider mb-2.5">Recent Sessions</p>
                            <div className="space-y-1.5">
                                {recentSessions.slice(0, 3).map(session => (
                                    <div key={session.id} className="flex items-center gap-3 bg-white border border-[#f0ede8] rounded-xl px-4 py-2.5">
                                        <svg className="w-3.5 h-3.5 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                        <span className="flex-1 truncate text-[13px] text-[#6b6b6b]">{session.title || 'Untitled Session'}</span>
                                        {session.created_at && (
                                            <span className="text-[11px] text-[#a3a3a3] shrink-0">
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
        <div className="h-screen bg-white flex flex-col overflow-hidden selection:bg-[#f0ede8]">

            {/* ── Resilience 1: Offline Banner ── */}
            {!isOnline && (sessionStatus === 'recording' || sessionStatus === 'paused') && (
                <div className="bg-amber-400 text-amber-900 text-xs font-semibold px-4 py-1.5 text-center shrink-0 z-40">
                    No connection — recording continues locally.{chunkBufferCount > 0 ? ` ${chunkBufferCount} chunk${chunkBufferCount > 1 ? 's' : ''} queued.` : ''}
                </div>
            )}

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
            <header className="h-14 border-b border-[#f0ede8] flex items-center justify-between px-4 md:px-5 shrink-0 bg-white z-30">
                {/* Left: brand + status */}
                <div className="flex items-center gap-2 md:gap-4 min-w-0">
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="w-7 h-7 rounded-lg bg-[#1a1a1a] flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <span className="font-bold text-[#1a1a1a] font-heading text-[15px]">Neurativo</span>
                    </div>

                    <div className="h-4 w-px bg-slate-200 hidden md:block" />

                    {sessionStatus === 'recording' && (
                        <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
                            <div className="w-2 h-2 rounded-full bg-red-500 pulse-red" />
                            <span className="font-mono text-[13px]">{formatTime(recordingSeconds)}</span>
                            {/* Resilience 4: connection quality dot */}
                            <div
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                    connQuality === 'offline' ? 'bg-red-400' :
                                    connQuality === 'poor'    ? 'bg-amber-400' :
                                    'bg-green-400'
                                }`}
                                title={connQuality === 'offline' ? 'Offline' : connQuality === 'poor' ? 'Poor connection' : 'Good connection'}
                            />
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
                        <div className="flex items-center gap-2 text-[13px] text-[#a3a3a3] font-medium">
                            <div className="w-2 h-2 rounded-full bg-slate-300" />
                            <span className="hidden md:inline">Session ended · {formatTime(recordingSeconds)}</span>
                        </div>
                    )}

                    {/* Language + Topic + N.A.S.T. badges */}
                    {(detectedLanguage || detectedTopic || nastScore != null) && (
                        <div className="flex items-center gap-1.5 overflow-hidden">
                            {detectedLanguage && (
                                <span className="px-2 py-0.5 rounded-md bg-[#fafaf9] text-blue-700 text-[11px] font-semibold uppercase tracking-wide border border-blue-100 shrink-0">
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
                    {/* Back to dashboard */}
                    <button
                        onClick={() => navigate('/app')}
                        className="hidden md:flex items-center gap-1 btn-ghost text-[12px] text-[#a3a3a3] hover:text-[#1a1a1a]"
                        title="Back to dashboard"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
                        </svg>
                    </button>
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
                            className="hidden md:flex items-center gap-1.5 btn-ghost border border-[#f0ede8]">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Export PDF
                        </button>
                    )}
                    {sessionStatus !== 'ended' && (
                        <button onClick={endSession}
                            className="px-4 py-1.5 text-sm font-semibold bg-[#1a1a1a] text-white hover:bg-[#333] rounded-lg transition-colors">
                            End
                        </button>
                    )}
                </div>
            </header>

            {/* ── Main: Transcript + Right Panel ── */}
            <div className="flex flex-1 overflow-hidden">

                {/* ── LEFT: Transcript ── */}
                <div className={`flex-1 flex flex-col border-r border-[#f0ede8] min-w-0 ${activePanel !== 'transcript' ? 'hidden md:flex' : 'flex'}`}>

                    {/* Panel header */}
                    <div className="panel-header">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <span className="panel-label shrink-0">Transcript</span>
                            {!searchActive && transcript.length > 0 && (
                                <span className="text-[11px] text-[#a3a3a3] font-mono truncate">
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
                                        className="flex-1 bg-transparent text-[12px] text-[#1a1a1a] placeholder:text-[#a3a3a3] outline-none min-w-0"
                                    />
                                    {searchQuery && (
                                        <span className="text-[11px] text-[#a3a3a3] shrink-0 font-mono">
                                            {filteredTranscript.length}/{transcript.length}
                                        </span>
                                    )}
                                    <button onClick={() => { setSearchActive(false); setSearchQuery(''); }}
                                        className="text-[#a3a3a3] hover:text-[#6b6b6b] shrink-0 transition-colors text-xs">✕</button>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {!searchActive && (
                                <button onClick={() => setSearchActive(true)}
                                    className="w-7 h-7 flex items-center justify-center text-[#a3a3a3] hover:text-[#1a1a1a] rounded-lg transition-colors">
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
                                            <div key={seg.id} className="group flex gap-4 px-3 py-3 rounded-xl hover:bg-[#fafaf9] transition-colors animate-fade-in">
                                                <span className="text-[10px] text-[#a3a3a3] font-mono pt-[4px] shrink-0 select-none" style={{ minWidth: 36, textAlign: 'right' }}>{seg.timestamp || fmtTs(i * 12)}</span>
                                                <p className="flex-1 text-[15px] leading-relaxed text-[#1a1a1a] group-hover:text-[#1a1a1a] transition-colors">{parts}</p>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={seg.id}
                                            className="group flex gap-4 px-3 py-3 rounded-xl hover:bg-[#fafaf9] transition-colors animate-fade-in"
                                            style={{ animationDelay: `${Math.min(i, 4) * 0.04}s` }}>
                                            <span className="text-[10px] text-[#a3a3a3] font-mono pt-[4px] shrink-0 select-none" style={{ minWidth: 36, textAlign: 'right' }}>{seg.timestamp || fmtTs(i * 12)}</span>
                                            <p className="flex-1 text-[15px] leading-relaxed text-[#1a1a1a] group-hover:text-[#1a1a1a] transition-colors">{seg.text}</p>
                                        </div>
                                    );
                                })}

                                {/* Listening indicator */}
                                {sessionStatus === 'recording' && !searchQuery && (
                                    <div className="flex gap-4 px-3 py-3">
                                        <span className="w-6" />
                                        <div className="flex items-center gap-2 text-[#a3a3a3]">
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
                                        <p className="text-sm text-[#a3a3a3]">No matches for "{searchQuery}"</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-8">
                                {sessionStatus === 'recording' ? (
                                    <>
                                        <div className="flex items-end gap-1 h-8 mb-1">
                                            {[40, 65, 85, 55, 40].map((h, i) => (
                                                <div key={i} className="w-1.5 rounded-full bg-[#e0ddd8] animate-pulse"
                                                    style={{ height: `${h}%`, animationDelay: `${i * 0.2}s` }} />
                                            ))}
                                        </div>
                                        <p className="text-sm font-medium text-[#6b6b6b]">Listening for speech...</p>
                                        <p className="text-xs text-[#a3a3a3]">First transcript arrives in ~12 seconds</p>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-10 h-10 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                        </svg>
                                        <p className="text-sm text-[#a3a3a3]">No transcript yet</p>
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
                    <div className="h-10 flex items-center gap-1 px-2 border-b border-[#f0ede8] bg-[#fafaf9]/80 shrink-0">
                        <TabButton id="summary" label="Summary" />
                        <TabButton id="ask" label="Ask" badge={qaHistory.length} />
                        <TabButton id="stats" label="Stats" />
                    </div>

                    {/* ── Summary Tab ── */}
                    {activeTab === 'summary' && (
                        <div onMouseUp={handleTextSelection} className="flex-1 flex flex-col overflow-hidden">

                            {/* Panel sub-header */}
                            <div className="h-9 px-3 border-b border-[#f0ede8] flex items-center justify-between shrink-0 bg-white">
                                <span className="text-[11px] font-semibold text-[#a3a3a3] uppercase tracking-wider">Summary</span>
                                <div className="flex items-center gap-1 font-mono text-[11px] text-[#a3a3a3]">
                                    {(() => {
                                        const count = parseSummary(summary).length;
                                        return <span>{count} section{count !== 1 ? 's' : ''}</span>;
                                    })()}
                                    {sessionStatus === 'recording' && (
                                        <span className="flex items-center gap-1 ml-1">
                                            ·&nbsp;<span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />&nbsp;live
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Scrollable content */}
                            <div className="flex-1 overflow-y-auto">
                                {summary ? (
                                    <div className="p-3 space-y-2.5">
                                        {parseSummary(summary).map((sec, idx) => {
                                            const isNew = idx === newSectionIdx;
                                            return (
                                                <div key={idx}
                                                    className="summary-card-enter overflow-hidden"
                                                    style={{
                                                        border: '0.5px solid #e2e8f0',
                                                        borderRadius: isNew ? '0 12px 12px 0' : '12px',
                                                        boxShadow: isNew ? 'inset 3px 0 0 #2563eb' : 'none',
                                                        transition: 'box-shadow 600ms ease, border-radius 600ms ease',
                                                    }}>

                                                    {/* Card header */}
                                                    <div className="px-3 py-2 bg-[#fafaf9] border-b border-[#f0ede8] flex items-center gap-2">
                                                        <span className="text-[11px] font-mono text-[#a3a3a3] shrink-0 select-none">
                                                            {String(idx + 1).padStart(2, '0')}
                                                        </span>
                                                        <span className="flex-1 text-[12px] font-medium text-[#1a1a1a] leading-tight min-w-0 truncate">
                                                            {sec.title}
                                                        </span>
                                                        {isNew && (
                                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0 select-none">
                                                                new
                                                            </span>
                                                        )}
                                                        <button
                                                            onClick={() => handleCopySection(
                                                                [sec.lead_sentence, sec.prose, ...sec.concepts, ...sec.examples].filter(Boolean).join(' '),
                                                                idx
                                                            )}
                                                            title="Copy section"
                                                            className="w-5 h-5 flex items-center justify-center text-[#a3a3a3] hover:text-[#1a1a1a] rounded transition-colors shrink-0">
                                                            {copiedSectionIdx === idx ? (
                                                                <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            ) : (
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    </div>

                                                    {/* Card body */}
                                                    <div className="px-3 py-3">
                                                        {/* Lead sentence — most important line */}
                                                        {sec.lead_sentence && (
                                                            <p className="text-[13px] font-medium text-[#1a1a1a] leading-[1.6] mb-2">
                                                                {sec.lead_sentence}
                                                            </p>
                                                        )}

                                                        {/* Highlight block */}
                                                        {sec.highlights.length > 0 && (
                                                            <div className="mb-2.5"
                                                                style={{ borderLeft: '3px solid #F59E0B', background: '#FAEEDA', borderRadius: '0 6px 6px 0', padding: '8px 12px' }}>
                                                                {sec.highlights.map((h, hi) => (
                                                                    <p key={hi} className="text-[12px] italic leading-relaxed" style={{ color: '#633806' }}>{h}</p>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Prose */}
                                                        {sec.prose && (
                                                            <p className="text-[12px] text-[#6b6b6b] leading-[1.7] mb-2.5">
                                                                {sec.prose}
                                                            </p>
                                                        )}

                                                        {/* Concept pills */}
                                                        {sec.concepts.length > 0 && (
                                                            <div className="mb-2">
                                                                <p className="text-[9px] font-semibold text-[#a3a3a3] uppercase tracking-wider mb-1.5">Key concepts</p>
                                                                <div className="concepts-row">
                                                                    {sec.concepts.map((c, ci) => (
                                                                        <span key={ci} className="concept-pill">{c}</span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Example list */}
                                                        {sec.examples.length > 0 && (
                                                            <div>
                                                                <p className="text-[9px] font-semibold text-[#a3a3a3] uppercase tracking-wider mb-1.5">Examples</p>
                                                                <div className="pl-2.5" style={{ borderLeft: '2px solid #5DCAA5' }}>
                                                                    {sec.examples.map((ex, ei) => (
                                                                        <p key={ei} className="text-[11px] text-[#6b6b6b] leading-relaxed">
                                                                            <span style={{ color: '#1D9E75' }}>→ </span>{ex}
                                                                        </p>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <p className="text-[11px] text-[#a3a3a3] text-center py-2 italic">
                                            Select any text to get an AI explanation
                                        </p>

                                        {/* ── Questions Raised (CIF-detected) ── */}
                                        {studentQuestions.length > 0 && (
                                            <div className="mt-1 rounded-xl overflow-hidden" style={{ border: '0.5px solid #e2e8f0' }}>
                                                {/* Collapsible header */}
                                                <button
                                                    onClick={() => setQuestionsOpen(o => !o)}
                                                    className="w-full px-3 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2 hover:bg-amber-100/60 transition-colors">
                                                    <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <span className="flex-1 text-left text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
                                                        Questions Raised
                                                    </span>
                                                    <span className="text-[10px] font-mono text-amber-500 mr-1">{studentQuestions.length}</span>
                                                    <svg
                                                        className={`w-3 h-3 text-amber-400 transition-transform ${questionsOpen ? 'rotate-180' : ''}`}
                                                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </button>
                                                {/* Question cards */}
                                                {questionsOpen && (
                                                    <div className="divide-y divide-slate-100">
                                                        {studentQuestions.map((q, qi) => (
                                                            <div key={q.id} className="px-3 py-2.5 bg-white animate-fade-in">
                                                                <div className="flex items-start gap-2">
                                                                    <span className="text-[10px] font-mono text-amber-400 pt-[2px] shrink-0 select-none">
                                                                        Q{qi + 1}
                                                                    </span>
                                                                    <p className="text-[12px] text-[#6b6b6b] leading-relaxed">{q.text}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* Skeleton empty state — 3 shimmer placeholder cards */
                                    <div className="p-3 space-y-2.5">
                                        {[110, 80, 95].map((titleW, i) => (
                                            <div key={i} className="rounded-xl overflow-hidden" style={{ border: '0.5px solid #e2e8f0' }}>
                                                <div className="px-3 py-2.5 bg-[#fafaf9] border-b border-[#f0ede8] flex items-center gap-2.5">
                                                    <div className="w-6 h-2.5 rounded skeleton-shimmer shrink-0" />
                                                    <div className="h-2.5 rounded skeleton-shimmer" style={{ width: `${titleW}px` }} />
                                                </div>
                                                <div className="px-3 py-3 space-y-2">
                                                    <div className="h-3 rounded skeleton-shimmer w-full" />
                                                    <div className="h-2.5 rounded skeleton-shimmer w-5/6" />
                                                    <div className="h-2.5 rounded skeleton-shimmer" style={{ width: `${60 + i * 10}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                        <p className="text-[11px] text-[#a3a3a3] text-center py-1">
                                            {sessionStatus === 'recording'
                                                ? 'Summary builds after a few minutes of speech...'
                                                : 'No summary yet'}
                                        </p>
                                        {/* Questions Raised — also visible in skeleton state */}
                                        {studentQuestions.length > 0 && (
                                            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid #e2e8f0' }}>
                                                <button
                                                    onClick={() => setQuestionsOpen(o => !o)}
                                                    className="w-full px-3 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2 hover:bg-amber-100/60 transition-colors">
                                                    <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <span className="flex-1 text-left text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Questions Raised</span>
                                                    <span className="text-[10px] font-mono text-amber-500 mr-1">{studentQuestions.length}</span>
                                                    <svg className={`w-3 h-3 text-amber-400 transition-transform ${questionsOpen ? 'rotate-180' : ''}`}
                                                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </button>
                                                {questionsOpen && (
                                                    <div className="divide-y divide-slate-100">
                                                        {studentQuestions.map((q, qi) => (
                                                            <div key={q.id} className="px-3 py-2.5 bg-white animate-fade-in">
                                                                <div className="flex items-start gap-2">
                                                                    <span className="text-[10px] font-mono text-amber-400 pt-[2px] shrink-0 select-none">Q{qi + 1}</span>
                                                                    <p className="text-[12px] text-[#6b6b6b] leading-relaxed">{q.text}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Ask Tab ── */}
                    {activeTab === 'ask' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {qaHistory.length === 0 && !qaLoading ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-[#fafaf9] border border-[#f0ede8] flex items-center justify-center">
                                            <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-[#6b6b6b]">Ask about the lecture</p>
                                            <p className="text-xs text-[#a3a3a3] mt-1 leading-relaxed">
                                                Questions are answered using<br />the live transcript
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    qaHistory.map((item, i) => (
                                        <div key={i} className="space-y-2 animate-fade-in">
                                            <div className="flex justify-end">
                                                <div className="max-w-[85%] bg-[#1a1a1a] text-[#fafaf9] rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[13px] leading-relaxed">
                                                    {item.question}
                                                </div>
                                            </div>
                                            <div className="flex justify-start">
                                                <div className="max-w-[85%] bg-[#fafaf9] border border-[#f0ede8] rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                                                    <QAAnswer text={item.answer} />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                                {qaLoading && (
                                    <div className="flex justify-start animate-fade-in">
                                        <div className="bg-[#fafaf9] border border-[#f0ede8] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
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
                            <div className="p-3 border-t border-[#f0ede8] shrink-0">
                                <form onSubmit={handleAsk}
                                    className="flex items-center gap-2 bg-[#fafaf9] border border-[#f0ede8] rounded-xl px-3 py-2 focus-within:border-[#1a1a1a]/40 transition-all">
                                    <input
                                        value={qaQuestion}
                                        onChange={e => setQaQuestion(e.target.value)}
                                        placeholder={lectureId ? 'Ask about the lecture...' : 'Start a session first'}
                                        disabled={!lectureId}
                                        className="flex-1 bg-transparent text-[13px] text-slate-800 placeholder:text-[#a3a3a3] outline-none"
                                    />
                                    <button type="submit"
                                        disabled={qaLoading || !lectureId || !qaQuestion.trim()}
                                        className="w-7 h-7 flex items-center justify-center bg-[#1a1a1a] disabled:bg-[#f0ede8] text-white disabled:text-[#a3a3a3] rounded-lg transition-colors shrink-0">
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
                                    <div className="w-6 h-6 border-2 border-[#f0ede8] border-t-[#1a1a1a] rounded-full animate-spin" />
                                </div>
                            ) : statsData ? (() => {
                                const lec = statsData._lecture || {};
                                const totalChunks  = statsData.total_chunks ?? transcript.length ?? 0;
                                const totalSecs    = totalChunks * 12;
                                const wordCount    = statsData.word_count ?? 0;
                                const avgChunkWords = totalChunks > 0 ? Math.round(wordCount / totalChunks) : 0;
                                const sections     = statsData.total_sections ?? 0;
                                const compressionPct = statsData.compression_ratio
                                    ? Math.round((1 - statsData.compression_ratio) * 100)
                                    : null;
                                const topicVal   = statsData.topic || detectedTopic || null;
                                const langCode   = statsData.language || detectedLanguage || null;
                                const langVal    = langCode ? (LANGUAGE_NAMES[langCode] || langCode.toUpperCase()) : null;
                                // Summary-derived stats from master_summary
                                const masterSummary = lec.master_summary || summary || '';
                                const summaryWords  = masterSummary ? masterSummary.split(/\s+/).length : 0;
                                const summarySecCount = masterSummary ? masterSummary.split('## ').filter(s => s.trim()).length : 0;
                                const readingMins   = summaryWords > 0 ? Math.ceil(summaryWords / 238) : null;
                                const coveragePct   = wordCount > 0 && summaryWords > 0
                                    ? Math.min(100, Math.round((summaryWords / wordCount) * 100))
                                    : null;
                                // N.A.S.T. score
                                const nastVal = nastScore != null ? nastScore : (statsData.nast_score ? Number(statsData.nast_score) : null);

                                const StatCard = ({ label, value, sub }) => (
                                    <div className="bg-[#fafaf9] border border-[#f0ede8] rounded-xl p-3">
                                        <div className="text-[10px] font-semibold text-[#a3a3a3] uppercase tracking-wider mb-0.5">{label}</div>
                                        <div className="text-[15px] font-bold text-[#1a1a1a] font-mono truncate">{value ?? '—'}</div>
                                        {sub && <div className="text-[10px] text-[#a3a3a3] mt-0.5">{sub}</div>}
                                    </div>
                                );

                                return (
                                    <div className="space-y-4">
                                        {/* Row 1: Recording stats */}
                                        <div>
                                            <p className="text-[10px] font-semibold text-[#a3a3a3] uppercase tracking-wider mb-2">Recording</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <StatCard label="Duration" value={totalSecs ? formatTime(totalSecs) : '—'} />
                                                <StatCard label="Words Spoken" value={wordCount ? wordCount.toLocaleString() : '—'} />
                                                <StatCard label="Audio Chunks" value={totalChunks || '—'} sub="12 s each" />
                                                <StatCard label="Avg Chunk" value={avgChunkWords ? `${avgChunkWords} w` : '—'} sub="words per chunk" />
                                            </div>
                                        </div>

                                        {/* Row 2: Processing stats */}
                                        <div>
                                            <p className="text-[10px] font-semibold text-[#a3a3a3] uppercase tracking-wider mb-2">Processing</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <StatCard label="Sections" value={sections || '—'} />
                                                <StatCard label="Compression" value={compressionPct != null ? `${compressionPct}%` : '—'} sub="content reduced" />
                                                <div className="bg-[#fafaf9] border border-[#f0ede8] rounded-xl p-3">
                                                    <div className="text-[10px] font-semibold text-[#a3a3a3] uppercase tracking-wider mb-1">Topic</div>
                                                    {topicVal
                                                        ? <span className="inline-block px-2 py-0.5 rounded-full bg-[#fafaf9] text-blue-700 text-[11px] font-semibold border border-blue-100 capitalize">{topicVal}</span>
                                                        : <span className="text-[15px] font-bold text-[#1a1a1a] font-mono">—</span>
                                                    }
                                                </div>
                                                <div className="bg-[#fafaf9] border border-[#f0ede8] rounded-xl p-3">
                                                    <div className="text-[10px] font-semibold text-[#a3a3a3] uppercase tracking-wider mb-1">Language</div>
                                                    {langVal
                                                        ? <span className="inline-block px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold border border-indigo-100">{langVal}</span>
                                                        : <span className="text-[15px] font-bold text-[#1a1a1a] font-mono">—</span>
                                                    }
                                                </div>
                                            </div>
                                        </div>

                                        {/* Row 3: Summary stats (only if master_summary exists) */}
                                        {summarySecCount > 0 && (
                                            <div>
                                                <p className="text-[10px] font-semibold text-[#a3a3a3] uppercase tracking-wider mb-2">Summary</p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <StatCard label="Summary Sections" value={summarySecCount} />
                                                    <StatCard label="Reading Time" value={readingMins ? `${readingMins} min` : '—'} />
                                                    <StatCard label="Summary Words" value={summaryWords ? summaryWords.toLocaleString() : '—'} />
                                                    <StatCard label="Coverage" value={coveragePct != null ? `${coveragePct}%` : '—'} sub="summary / transcript" />
                                                </div>
                                            </div>
                                        )}

                                        {/* N.A.S.T. explainer */}
                                        {nastVal != null && (
                                            <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div>
                                                        <p className="text-[11px] font-bold text-teal-700 uppercase tracking-wider">N.A.S.T. Score</p>
                                                        <p className="text-[10px] text-teal-600 mt-0.5">Novelty-Aware Section Trigger</p>
                                                    </div>
                                                    <span className="text-[22px] font-bold text-teal-700 font-mono">{nastVal.toFixed(2)}</span>
                                                </div>
                                                {[
                                                    { label: 'Semantic Divergence', pct: Math.min(100, Math.round(nastVal * 100 * 0.9)), color: 'bg-teal-400', weight: '50%' },
                                                    { label: 'Novelty Drift',        pct: Math.min(100, Math.round(nastVal * 100 * 0.75)), color: 'bg-teal-300', weight: '30%' },
                                                    { label: 'Momentum',             pct: Math.min(100, Math.round(nastVal * 100 * 0.6)), color: 'bg-teal-200', weight: '20%' },
                                                ].map(({ label, pct, color, weight }) => (
                                                    <div key={label} className="mb-2 last:mb-0">
                                                        <div className="flex items-center justify-between mb-0.5">
                                                            <span className="text-[10px] text-teal-700 font-medium">{label}</span>
                                                            <span className="text-[10px] text-teal-500">{weight}</span>
                                                        </div>
                                                        <div className="w-full bg-teal-100 h-1 rounded-full overflow-hidden">
                                                            <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                ))}
                                                <p className="text-[10px] text-teal-600 mt-3 leading-relaxed">
                                                    Fires a new section when the composite score exceeds 0.55. Higher = more semantic novelty in the lecture flow.
                                                </p>
                                            </div>
                                        )}

                                        {/* Refresh */}
                                        <button onClick={() => {
                                            setStatsData(null); setStatsLoading(true);
                                            Promise.all([
                                                api.get(`/api/v1/lectures/${lectureId}/analytics`),
                                                api.get(`/api/v1/lectures/${lectureId}`).catch(() => ({ data: {} })),
                                            ]).then(([a, l]) => setStatsData({ ...a.data, _lecture: l.data }))
                                              .catch(() => {}).finally(() => setStatsLoading(false));
                                        }} className="w-full py-2 text-[12px] text-[#a3a3a3] hover:text-[#6b6b6b] transition-colors border border-[#f0ede8] rounded-xl hover:bg-[#fafaf9]">
                                            Refresh
                                        </button>
                                    </div>
                                );
                            })() : (
                                <div className="h-full flex flex-col items-center justify-center text-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-[#fafaf9] border border-[#f0ede8] flex items-center justify-center">
                                        <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-[#6b6b6b]">No analytics yet</p>
                                        <p className="text-xs text-[#a3a3a3] mt-1">Stats appear after content is recorded</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Control Bar ── */}
            <div className="h-16 bg-[#1a1a1a] flex items-center justify-between px-4 md:px-6 shrink-0">
                {/* Left: mic status + live level meter */}
                <div className="flex items-center gap-2.5 w-36 md:w-44">
                    {isCalibrating && (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <div className="w-3 h-3 border-2 border-slate-500 border-t-slate-300 rounded-full animate-spin shrink-0" />
                            <span className="text-xs text-[#a3a3a3] font-medium hidden md:inline">Calibrating mic...</span>
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
                                <svg className="w-3.5 h-3.5 text-[#a3a3a3]" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                                </svg>
                            </div>
                            <span className="text-xs text-[#6b6b6b] font-semibold">Mic off</span>
                        </>
                    )}
                    {sessionStatus === 'ended' && (
                        <span className="text-xs text-[#6b6b6b] font-semibold">Complete</span>
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
                            className="flex items-center gap-2 px-5 py-2 bg-[#1a1a1a] hover:opacity-80 text-[#fafaf9] rounded-xl text-sm font-semibold transition-colors">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            Resume
                        </button>
                    )}
                    {sessionStatus === 'ended' && (
                        <span className="text-xs text-[#6b6b6b] px-5 py-2">Listening stopped</span>
                    )}
                </div>

                {/* Right: stats */}
                <div className="hidden md:flex items-center gap-5 w-36 justify-end">
                    <div className="text-right">
                        <div className="text-[13px] font-bold text-white font-mono leading-tight">{transcript.length}</div>
                        <div className="text-[10px] text-[#6b6b6b] uppercase tracking-wider">chunks</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[13px] font-bold text-white font-mono leading-tight">{wordCount.toLocaleString()}</div>
                        <div className="text-[10px] text-[#6b6b6b] uppercase tracking-wider">words</div>
                    </div>
                </div>
                {/* Mobile: compact stats */}
                <div className="flex md:hidden items-center gap-3 text-right">
                    <span className="text-[12px] font-bold text-white font-mono">{wordCount.toLocaleString()} <span className="text-[10px] text-[#6b6b6b] font-normal">w</span></span>
                </div>
            </div>

            {/* ── Mobile Bottom Nav ── */}
            <nav className="md:hidden flex items-center justify-around border-t border-[#333] bg-[#1a1a1a] h-12 shrink-0">
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
                            className={`flex flex-col items-center gap-0.5 px-6 py-1.5 transition-colors ${isActive ? 'text-[#1a1a1a]' : 'text-[#6b6b6b] hover:text-[#a3a3a3]'}`}>
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
                    className="fixed z-50 px-3 py-1.5 bg-[#1a1a1a] text-white text-xs font-bold rounded-lg shadow-2xl animate-fade-in hover:bg-[#333] transition-colors flex items-center gap-1.5"
                    style={{ left: selectionInfo.x, top: selectionInfo.y, transform: 'translate(-50%, -100%)' }}>
                    <svg className="w-3.5 h-3.5 text-[#1a1a1a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <div className="relative w-full max-w-[480px] bg-white h-full shadow-2xl animate-slide-in-right flex flex-col border-l border-[#f0ede8]">
                        <div className="h-14 px-5 flex items-center justify-between border-b border-[#f0ede8] shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-2 h-2 rounded-full bg-[#1a1a1a]" />
                                <h3 className="font-bold text-[#1a1a1a] font-heading text-[15px]">Concept Breakdown</h3>
                            </div>
                            <button onClick={() => setExplainPanel(p => ({ ...p, show: false }))}
                                className="w-8 h-8 flex items-center justify-center text-[#a3a3a3] hover:text-[#1a1a1a] hover:bg-[#fafaf9] rounded-lg transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-5">
                            {explainPanel.loading ? (
                                <div className="h-full flex flex-col items-center justify-center gap-4">
                                    <div className="w-9 h-9 border-[3px] border-[#f0ede8] border-t-[#1a1a1a] rounded-full animate-spin" />
                                    <p className="text-sm text-[#a3a3a3]">Analyzing concept...</p>
                                </div>
                            ) : explainPanel.data ? (
                                <div className="space-y-5 animate-fade-in">
                                    <div>
                                        <p className="text-[11px] font-bold text-[#a3a3a3] uppercase tracking-widest mb-2">Explanation</p>
                                        <p className="text-slate-800 leading-relaxed text-[15px]">{explainPanel.data.explanation}</p>
                                    </div>
                                    {explainPanel.data.analogy && (
                                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                                            <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest mb-2">Analogy</p>
                                            <p className="text-[#1a1a1a] leading-relaxed italic text-sm">{explainPanel.data.analogy}</p>
                                        </div>
                                    )}
                                    {explainPanel.data.breakdown && (
                                        <div>
                                            <p className="text-[11px] font-bold text-[#a3a3a3] uppercase tracking-widest mb-3">Step-by-Step</p>
                                            <div className="space-y-2">
                                                {explainPanel.data.breakdown.split('\n').filter(l => l.trim()).map((step, i) => (
                                                    <div key={i} className="flex gap-3 p-3 rounded-xl bg-[#fafaf9] border border-[#f0ede8]">
                                                        <span className="text-[11px] font-bold text-slate-300 font-mono mt-0.5 shrink-0">
                                                            {String(i + 1).padStart(2, '0')}
                                                        </span>
                                                        <p className="text-sm text-[#6b6b6b] leading-relaxed">
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

            {/* ── Session End Modal ── */}
            {endModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/50 backdrop-blur-md animate-fade-in">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-8 shadow-2xl animate-slide-up border border-[#f0ede8]">
                        {/* Check icon */}
                        <div className="flex items-center justify-center mb-5">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                                <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                        </div>
                        <h3 className="text-[17px] font-bold text-[#1a1a1a] mb-1 font-heading text-center">Session complete</h3>
                        <p className="text-[#a3a3a3] text-sm text-center mb-5">Your lecture has been saved and is ready to review.</p>
                        {/* Stats row */}
                        <div className="grid grid-cols-3 gap-2 mb-6">
                            <div className="bg-[#fafaf9] border border-[#f0ede8] rounded-xl p-3 text-center">
                                <div className="text-[15px] font-bold text-[#1a1a1a] font-mono">{formatTime(recordingSeconds)}</div>
                                <div className="text-[10px] text-[#a3a3a3] mt-0.5">Duration</div>
                            </div>
                            <div className="bg-[#fafaf9] border border-[#f0ede8] rounded-xl p-3 text-center">
                                <div className="text-[15px] font-bold text-[#1a1a1a] font-mono">{transcript.length}</div>
                                <div className="text-[10px] text-[#a3a3a3] mt-0.5">Segments</div>
                            </div>
                            <div className="bg-[#fafaf9] border border-[#f0ede8] rounded-xl p-3 text-center">
                                <div className="text-[15px] font-bold text-[#1a1a1a] font-mono">{qaHistory.length}</div>
                                <div className="text-[10px] text-[#a3a3a3] mt-0.5">Questions</div>
                            </div>
                        </div>
                        {/* Actions */}
                        <div className="flex flex-col gap-2">
                            {lectureId && (
                                <button
                                    onClick={() => { setEndModal(false); navigate(`/lecture/${lectureId}`); }}
                                    className="w-full py-2.5 bg-[#1a1a1a] text-[#fafaf9] text-sm font-semibold rounded-xl hover:opacity-80 transition-opacity">
                                    View full lecture →
                                </button>
                            )}
                            <button
                                onClick={() => setEndModal(false)}
                                className="w-full py-2.5 border border-[#f0ede8] text-[#6b6b6b] text-sm rounded-xl hover:text-[#1a1a1a] transition-colors">
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Export Modal ── */}
            {exportModal.show && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/50 backdrop-blur-md animate-fade-in">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-8 shadow-2xl animate-slide-up border border-[#f0ede8]">
                        {/* Icon row */}
                        <div className="flex items-center justify-center mb-5">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center
                                ${exportModal.progress === 100 ? 'bg-emerald-50' : exportModal.progress === -1 ? 'bg-red-50' : 'bg-[#fafaf9]'}`}>
                                {exportModal.progress === 100 ? (
                                    <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : exportModal.progress === -1 ? (
                                    <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                ) : (
                                    <div className="w-7 h-7 border-[3px] border-[#f0ede8] border-t-[#1a1a1a] rounded-full animate-spin" />
                                )}
                            </div>
                        </div>

                        {/* Title + status */}
                        <h3 className="text-[17px] font-bold text-[#1a1a1a] mb-1 font-heading text-center">
                            {exportModal.progress === 100 ? 'Export Ready' : exportModal.progress === -1 ? 'Export Failed' : 'Generating PDF'}
                        </h3>
                        <p className="text-[#a3a3a3] text-sm text-center mb-5">{exportModal.status}</p>

                        {/* Progress bar — shown while in-progress */}
                        {exportModal.progress > 0 && exportModal.progress < 100 && (
                            <div className="mb-3">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[11px] text-[#a3a3a3] font-medium">Progress</span>
                                    <span className="text-[13px] font-bold text-[#1a1a1a] font-mono">{exportModal.progress}%</span>
                                </div>
                                <div className="w-full bg-[#f0ede8] h-1.5 rounded-full overflow-hidden">
                                    <div className="h-full bg-[#1a1a1a] transition-all duration-700 ease-out rounded-full"
                                        style={{ width: `${exportModal.progress}%` }} />
                                </div>
                            </div>
                        )}

                        {/* Success: full bar */}
                        {exportModal.progress === 100 && (
                            <div className="mb-4">
                                <div className="w-full bg-emerald-100 h-1.5 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 w-full rounded-full" />
                                </div>
                                <p className="text-[11px] text-emerald-600 font-medium text-center mt-2">Download starting automatically...</p>
                            </div>
                        )}

                        {/* Failure: error detail + retry */}
                        {exportModal.progress === -1 && (
                            <div className="mt-1 space-y-3">
                                {exportModal.error && (
                                    <div className="bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 text-xs text-red-600 font-mono break-all">
                                        {exportModal.error}
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <button onClick={handleExportPDF}
                                        className="flex-1 py-2 bg-[#1a1a1a] hover:opacity-80 text-[#fafaf9] text-sm font-semibold rounded-xl transition-colors">
                                        Try Again
                                    </button>
                                    <button onClick={() => setExportModal(p => ({ ...p, show: false }))}
                                        className="flex-1 py-2 border border-[#f0ede8] text-[#6b6b6b] hover:text-[#1a1a1a] text-sm font-medium rounded-xl transition-colors">
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
