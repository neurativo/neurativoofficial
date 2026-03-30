import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi } from '../../lib/adminApi.js';

const CSS = `
.adm-back { display: inline-flex; align-items: center; gap: 6px; color: #888; font-size: 13px; cursor: pointer; margin-bottom: 20px; }
.adm-back:hover { color: #e8e8e8; }
.adm-page-title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 6px; }
.adm-subtitle { font-size: 12px; color: #444; font-family: monospace; margin-bottom: 24px; }
.adm-meta-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 24px; }
.adm-meta-chip { padding: 4px 11px; background: #141414; border: 1px solid #1e1e1e; border-radius: 20px; font-size: 12px; color: #888; }
.adm-meta-chip strong { color: #c8c8c8; }
.adm-tabs { display: flex; gap: 0; border-bottom: 1px solid #1e1e1e; margin-bottom: 24px; }
.adm-tab { padding: 9px 18px; font-size: 13px; color: #555; cursor: pointer; border-bottom: 2px solid transparent; transition: color 0.15s, border-color 0.15s; }
.adm-tab:hover { color: #c8c8c8; }
.adm-tab.active { color: #fff; border-bottom-color: #7c3aed; }
.adm-card { background: #141414; border: 1px solid #1e1e1e; border-radius: 10px; padding: 20px; }
.adm-card-title { font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 14px; }
.adm-text-block {
    background: #0a0a0a; border: 1px solid #1a1a1a; border-radius: 8px;
    padding: 16px; font-size: 13px; color: #aaa; line-height: 1.7;
    max-height: 400px; overflow-y: auto; white-space: pre-wrap; font-family: 'Inter', sans-serif;
}
.adm-empty-text { color: #444; font-style: italic; font-size: 13px; }
.adm-section-item { border-bottom: 1px solid #111; padding: 14px 0; }
.adm-section-item:last-child { border-bottom: none; }
.adm-section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.adm-section-num { width: 26px; height: 26px; border-radius: 50%; background: #7c3aed22; border: 1px solid #7c3aed44; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #a78bfa; font-weight: 700; flex-shrink: 0; }
.adm-section-range { font-size: 11px; color: #444; font-family: monospace; }
.adm-section-text { font-size: 13px; color: #aaa; line-height: 1.6; }
.adm-question-item { padding: 10px 0; border-bottom: 1px solid #111; display: flex; gap: 12px; align-items: flex-start; }
.adm-question-item:last-child { border-bottom: none; }
.adm-question-icon { color: #f59e0b; font-size: 14px; flex-shrink: 0; margin-top: 1px; }
.adm-question-text { font-size: 13px; color: #c8c8c8; flex: 1; }
.adm-question-time { font-size: 11px; color: #444; flex-shrink: 0; }
.adm-share-row { display: flex; gap: 24px; margin-bottom: 16px; }
.adm-share-stat { text-align: center; }
.adm-share-val { font-size: 28px; font-weight: 700; color: #fff; }
.adm-share-label { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.06em; }
.adm-share-token { font-family: monospace; font-size: 11px; color: #555; word-break: break-all; padding: 8px 12px; background: #0a0a0a; border: 1px solid #1a1a1a; border-radius: 6px; margin-top: 10px; }
.adm-session-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #111; font-size: 13px; }
.adm-session-row:last-child { border-bottom: none; }
.adm-badge-active { display: inline-block; padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; background: #065f4622; color: #34d399; border: 1px solid #065f4644; }
.adm-badge-ended { display: inline-block; padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; background: #1e1e1e; color: #555; }
.adm-btn-danger { background: #7f1d1d22; border: 1px solid #7f1d1d55; color: #f87171; padding: 8px 16px; border-radius: 7px; font-size: 13px; cursor: pointer; margin-top: 20px; }
.adm-btn-danger:hover { background: #7f1d1d44; }
.adm-modal-overlay { position: fixed; inset: 0; background: #00000088; z-index: 200; display: flex; align-items: center; justify-content: center; }
.adm-modal { background: #141414; border: 1px solid #2a2a2a; border-radius: 12px; padding: 28px; max-width: 400px; width: 90%; }
.adm-modal h3 { font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 10px; }
.adm-modal p { font-size: 13px; color: #888; margin-bottom: 20px; }
.adm-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
.adm-btn-ghost { background: transparent; border: 1px solid #2a2a2a; color: #888; padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px; }
.adm-toast { position: fixed; bottom: 24px; right: 24px; background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 8px; padding: 12px 18px; font-size: 13px; color: #e8e8e8; z-index: 9999; }
`;

