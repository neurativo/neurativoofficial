// frontend/src/lib/summaryRenderer.jsx
// SINGLE SHARED summary parser used by App.jsx (live cards), LectureView.jsx,
// and ShareView.jsx. It converts the structured master/section markdown
// contract (## title, lead sentence, prose, > blockquote, "Key concepts:"
// backticked terms, "Examples:" with → arrows, fenced code) into structured
// section objects.
//
// All inline `code`, fenced ```code```, and $LaTeX$ inside prose/lead is left
// intact in the returned strings and rendered by renderDomainContent(), which
// converts them to real elements. NO raw markdown marker ever reaches the DOM
// as literal text.

import { renderDomainContent } from './renderDomainContent.jsx';

export { renderDomainContent };

// Extracts fenced code blocks from a set of lines, returning
// { codeBlocks: string[], remainingLines: string[] } where each codeBlock is
// the full ```...``` fence (so renderDomainContent renders it as a <pre>).
//
// Tolerant of malformed input: same-line fences (```py x=1```), unclosed
// trailing fences (```py x=1  ...EOF), inline fences appearing mid-line, and
// multiple back-to-back fences. Any line that still contains ``` after normal
// block extraction is scrubbed of residual fence markers so the prose passed
// downstream NEVER carries a literal ```.
function extractFencedCode(lines) {
    const codeBlocks = [];
    const remaining = [];
    let i = 0;
    while (i < lines.length) {
        const l = lines[i];
        const t = l.trim();
        if (t.startsWith('```')) {
            // Same-line fence close (```python x=1```) OR a line carrying more than
            // one fence marker — treat the whole line as a self-contained block.
            const fenceCount = (t.match(/```/g) || []).length;
            if (fenceCount >= 2) {
                codeBlocks.push(t);
                i += 1;
                continue;
            }
            // Opening fence: consume until the matching closing fence …
            const buf = [l];
            i += 1;
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                buf.push(lines[i]);
                i += 1;
            }
            if (i < lines.length) {
                // Found a closing fence line.
                buf.push(lines[i]);
                i += 1;
            } else {
                // … or hit end-of-input with the fence still open (unclosed trailing
                // fence). Synthesize a closing fence so downstream renders cleanly.
                buf.push('```');
            }
            codeBlocks.push(buf.join('\n'));
            continue;
        }
        // A non-fence-leading line may still contain a stray inline ``` — never let
        // it flow into prose as literal text. Strip the fence markers AND any leaked
        // language token that immediately followed a malformed opening fence.
        if (l.includes('```')) {
            const stripped = l
                .replace(/```[ \t]*(csharp|cs|javascript|js|typescript|ts|python|py|java|cpp|c\+\+|go|golang|rust|rs|ruby|rb|php|swift|kotlin|kt|scala|sql|bash|sh|shell|html|css|json|xml|yaml|yml|jsx|tsx)\b/gi, ' ')
                .replace(/`{3,}/g, ' ')
                .replace(/[ \t]{2,}/g, ' ');
            remaining.push(stripped);
            i += 1;
            continue;
        }
        remaining.push(l);
        i += 1;
    }
    return { codeBlocks, remainingLines: remaining };
}

/**
 * Parse a summary markdown string into structured section objects.
 *
 * @param {string} text
 * @returns {Array<{title, lead_sentence, prose, concepts, examples, highlights, codeBlocks}>}
 */
export function parseSummary(text) {
    if (!text) return [];
    const trimmed = text.trim();
    if (!trimmed || /^processing/i.test(trimmed)) return [];

    const hasStructuredSections = trimmed.includes('## ');
    const blocks = hasStructuredSections
        ? trimmed.split('## ').filter(s => s.trim())
        : [trimmed];

    const sections = blocks.map((block, idx) => {
        const rawLines = block.split('\n');
        // Structured blocks: first line is the title. Unstructured: synthesize one.
        let title;
        let bodyLines;
        if (hasStructuredSections) {
            title = rawLines[0].trim();
            bodyLines = rawLines.slice(1);
        } else {
            title = idx === 0 ? 'Summary' : `Section ${idx + 1}`;
            bodyLines = rawLines;
        }
        // Guard: never let a code fence or an over-long line become the title.
        if (title.startsWith('```') || title.length > 90) {
            title = idx === 0 ? 'Summary' : `Section ${idx + 1}`;
        }

        // Pull fenced code out first so it is rendered as a real code box and
        // never leaks into prose/lead.
        const { codeBlocks, remainingLines } = extractFencedCode(bodyLines);

        const highlights = [];
        const concepts = [];
        const examples = [];
        const proseLines = [];

        for (const line of remainingLines) {
            const l = line.trim();
            if (!l || l === '---') continue;

            // Blockquote insight
            if (l.startsWith('>')) {
                highlights.push(l.replace(/^>\s*/, ''));
                continue;
            }

            // Key concepts: `term`, `term`
            if (/^key concepts:/i.test(l)) {
                const matches = l.match(/`([^`]+)`/g);
                if (matches) {
                    matches.forEach(m => concepts.push(m.replace(/`/g, '').trim()));
                } else {
                    // Fallback: comma-split whatever follows the colon.
                    l.replace(/^key concepts:/i, '')
                        .split(',')
                        .map(s => s.trim())
                        .filter(Boolean)
                        .forEach(c => concepts.push(c));
                }
                continue;
            }

            // "Examples:" header — the following → / -> lines are the items.
            if (/^examples:\s*$/i.test(l)) continue;

            // Example lines: accept BOTH Unicode → and ASCII -> arrows.
            if (l.startsWith('→') || l.startsWith('->')) {
                examples.push(l.replace(/^(→|->)\s*/, '').trim());
                continue;
            }

            // Legacy "- " bullets
            if (l.startsWith('- ')) {
                const content = l.slice(2).trim();
                const lc = content.toLowerCase();
                if (content.startsWith('→') || content.startsWith('->') ||
                    lc.includes('example') || lc.includes('e.g.')) {
                    examples.push(content.replace(/^(→|->)\s*/, ''));
                } else if (/`[^`]+`/.test(content) || content.split(/\s+/).length < 5) {
                    concepts.push(content.replace(/`/g, '').trim());
                } else {
                    proseLines.push(content);
                }
                continue;
            }

            proseLines.push(l);
        }

        // Strip **bold** markers (renderDomainContent does not handle them).
        // Backticks and $..$ are LEFT for renderDomainContent to render.
        const fullProse = proseLines
            .map(l => l.replace(/\*\*(.*?)\*\*/g, '$1'))
            .join(' ')
            .trim();

        // Lead sentence: first sentence (up to '. ') that is >= 40 chars.
        let lead_sentence = fullProse;
        let prose = '';
        let searchFrom = 0;
        let found = false;
        while (searchFrom < fullProse.length) {
            const dot = fullProse.indexOf('. ', searchFrom);
            if (dot === -1) break;
            if (dot + 1 >= 40) {
                lead_sentence = fullProse.slice(0, dot + 1);
                prose = fullProse.slice(dot + 2).trim();
                found = true;
                break;
            }
            searchFrom = dot + 2;
        }
        if (!found) {
            const fb = fullProse.indexOf('. ');
            if (fb !== -1) {
                lead_sentence = fullProse.slice(0, fb + 1);
                prose = fullProse.slice(fb + 2).trim();
            }
        }

        // Graceful fallback: sparse block with no prose but with other text —
        // surface whatever exists rather than an empty card.
        if (!fullProse && !concepts.length && !examples.length && !highlights.length && !codeBlocks.length) {
            const joined = remainingLines.map(l => l.trim()).filter(Boolean).join(' ');
            lead_sentence = joined;
            prose = '';
        }

        return { title, lead_sentence, prose, concepts, examples, highlights, codeBlocks };
    });

    // Fix D: collapse duplicate section cards. A live master_summary can repeat
    // the same "## " section (identical title/content), which previously rendered
    // as multiple identical cards. dedupSections keeps one (richest) per identity.
    return dedupSections(sections);
}

