// frontend/src/lib/renderDomainContent.jsx
import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';

const MATH_TOPICS = new Set(['mathematics', 'physics', 'engineering', 'chemistry']);
const CODE_TOPICS = new Set(['computer science', 'engineering']);

/**
 * Renders a block of text with domain-appropriate formatting:
 * - KaTeX for math equations ($$...$$  and  $...$) when topic is math/physics/engineering/chemistry
 * - highlight.js for fenced code blocks when topic is CS/engineering
 * - Plain text otherwise
 *
 * Returns an array of React elements.
 */
export function renderDomainContent(text, topic) {
    if (!text) return null;
    const normalTopic = topic?.toLowerCase() || '';

    let parts = [text];

    if (CODE_TOPICS.has(normalTopic)) {
        parts = parts.flatMap(part => {
            if (typeof part !== 'string') return [part];
            return renderCodeBlocks(part);
        });
    }

    if (MATH_TOPICS.has(normalTopic)) {
        parts = parts.flatMap(part => {
            if (typeof part !== 'string') return [part];
            return renderMath(part);
        });
    }

    // Remaining plain strings stay as-is
    return parts.map((part, i) =>
        typeof part === 'string'
            ? <span key={i}>{part}</span>
            : React.cloneElement(part, { key: i })
    );
}

// ── Code rendering ─────────────────────────────────────────────────────────

function renderCodeBlocks(text) {
    const CODE_FENCE = /```(\w*)\n([\s\S]*?)```/g;
    const parts = [];
    let last = 0;
    let match;

    while ((match = CODE_FENCE.exec(text)) !== null) {
        if (match.index > last) {
            parts.push(text.slice(last, match.index));
        }
        const lang = match[1];
        const code = match[2];
        let highlighted;
        try {
            highlighted = lang && hljs.getLanguage(lang)
                ? hljs.highlight(code, { language: lang }).value
                : hljs.highlightAuto(code).value;
        } catch {
            highlighted = code;
        }
        parts.push(
            <CodeBlock key={match.index} lang={lang} highlighted={highlighted} raw={code} />
        );
        last = match.index + match[0].length;
    }

    if (last < text.length) parts.push(text.slice(last));
    return parts.length ? parts : [text];
}

function CodeBlock({ lang, highlighted, raw }) {
    const [copied, setCopied] = React.useState(false);

    function copy() {
        navigator.clipboard.writeText(raw).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }

    return (
        <div style={{ position: 'relative', margin: '10px 0', borderRadius: 10, overflow: 'hidden', background: '#f6f8fa', border: '1px solid #e8e4de' }}>
            {lang && (
                <div style={{ padding: '4px 12px', fontSize: 11, color: '#a3a3a3', borderBottom: '1px solid #e8e4de', background: '#f0ede8', fontFamily: 'monospace' }}>
                    {lang}
                </div>
            )}
            <pre style={{ margin: 0, padding: '12px 14px', overflowX: 'auto', fontSize: 12, lineHeight: 1.6, fontFamily: 'monospace' }}>
                <code dangerouslySetInnerHTML={{ __html: highlighted }} />
            </pre>
            <button
                onClick={copy}
                style={{
                    position: 'absolute', top: lang ? 28 : 6, right: 8,
                    padding: '2px 8px', fontSize: 11, borderRadius: 6,
                    background: '#ffffff', border: '1px solid #e8e4de',
                    cursor: 'pointer', color: copied ? '#16a34a' : '#6b6b6b',
                    fontFamily: 'Inter, sans-serif',
                }}
            >
                {copied ? 'Copied!' : 'Copy'}
            </button>
        </div>
    );
}

// ── Math rendering ──────────────────────────────────────────────────────────

function renderMath(text) {
    // Block math: $$...$$
    const BLOCK = /\$\$([\s\S]+?)\$\$/g;
    // Inline math: $...$  (but not $$)
    const INLINE = /(?<!\$)\$(?!\$)((?:[^$\\]|\\[\s\S])+?)\$(?!\$)/g;

    const blockParts = [];
    let last = 0;
    let match;
    while ((match = BLOCK.exec(text)) !== null) {
        if (match.index > last) blockParts.push(text.slice(last, match.index));
        try {
            const html = katex.renderToString(match[1].trim(), { displayMode: true, throwOnError: false });
            blockParts.push(<span key={match.index} dangerouslySetInnerHTML={{ __html: html }} style={{ display: 'block', textAlign: 'center', margin: '8px 0' }} />);
        } catch {
            blockParts.push(match[0]);
        }
        last = match.index + match[0].length;
    }
    if (last < text.length) blockParts.push(text.slice(last));

    // Now handle inline math within string parts
    return blockParts.flatMap((part, i) => {
        if (typeof part !== 'string') return [part];
        const inlineParts = [];
        let ilast = 0;
        let imatch;
        INLINE.lastIndex = 0;
        while ((imatch = INLINE.exec(part)) !== null) {
            if (imatch.index > ilast) inlineParts.push(part.slice(ilast, imatch.index));
            try {
                const html = katex.renderToString(imatch[1].trim(), { displayMode: false, throwOnError: false });
                inlineParts.push(<span key={`${i}-${imatch.index}`} dangerouslySetInnerHTML={{ __html: html }} />);
            } catch {
                inlineParts.push(imatch[0]);
            }
            ilast = imatch.index + imatch[0].length;
        }
        if (ilast < part.length) inlineParts.push(part.slice(ilast));
        return inlineParts.length ? inlineParts : [part];
    });
}
