import { useEffect } from 'react';

/**
 * Proper React SEO hook — updates document title + key meta tags inside
 * useEffect so DOM mutations never happen during the render phase.
 *
 * Supported params:
 *   title          – page-specific title (formatted as "Title | Neurativo")
 *   description    – meta description (falls back to site default)
 *   canonicalPath  – path portion of canonical URL e.g. "/pricing"
 *   ogImage        – full URL of OG image (falls back to /og.png)
 *   ogType         – "website" | "article" (default "website")
 *   noindex        – if true, sets robots noindex,nofollow
 *   keywords       – comma-separated keyword string for meta[name="keywords"]
 */
export function useSEO({ title, description, canonicalPath, ogImage, noindex, ogType, keywords } = {}) {
    const BASE       = 'https://www.neurativo.com';
    const siteTitle  = 'Neurativo';
    // title/description/keywords === undefined means "caller passes, don't overwrite existing value"
    const fullTitle  = title === undefined ? null : (title ? `${title} | Neurativo` : `Neurativo — AI Education Platform`);
    const desc       = description === undefined ? null : (description || 'Transforming education with intelligence. Neurativo captures live lectures and turns them into AI summaries, flashcards, quizzes, concept maps, and instant Q&A — the future of smarter learning.');
    const canonical  = canonicalPath ? `${BASE}${canonicalPath}` : `${BASE}/`;
    const image      = ogImage || `${BASE}/og.png`;
    const robots     = noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

    useEffect(() => {
        if (typeof document === 'undefined') return;

        /** Upsert a <meta> tag by CSS attribute selector. */
        const setMeta = (selector, value) => {
            let el = document.querySelector(selector);
            if (!el) {
                el = document.createElement('meta');
                const match = selector.match(/\[([^\]=]+)="([^"]+)"\]/);
                if (match) el.setAttribute(match[1], match[2]);
                document.head.appendChild(el);
            }
            el.setAttribute('content', value);
        };

        // Primary
        if (fullTitle !== null) document.title = fullTitle;
        if (desc !== null) setMeta('meta[name="description"]', desc);
        setMeta('meta[name="robots"]',              robots);
        if (keywords !== undefined) setMeta('meta[name="keywords"]', keywords || '');

        // Open Graph
        setMeta('meta[property="og:type"]',         ogType || 'website');
        setMeta('meta[property="og:site_name"]',    siteTitle);
        if (fullTitle !== null) setMeta('meta[property="og:title"]', fullTitle);
        if (desc !== null)      setMeta('meta[property="og:description"]', desc);
        setMeta('meta[property="og:url"]',          canonical);
        setMeta('meta[property="og:image"]',        image);
        setMeta('meta[property="og:image:type"]',   'image/png');

        // Twitter
        setMeta('meta[name="twitter:card"]',        'summary_large_image');
        if (fullTitle !== null) setMeta('meta[name="twitter:title"]',       fullTitle);
        if (desc !== null)      setMeta('meta[name="twitter:description"]', desc);
        setMeta('meta[name="twitter:image"]',       image);

        // Canonical link
        let canonEl = document.querySelector('link[rel="canonical"]');
        if (!canonEl) {
            canonEl = document.createElement('link');
            canonEl.setAttribute('rel', 'canonical');
            document.head.appendChild(canonEl);
        }
        canonEl.setAttribute('href', canonical);
    }, [fullTitle, desc, canonical, image, robots, ogType, keywords]);
}
