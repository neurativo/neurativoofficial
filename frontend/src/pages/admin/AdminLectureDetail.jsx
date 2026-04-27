import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi } from '../../lib/adminApi.js';


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
                        style={{ cursor: 'pointer', color: '#6366f1' }}
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
                            <span style={{ marginLeft: 6, background: '#fef3c7', color: '#d97706', padding: '1px 6px', borderRadius: 99, fontSize: 10, fontWeight: 700 }}>
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
                            <span style={{ marginLeft: 10, fontWeight: 400, color: '#a3a3a3', textTransform: 'none', fontSize: 12, letterSpacing: 0 }}>
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
                                <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#c4c4c4' }}>{s.id?.slice(0, 16)}…</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#6b6b6b' }}>
                                Started: {fmtDate(s.created_at)}
                            </div>
                            <div style={{ fontSize: 12, color: '#a3a3a3' }}>
                                Last chunk: {fmtDate(s.last_chunk_at)}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <button className="adm-btn-danger" style={{ marginTop: 20 }} onClick={() => setShowDeleteModal(true)}>
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