const TABS = ['Summary', 'Transcript', 'Sections', 'Questions', 'Sharing', 'Sessions'];

function fmtDuration(secs) {
    if (!secs) return '—';
    const m = Math.floor(secs / 60);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminLectureDetail() {
    const { lectureId } = useParams();
    const navigate = useNavigate();
    const [lecture, setLecture] = useState(null);
    const [activeTab, setActiveTab] = useState('Summary');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [toast, setToast] = useState('');

    useEffect(() => {
        adminApi.getLecture(lectureId).then(setLecture).catch(() => setToast('Failed to load lecture'));
    }, [lectureId]);

    function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

    async function deleteLecture() {
        setDeleting(true);
        try {
            await adminApi.deleteLecture(lectureId);
            navigate('/admin/lectures');
        } catch {
            showToast('Failed to delete lecture');
            setDeleting(false);
        }
    }

    if (!lecture) return <div style={{ color: '#555', fontSize: 13, padding: 20 }}>Loading…</div>;

    const sections = lecture.sections || [];
    const questions = lecture.questions || [];
    const sessions = lecture.sessions || [];

    return (
        <div>
            <style>{CSS}</style>
            <div className="adm-back" onClick={() => navigate('/admin/lectures')}>← Back to Lectures</div>
            <div className="adm-page-title">{lecture.title || 'Untitled Lecture'}</div>
            <div className="adm-subtitle">{lectureId}</div>

            <div className="adm-meta-row">
                <span className="adm-meta-chip">Language: <strong>{lecture.language || 'en'}</strong></span>
                <span className="adm-meta-chip">Duration: <strong>{fmtDuration(lecture.total_duration_seconds)}</strong></span>
                <span className="adm-meta-chip">Chunks: <strong>{lecture.total_chunks ?? '—'}</strong></span>
                <span className="adm-meta-chip">Sections: <strong>{sections.length}</strong></span>
                <span className="adm-meta-chip">Questions: <strong>{questions.length}</strong></span>
                {lecture.topic && <span className="adm-meta-chip">Topic: <strong>{lecture.topic}</strong></span>}
                <span className="adm-meta-chip">Created: <strong>{fmtDate(lecture.created_at)}</strong></span>
                {lecture.user_id && (
                    <span
                        className="adm-meta-chip"
                        style={{ cursor: 'pointer', color: '#a78bfa' }}
                        onClick={() => navigate(`/admin/users/${lecture.user_id}`)}
                    >
                        User: <strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{lecture.user_id.slice(0, 14)}…</strong>
                    </span>
                )}
            </div>

            <div className="adm-tabs">
                {TABS.map(tab => (
                    <div key={tab} className={`adm-tab${activeTab === tab ? ' active' : ''}`} onClick={() => setActiveTab(tab)}>
                        {tab}
                        {tab === 'Questions' && questions.length > 0 && (
                            <span style={{ marginLeft: 6, background: '#f59e0b22', color: '#f59e0b', padding: '1px 6px', borderRadius: 99, fontSize: 10, fontWeight: 700 }}>
                                {questions.length}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {activeTab === 'Summary' && (
                <div className="adm-card">
                    <div className="adm-card-title">Master Summary</div>
                    {lecture.master_summary
                        ? <div className="adm-text-block">{lecture.master_summary}</div>
                        : <div className="adm-empty-text">No master summary yet.</div>
                    }
                    {lecture.summary && (
                        <>
                            <div className="adm-card-title" style={{ marginTop: 20 }}>Legacy Summary</div>
                            <div className="adm-text-block">{lecture.summary}</div>
                        </>
                    )}
                </div>
            )}

            {activeTab === 'Transcript' && (
                <div className="adm-card">
                    <div className="adm-card-title">
                        Full Transcript
                        {lecture.transcript && (
                            <span style={{ marginLeft: 10, fontWeight: 400, color: '#444', textTransform: 'none', fontSize: 12, letterSpacing: 0 }}>
                                {lecture.transcript.trim().split(/\s+/).length.toLocaleString()} words
                            </span>
                        )}
                    </div>
                    {lecture.transcript
                        ? <div className="adm-text-block">{lecture.transcript}</div>
                        : <div className="adm-empty-text">No transcript available.</div>
                    }
                </div>
            )}

            {activeTab === 'Sections' && (
                <div className="adm-card">
                    <div className="adm-card-title">{sections.length} Sections</div>
                    {!sections.length && <div className="adm-empty-text">No sections generated yet.</div>}
                    {sections.map((sec, i) => (
                        <div className="adm-section-item" key={sec.id || i}>
                            <div className="adm-section-header">
                                <div className="adm-section-num">{(sec.section_index ?? i) + 1}</div>
                                <span className="adm-section-range">
                                    Chunks {sec.chunk_range_start ?? '?'} – {sec.chunk_range_end ?? '?'}
                                </span>
                                <span style={{ fontSize: 11, color: '#444', marginLeft: 'auto' }}>{fmtDate(sec.created_at)}</span>
                            </div>
                            <div className="adm-section-text">{sec.section_summary || '—'}</div>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'Questions' && (
                <div className="adm-card">
                    <div className="adm-card-title">{questions.length} Student Questions Detected</div>
                    {!questions.length && <div className="adm-empty-text">No questions detected during this lecture.</div>}
                    {questions.map((q, i) => (
                        <div className="adm-question-item" key={q.id || i}>
                            <span className="adm-question-icon">?</span>
                            <span className="adm-question-text">{q.question_text}</span>
                            <span className="adm-question-time">{fmtDate(q.detected_at)}</span>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'Sharing' && (
                <div className="adm-card">
                    <div className="adm-share-row">
                        <div className="adm-share-stat">
                            <div className="adm-share-val">{lecture.share_views ?? 0}</div>
                            <div className="adm-share-label">Share Views</div>
                        </div>
                        <div className="adm-share-stat">
                            <div className="adm-share-val">{lecture.share_token ? 'Yes' : 'No'}</div>
                            <div className="adm-share-label">Shared</div>
                        </div>
                    </div>
                    {lecture.share_token && (
                        <div>
                            <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>Share Token</div>
                            <div className="adm-share-token">{lecture.share_token}</div>
                        </div>
                    )}
                    {!lecture.share_token && (
                        <div className="adm-empty-text">This lecture is not currently shared.</div>
                    )}
                </div>
            )}

            {activeTab === 'Sessions' && (
                <div className="adm-card">
                    <div className="adm-card-title">{sessions.length} Recording Session{sessions.length !== 1 ? 's' : ''}</div>
                    {!sessions.length && <div className="adm-empty-text">No sessions found.</div>}
                    {sessions.map((s, i) => (
                        <div className="adm-session-row" key={s.id || i}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {s.is_active
                                    ? <span className="adm-badge-active">Active</span>
                                    : <span className="adm-badge-ended">Ended</span>
                                }
                                <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#444' }}>{s.id?.slice(0, 16)}…</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#666' }}>
                                Started: {fmtDate(s.created_at)}
                            </div>
                            <div style={{ fontSize: 12, color: '#555' }}>
                                Last chunk: {fmtDate(s.last_chunk_at)}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <button className="adm-btn-danger" onClick={() => setShowDeleteModal(true)}>
                Delete This Lecture
            </button>

            {showDeleteModal && (
                <div className="adm-modal-overlay">
                    <div className="adm-modal">
                        <h3>Delete Lecture?</h3>
                        <p>This will permanently delete the lecture, all its chunks, sections, and summaries. Cannot be undone.</p>
                        <div className="adm-modal-actions">
                            <button className="adm-btn-ghost" onClick={() => setShowDeleteModal(false)}>Cancel</button>
                            <button className="adm-btn-danger" onClick={deleteLecture} disabled={deleting}>
                                {deleting ? 'Deleting…' : 'Delete Lecture'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className="adm-toast">{toast}</div>}
        </div>
    );
}
