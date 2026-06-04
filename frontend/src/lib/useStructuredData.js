import { useEffect } from 'react';

/**
 * Injects a per-page JSON-LD <script> into <head> and removes it on unmount.
 * Safe to call multiple times on the same page with different data objects.
 * Uses a stable id derived from @type + @id to avoid duplicate tags on hot reload.
 *
 * @param {object|object[]} data  Schema.org object or array of objects
 */
export function useStructuredData(data) {
    useEffect(() => {
        if (!data || typeof document === 'undefined') return;

        const payload = Array.isArray(data) ? data : [data];
        const types = payload.map(d => d['@type'] || 'unknown').join('-');
        const id = 'ld-page-' + types.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('script');
            el.type = 'application/ld+json';
            el.id = id;
            document.head.appendChild(el);
        }
        el.textContent = JSON.stringify(Array.isArray(data) ? { '@context': 'https://schema.org', '@graph': data } : data);

        return () => {
            const existing = document.getElementById(id);
            if (existing) existing.remove();
        };
    }, [JSON.stringify(data)]); // eslint-disable-line react-hooks/exhaustive-deps
}
