/// <reference types="vitest" />
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Automatically load .env into process.env for local API execution
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        process.env[key] = val;
      }
    }
  });
}

function serverlessApiPlugin(): Plugin {
  return {
    name: 'serverless-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api/')) {
          return next();
        }

        // Parse JSON body for POST requests
        if (req.method === 'POST') {
          const buffers: Buffer[] = [];
          for await (const chunk of req) {
            buffers.push(chunk);
          }
          const raw = Buffer.concat(buffers).toString('utf8');
          try {
            (req as any).body = JSON.parse(raw);
          } catch {
            (req as any).body = {};
          }
        }

        // Mock Vercel response helper methods
        (res as any).status = function (code: number) {
          res.statusCode = code;
          return this;
        };
        (res as any).json = function (data: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
          return this;
        };

        try {
          const cleanPath = url.split('?')[0];

          if (cleanPath === '/api/session') {
            const { default: handler } = await server.ssrLoadModule('/api/session.ts');
            return await handler(req, res);
          }

          if (cleanPath === '/api/spin') {
            const { default: handler } = await server.ssrLoadModule('/api/spin.ts');
            return await handler(req, res);
          }

          if (cleanPath === '/api/coupon') {
            const { default: handler } = await server.ssrLoadModule('/api/coupon.ts');
            return await handler(req, res);
          }

          if (cleanPath.startsWith('/api/admin/')) {
            const action = cleanPath.replace('/api/admin/', '');
            (req as any).query = {
              action,
              ...Object.fromEntries(new URL(url, 'http://localhost').searchParams),
            };
            const { default: handler } = await server.ssrLoadModule('/api/admin/[action].ts');
            return await handler(req, res);
          }
        } catch (err: any) {
          console.error('API Error in dev server:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: err.message || 'Internal API Error' }));
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serverlessApiPlugin()],
  server: {
    port: 3000,
    host: true,
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
