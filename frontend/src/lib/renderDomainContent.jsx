// frontend/src/lib/renderDomainContent.jsx
import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';

function isMathTopic(topic) {
    if (!topic) return false;
    const t = topic.toLowerCase();
    return ['math', 'physic', 'chem', 'engineer', 'quant', 'statistic',
            'biolog', 'econom', 'signal', 'circuit', 'thermodynam', 'mechan']
        .some(k => t.includes(k));
}

function isCodeTopic(topic) {
    if (!topic) return false;
    const t = topic.toLowerCase();
    return ['computer', 'software', 'programm', 'algorithm',
            'data structure', 'machine learn', 'neural', 'deep learn', 'engineer']
        .some(k => t.includes(k));
}

function hasFencedCode(text) {
    // Fire on ANY triple-backtick sequence — including orphan/unclosed/inline
    // fences — so malformed fences are always routed through renderCodeBlocks
    // and never leak as literal ``` text.
    return /```/.test(text);
}

function hasMath(text) {
    // Detect $...$ or $$...$$ LaTeX regardless of topic so stray math never leaks.
    return /\$[^$]+\$/.test(text);
}

function hasInlineCode(text) {
    // Detect single-backtick inline code (but not a fenced ``` block on its own).
    return /`[^`\n]+`/.test(text);
}

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

    let parts = [text];

    // Fenced code blocks — run whenever the text actually contains a fence,
    // regardless of topic, so ```python ...``` never leaks as literal text.
    if (isCodeTopic(topic) || hasFencedCode(text)) {
        parts = parts.flatMap(part => {
            if (typeof part !== 'string') return [part];
            return renderCodeBlocks(part);
        });
    }

    // Math — run whenever the text contains $...$ / $$...$$, regardless of topic.
    if (isMathTopic(topic) || hasMath(text)) {
        parts = parts.flatMap(part => {
            if (typeof part !== 'string') return [part];
            return renderMath(part);
        });
    }

    // Inline `code` — ALWAYS run (topic-independent) so single backticks never
    // appear as literal characters in any card, prose line, or QA answer.
    parts = parts.flatMap(part => {
        if (typeof part !== 'string') return [part];
        return renderInlineCode(part);
    });

    // FINAL SAFETY PASS — after all structured parsing, no residual triple-backtick
    // sequences or lone stray backticks may survive as literal text. This catches
    // malformed / orphan / inline / back-to-back fences the parsers above missed.
    parts = parts.flatMap(part => {
        if (typeof part !== 'string') return [part];
        const cleaned = sanitizeResidualFences(part);
        return cleaned === '' ? [] : [cleaned];
    });

    // Remaining plain strings stay as-is — but FIRST scrub any residual literal
    // backticks (Fix C). If a malformed / orphan / unbalanced fence slipped past
    // fenced-code and inline-code rendering, its backticks would otherwise show
    // as literal text. We strip stray ``` fences (with any leaked language token)
    // and lone ` marks from the leftover *string* parts only — real <code>/<pre>
    // elements produced above are React nodes and are never touched.
    const LEAKED_LANG = /`{1,3}[ \t]*(csharp|cs|javascript|js|typescript|ts|python|py|java|cpp|c\+\+|c#|go|golang|rust|rs|ruby|rb|php|swift|kotlin|kt|scala|sql|bash|sh|shell|html|css|json|xml|yaml|yml|jsx|tsx)\b/gi;
    parts = parts.map(part => {
        if (typeof part !== 'string') return part;
        return part
            .replace(LEAKED_LANG, ' ')
            .replace(/`+/g, '')          // remove any surviving single/triple backticks
            .replace(/[ \t]{2,}/g, ' ');
    });

    // Remaining plain strings stay as-is
    return parts.map((part, i) =>
        typeof part === 'string'
            ? <span key={i}>{part}</span>
            : React.cloneElement(part, { key: i })
    );
}

// ── Residual-fence sanitizer ─────────────────────────────────────────────────
// Removes any leftover ``` markers, orphan/unclosed fences, back-to-back fences,
// and leaked leading language tokens (csharp/javascript/python/...) so literal
// markdown code-fence characters NEVER reach the DOM as visible text.
const LEAKED_LANG_TOKENS = [
    'csharp', 'cs', 'javascript', 'js', 'typescript', 'ts', 'python', 'py',
    'java', 'cpp', 'c\\+\\+', 'c', 'go', 'golang', 'rust', 'rs', 'ruby', 'rb',
    'php', 'swift', 'kotlin', 'kt', 'scala', 'sql', 'bash', 'sh', 'shell',
    'html', 'css', 'json', 'xml', 'yaml', 'yml', 'jsx', 'tsx',
];