// ── Section de-duplication ───────────────────────────────────────────────────
// Live SSE/polling can deliver a master_summary whose markdown contains the SAME
// section more than once (e.g. "02 Python's Role in Data Analysis" repeated),
// producing duplicate cards. Collapse them to a single card, keyed by a STABLE
// identity (normalized title + a hash of the lead/prose), keeping the RICHEST
// instance (most content) so nothing is lost. Returns each surviving section
// augmented with a stable `_key` usable as a React key.
function stableHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h) ^ str.charCodeAt(i); // djb2-xor
    }
    return (h >>> 0).toString(36);
}

function normalizeTitle(title) {
    return (title || '')
        .toLowerCase()
        .replace(/^\d+[.)\s-]*/, '')   // drop leading numbering like "02 " / "2) "
        .replace(/[^a-z0-9]+/g, ' ')   // collapse punctuation
        .trim();
}

function sectionRichness(sec) {
    return (sec.lead_sentence?.length || 0)
        + (sec.prose?.length || 0)
        + (sec.concepts?.length || 0) * 8
        + (sec.examples?.length || 0) * 8
        + (sec.highlights?.length || 0) * 8
        + (sec.codeBlocks?.length || 0) * 8;
}

export function dedupSections(sections) {
    if (!Array.isArray(sections)) return [];
    const byKey = new Map();      // stableKey -> { sec, order }
    let order = 0;
    for (const sec of sections) {
        const titleKey = normalizeTitle(sec.title);
        const contentSig = stableHash(
            (sec.lead_sentence || '').trim().toLowerCase() + '\u0001' +
            (sec.prose || '').trim().toLowerCase()
        );
        // Prefer title identity when a meaningful title exists; otherwise fall back
        // to a content hash so untitled/synthesized sections still dedup correctly.
        const key = titleKey ? `t:${titleKey}` : `c:${contentSig}`;

        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, { sec: { ...sec, _key: key }, order: order++ });
        } else if (sectionRichness(sec) > sectionRichness(existing.sec)) {
            // Keep the richer duplicate but preserve its original position.
            byKey.set(key, { sec: { ...sec, _key: key }, order: existing.order });
        }
    }
    return Array.from(byKey.values())
        .sort((a, b) => a.order - b.order)
        .map(e => e.sec);
}
