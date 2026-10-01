import { defineConfig } from 'vite';

// relative base so the built site works from any sub-path (GitHub Pages, Netlify, Cloudflare Pages...)
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 900 } });
