process.env.NODE_ENV = 'production';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
const root = process.cwd();
await build({ entryPoints: ['src/entry-server.tsx'], bundle: true, platform: 'node', format: 'cjs', outfile: '.prerender/entry.cjs', loader: { '.css': 'empty' }, external: ['react', 'react-dom', 'react-dom/server'], jsx: 'automatic', logLevel: 'error' });
const require = createRequire(import.meta.url);
const { render } = require(path.join(root, '.prerender/entry.cjs'));
const template = await readFile(path.join(root, 'dist/index.html'), 'utf8');
await writeFile(path.join(root, 'dist/studio.html'), template);
const siteUrl = process.env.SITE_URL;
for (const route of ['/', '/compare/redis']) {
  const destination = route === '/' ? 'dist/index.html' : 'dist/compare/redis/index.html';
  let html = template.replace('<div id="root"></div>', `<div id="root">${render(route)}</div>`);
  if (route !== '/') html = html.replace('<title>pbredisdb — See inside your database</title>', '<title>pbredisdb vs Redis — Implementation scope</title>');
  if (siteUrl) {
    const canonical = new URL(route, siteUrl).href;
    const image = new URL('/social-card.png', siteUrl).href;
    html = html.replace('</head>', `<link rel="canonical" href="${canonical.replaceAll('"', '&quot;')}" /><meta property="og:url" content="${canonical.replaceAll('"', '&quot;')}" /></head>`).replaceAll('content="/social-card.png"', `content="${image.replaceAll('"', '&quot;')}"`);
  }
  await mkdir(path.dirname(path.join(root, destination)), { recursive: true });
  await writeFile(path.join(root, destination), html);
  console.log(`Prerendered ${route}: ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB HTML`);
}
const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.js)"/g)].map((match) => match[1]);
let total = 0;
for (const asset of new Set(initial)) total += gzipSync(await readFile(path.join(root, 'dist', asset))).length;
console.log(`Initial JavaScript: ${(total / 1024).toFixed(1)} KB gzip (budget: 150 KB)`);
if (total > 150 * 1024) throw new Error('Landing page exceeds the initial JavaScript budget');
