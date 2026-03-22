import React from 'react';

// Parses the structured ANSWER / DETAIL / SOURCE format from the backend.
// Falls back to plain text if the format isn't detected.
function parse(text) {
    if (!text) return { raw: text };
    const a = text.match(/ANSWER:\s*([\s\S]+?)(?=\nDETAIL:|\nSOURCE:|$)/);
    const d = text.match(/DETAIL:\s*([\s\S]+?)(?=\nSOURCE:|$)/);
    const s = text.match(/SOURCE:\s*([\s\S]+?)$/);
    if (!a) return { raw: text };
    return {
        answer: a[1].trim(),
        detail: d?.[1].trim() || '',
        source: s?.[1].trim() || '',
    };
}

export default function QAAnswer({ text, dark = false }) {
    const p = parse(text);

    // Plain fallback (error messages, "I couldn't find..." etc.)
    if (p.raw !== undefined) {
        return <span style={{ fontSize: 13, lineHeight: 1.65 }}>{p.raw}</span>;
    }

    const textColor   = dark ? '#fafaf9'  : '#1a1a1a';
    const subColor    = dark ? '#c4c4c4'  : '#6b6b6b';
    const borderColor = dark ? 'rgba(255,255,255,0.18)' : '#e8e4de';
    const srcBg       = dark ? 'rgba(255,255,255,0.07)' : '#f8f6f3';
    const labelColor  = dark ? 'rgba(255,255,255,0.4)'  : '#a3a3a3';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* ── Direct answer ── */}
            <p style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 500,
                color: textColor,
                lineHeight: 1.65,
            }}>
                {p.answer}
            </p>

            {/* ── Detail / elaboration ── */}
            {p.detail && (
                <>
                    <div style={{ height: 1, background: borderColor, opacity: 0.5 }} />
                    <p style={{
                        margin: 0,
                        fontSize: 12.5,
                        color: subColor,
                        lineHeight: 1.7,
                    }}>
                        {p.detail}
                    </p>
                </>
            )}

            {/* ── Source quote ── */}
            {p.source && (
                <div style={{
                    background: srcBg,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                }}>
                    <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: labelColor,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                    }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
                        </svg>
                        From lecture
                    </span>
                    <span style={{
                        fontSize: 12,
                        color: subColor,
                        fontStyle: 'italic',
                        lineHeight: 1.6,
                    }}>
                        {p.source}
                    </span>
                </div>
            )}
        </div>
    );
}
