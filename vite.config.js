import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const WORKER_HOST = 'https://orange-bar-54f5gceip-claude-proxy.jvillal7.workers.dev';
const SUPA_HOST   = 'https://mtrylcazzwolgzfzmbrn.supabase.co';

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${SUPA_HOST} ${WORKER_HOST}`,
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; '),
};

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { headers: securityHeaders },
  preview: { headers: securityHeaders },
})
