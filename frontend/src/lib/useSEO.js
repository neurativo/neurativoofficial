/**
 * Lightweight SEO hook — updates document title + key meta tags without
 * a heavy dependency like react-helmet. Works fine for a SPA where the
 * index.html defaults already cover the landing page.
 */
export function useSEO({ title, description, canonicalPath, ogImage } = {}) {
    if (typeof document === 'undefined') return;

    const siteTitle = 'Neurativo';
    const fullTitle = title ? `${title} – ${siteTitle}` : `${siteTitle} — AI Lecture Assistant`;
    const desc = description || 'Record any lecture and get live transcription, AI summaries, and instant Q&A in any language. The smartest way to study.';
    const canonical = canonicalPath ? `https://neurativo.com${canonicalPath}` : 'https://neurativo.com/';
    const image = ogImage || 'https://neurativo.com/og.png';

    // Update title
    document.title = fullTitle;

    // Helper to set a meta tag
    const setMeta = (selector, attr, value) => {
        let el = document.querySelector(selector);
        if (!el) {
            el = document.createElement('meta');
            const [attrName, attrVal] = selector.match(/\[([^\]=]+)="([^"]+)"\]/)?.slice(1) || [];
            if (attrName) el.setAttribute(attrName, attrVal);
            document.head.appendChild(el);
        }
        el.setAttribute(attr, value);
    };

    setMeta('meta[name="description"]',        'content', desc);
    setMeta('meta[property="og:title"]',        'content', fullTitle);
    setMeta('meta[property="og:description"]',  'content', desc);
    setMeta('meta[property="og:url"]',          'content', canonical);
    setMeta('meta[property="og:image"]',        'content', image);
    setMeta('meta[name="twitter:title"]',       'content', fullTitle);
    setMeta('meta[name="twitter:description"]', 'content', desc);
    setMeta('meta[name="twitter:image"]',       'content', image);

    // Canonical link
    let canonEl = document.querySelector('link[rel="canonical"]');
    if (!canonEl) {
        canonEl = document.createElement('link');
        canonEl.setAttribute('rel', 'canonical');
        document.head.appendChild(canonEl);
    }
    canonEl.setAttribute('href', canonical);
}