function sanitizeResidualFences(text) {
    if (typeof text !== 'string' || text.indexOf('`') === -1) return text;

    let out = text;

    // 1) Strip any triple-backtick fence immediately followed by a language token,
    //    e.g. "```csharp" -> "" (the leaked language label after a broken fence).
    const langAlt = LEAKED_LANG_TOKENS.join('|');
    out = out.replace(new RegExp('```[ \\t]*(?:' + langAlt + ')\\b', 'gi'), ' ');

    // 2) Remove any remaining triple-backtick (or longer) fence markers outright.
    out = out.replace(/`{3,}/g, ' ');

    // 3) Any surviving lone stray backticks (unpaired inline ticks the inline-code
    //    pass could not match) are removed so no `` ` `` ever shows as literal text.
    out = out.replace(/`/g, '');

    // 4) Collapse whitespace introduced by the removals, but keep single newlines.
    out = out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n');

    return out.trim() === '' ? '' : out;
}

// ── Inline code rendering ────────────────────────────────────────────────────

function renderInlineCode(text) {
    const INLINE_CODE = /`([^`\n]+)`/g;
    const parts = [];
    let last = 0;
    let match;
    while ((match = INLINE_CODE.exec(text)) !== null) {
        if (match.index > last) parts.push(text.slice(last, match.index));
        parts.push(
            <code
                key={`ic-${match.index}`}
                style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.88em',
                    padding: '1px 5px',
                    borderRadius: 4,
                    background: 'rgba(124,58,237,0.10)',
                    color: '#7c3aed',
                    border: '1px solid rgba(124,58,237,0.18)',
                    whiteSpace: 'nowrap',
                }}
            >{match[1]}</code>
        );
        last = match.index + match[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts.length ? parts : [text];
}

// ── Code rendering ─────────────────────────────────────────────────────────

function renderCodeBlocks(text) {
    // Tolerant fence matcher:
    //  • ```lang\n code ```            (well-formed block)
    //  • ```lang code ```             (inline, no newlines)
    //  • ```lang code                 (orphan / unclosed — consumes to next fence or EOS)
    //  • ``` ``` ``` ...              (multiple back-to-back fences on one line)
    // Group 1 = optional language token, Group 2 = code body.
    // The alternation ends a block at the next ``` OR end-of-string so unclosed
    // trailing fences are still captured and never leak as literal ``` text.
    const CODE_FENCE = /```[ \t]*(\w+)?[ \t]*\r?\n?([\s\S]*?)(?:```|$)/g;
    const parts = [];
    let last = 0;
    let match;

    while ((match = CODE_FENCE.exec(text)) !== null) {
        // Guard against zero-length matches (e.g. bare "``````") causing infinite loops.
        if (match.index === CODE_FENCE.lastIndex) {
            CODE_FENCE.lastIndex++;
            continue;
        }
        if (match.index > last) {
            parts.push(text.slice(last, match.index));
        }
        const lang = match[1] || '';
        const code = (match[2] || '').replace(/`+$/, '').trim();

        // Empty fence (no real code) — drop entirely, emit nothing literal.
        if (!code) {
            last = CODE_FENCE.lastIndex;
            continue;
        }

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
        last = CODE_FENCE.lastIndex;
    }

    if (last < text.length) parts.push(text.slice(last));
    return parts.length ? parts : [text];
}

function useIsDark() {
    const [dark, setDark] = React.useState(
        () => document.documentElement.classList.contains('dark')
    );
    React.useEffect(() => {
        const obs = new MutationObserver(() =>
            setDark(document.documentElement.classList.contains('dark'))
        );
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => obs.disconnect();
    }, []);
    return dark;
}

function CodeBlock({ lang, highlighted, raw }) {
    const [copied, setCopied] = React.useState(false);
    const dark = useIsDark();

    const blockBg    = dark ? '#1e1e2e' : '#f6f8fa';
    const headerBg   = dark ? '#16162a' : '#f0ede8';
    const borderColor = dark ? '#313150' : '#e8e4de';
    const langColor  = dark ? '#6e7191' : '#a3a3a3';
    const copyColor  = copied ? '#22c55e' : (dark ? '#a3a3b8' : '#6b6b6b');
    const copyBg     = dark ? '#1a1a2e' : '#ffffff';

    function copy() {
        navigator.clipboard.writeText(raw).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }

    return (
        <div style={{ position: 'relative', margin: '10px 0', borderRadius: 10, overflow: 'hidden', background: blockBg, border: `1px solid ${borderColor}` }}>
            {lang && (
                <div style={{ padding: '4px 12px', fontSize: 11, color: langColor, borderBottom: `1px solid ${borderColor}`, background: headerBg, fontFamily: 'monospace' }}>
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
                    background: copyBg, border: `1px solid ${borderColor}`,
                    cursor: 'pointer', color: copyColor,
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
