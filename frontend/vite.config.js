import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            manifest: false, // use existing public/site.webmanifest
            workbox: {
                maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MiB
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                runtimeCaching: [
                    {
                        // Network-first for lectures API so fresh data loads when online
                        urlPattern: /\/api\/v1\/lectures/,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'api-lectures',
                            networkTimeoutSeconds: 5,
                            expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    {
                        // Cache-first for static assets (fonts, images)
                        urlPattern: /\.(woff2|png|jpg|svg|ico)$/,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'static-assets',
                            expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
                        },
                    },
                ],
            },
        }),
    ],
    server: {
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                secure: false,
                // Required for SSE (text/event-stream) — prevent Vite from buffering
                headers: { 'Accept-Encoding': 'identity' },
            }
        }
    }
})
