// Real Nginx contract tests: no production server, credentials, Docker or model calls.
// NGINX_BIN must point to an installed binary; build the frontend before running.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, request } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const nginx = process.env.NGINX_BIN || 'nginx';
const hash = body => createHash('sha256').update(body).digest('hex');
const deadline = (promise, label, ms = 4000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); })]).finally(() => clearTimeout(timer));
};
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const quote = value => `"${value.replaceAll('\\', '/').replaceAll('"', '\\"')}"`;
function get(port, path, headers = {}, body) {
  return new Promise((accept, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: body === undefined ? 'GET' : 'POST', headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => accept({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.setTimeout(4000, () => req.destroy(new Error('request timed out')));
    req.on('error', reject); req.end(body);
  });
}

test('production Nginx delivery contract', { timeout: 60000 }, async t => {
  const version = spawnSync(nginx, ['-v'], { encoding: 'utf8', windowsHide: true });
  assert.equal(version.status, 0, `Set NGINX_BIN to an installed Nginx binary: ${version.error || version.stderr}`);
  console.log(version.stderr.trim());
  const build = join(root, 'build');
  const index = await readFile(join(build, 'index.html'));
  const assets = await readdir(join(build, 'assets'));
  const entryPath = index.toString().match(/src="(\/assets\/[^" ]+\.js)"/)?.[1];
  assert.ok(entryPath, 'Run npm run build first');
  const cssPath = `/assets/${assets.find(name => name.endsWith('.css'))}`;
  const workerPath = `/assets/${assets.find(name => name.startsWith('editor.worker-'))}`;
  let releaseSSE, sseClosed, uploadStarted;
  const upstream = createServer(async (req, res) => {
    if (req.url.endsWith('/sse') || req.url.endsWith('/cancel')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.on('close', () => sseClosed?.());
      res.write('event: delta\ndata: {"delta":"first"}\n\n');
      releaseSSE = () => res.end('event: done\ndata: {"content":"done"}\n\n');
      return;
    }
    if (req.url.endsWith('/error')) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end('{"code":403,"msg":"denied"}'); return; }
    if (req.url.endsWith('/large-json')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ content: 'private-fixture'.repeat(1024) })); return; }
    const chunks = [];
    req.on('data', chunk => { chunks.push(chunk); if (req.url.endsWith('/upload')) uploadStarted?.(); });
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ bytes: body.length, hash: hash(body), auth: req.headers.authorization, tenant: req.headers.tenantid, method: req.method, url: req.url }));
    });
  });
  let processHandle, fixture;
  t.after(async () => {
    try {
      if (processHandle && processHandle.exitCode === null) { const ended = once(processHandle, 'exit'); processHandle.kill(); await deadline(ended, 'Nginx shutdown'); }
    } finally {
      upstream.closeAllConnections();
      if (upstream.listening) await new Promise(resolve => upstream.close(resolve));
      if (fixture) console.log(`Isolated Nginx logs/config retained at ${fixture}`);
    }
  });
  const upstreamPort = await listen(upstream);
  const probe = createServer(); const port = await listen(probe); await new Promise(resolve => probe.close(resolve));
  fixture = await mkdtemp(join(tmpdir(), 'watchalert-nginx-'));
  await mkdir(join(fixture, 'logs'));
  await mkdir(join(fixture, 'temp'));
  const source = await readFile(join(root, 'w8t.conf'), 'utf8');
  // Only replace deployment addresses/paths; all actual delivery directives stay intact.
  for (const value of ['listen 80;', 'root /app;', 'http://w8t-service:9001']) assert.equal(source.split(value).length, 2, `expected exactly one ${value}`);
  const server = source.replace('listen 80;', `listen 127.0.0.1:${port};`).replace('root /app;', `root ${quote(build)};`).replace('http://w8t-service:9001', `http://127.0.0.1:${upstreamPort}`);
  let mime;
  for (const candidate of [process.env.NGINX_MIME_TYPES, join(dirname(resolve(nginx)), 'conf/mime.types'), '/etc/nginx/mime.types']) {
    if (!candidate) continue;
    try { await readFile(candidate); mime = candidate; break; } catch { /* next installed location */ }
  }
  assert.ok(mime, 'Set NGINX_MIME_TYPES to the installed mime.types file');
  await writeFile(join(fixture, 'nginx.conf'), `worker_processes 1;\npid nginx.pid;\nerror_log logs/error.log info;\nevents { worker_connections 64; }\nhttp { include ${quote(mime)}; default_type application/octet-stream; access_log off;
    client_body_temp_path temp/client_body; proxy_temp_path temp/proxy;
    fastcgi_temp_path temp/fastcgi; uwsgi_temp_path temp/uwsgi; scgi_temp_path temp/scgi;
    ${server} }\n`);
  const args = ['-p', `${fixture.replaceAll('\\', '/')}/`, '-c', 'nginx.conf'];
  const syntax = spawnSync(nginx, [...args, '-t'], { encoding: 'utf8', windowsHide: true });
  {
    assert.equal(syntax.status, 0, syntax.stderr);
    processHandle = spawn(nginx, [...args, '-g', 'daemon off; master_process off;'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = ''; processHandle.stderr.on('data', part => { stderr += part; });
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { await get(port, '/'); ready = true; break; } catch { if (processHandle.exitCode !== null) break; await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    assert.ok(ready, `Nginx did not start: ${stderr}`);

    await t.test('HTML and SPA routes revalidate; public filenames are not immutable', async () => {
      for (const path of ['/', '/index.html', '/alerts?env=prod', '/ruleGroup/group/rule/list']) {
        const result = await get(port, path);
        assert.equal(result.status, 200); assert.deepEqual(result.body, index);
        assert.match(result.headers['cache-control'], /no-cache/);
        const cached = await get(port, path, { 'If-None-Match': result.headers.etag });
        assert.equal(cached.status, 304); assert.match(cached.headers['cache-control'], /no-cache/);
      }
      const logo = await get(port, '/watchalert-logo-simple.svg');
      assert.equal(logo.status, 200); assert.match(logo.headers['cache-control'], /no-cache/);
    });
    await t.test('hashed JS/CSS/worker assets cache immutably; missing files never return HTML', async () => {
      for (const path of [entryPath, cssPath, workerPath]) {
        const result = await get(port, path);
        assert.equal(result.status, 200); assert.match(result.headers['cache-control'], /max-age=31536000, immutable/);
        const cached = await get(port, path, { 'If-None-Match': result.headers.etag });
        assert.equal(cached.status, 304); assert.match(cached.headers['cache-control'], /immutable/);
      }
      for (const path of ['/assets/missing-Abc12345.js', '/assets/missing.js']) {
        const result = await get(port, path); assert.equal(result.status, 404);
        assert.doesNotMatch(result.headers['cache-control'] || '', /immutable/);
        assert.notDeepEqual(result.body, index);
      }
    });
    await t.test('real entry JS compresses and varies by encoding, including ingress Via', async () => {
      const plain = await get(port, entryPath, { 'Accept-Encoding': 'identity' });
      const zipped = await get(port, entryPath, { 'Accept-Encoding': 'gzip', Via: '1.1 test-ingress' });
      assert.equal(zipped.headers['content-encoding'], 'gzip'); assert.match(zipped.headers.vary, /Accept-Encoding/i);
      assert.deepEqual(gunzipSync(zipped.body), plain.body); assert.ok(zipped.body.length < plain.body.length * 0.75);
      console.log(JSON.stringify({ entryPath, originalBytes: plain.body.length, gzipBytes: zipped.body.length }));
    });
    await t.test('small and 2MiB API requests preserve body, auth and tenant', async () => {
      for (const body of [Buffer.from('{"content":"分析生产告警"}'), Buffer.alloc(2 * 1024 * 1024, 97)]) {
        const result = await get(port, '/api/w8t/echo?check=1', { 'Content-Type': 'application/json', 'Content-Length': body.length, Authorization: 'Bearer fixture', TenantID: 'test', 'Accept-Encoding': 'gzip' }, body);
        assert.equal(result.status, 200);
        assert.equal(result.headers['content-encoding'], undefined);
        assert.doesNotMatch(result.headers['cache-control'] || '', /immutable|public/);
        assert.deepEqual(JSON.parse(result.body), { bytes: body.length, hash: hash(body), auth: 'Bearer fixture', tenant: 'test', method: 'POST', url: '/api/w8t/echo?check=1' });
      }
    });
    await t.test('chunked upload reaches upstream before the client finishes sending', async () => {
      const firstChunk = new Promise(resolve => { uploadStarted = resolve; });
      const chunks = [Buffer.alloc(2048, 97), Buffer.alloc(2048, 98)];
      const req = request({ host: '127.0.0.1', port, path: '/api/w8t/upload', method: 'POST' });
      const response = new Promise((accept, reject) => {
        req.on('error', reject); req.on('response', res => { const data = []; res.on('data', part => data.push(part)); res.on('end', () => { try { accept(JSON.parse(Buffer.concat(data))); } catch (error) { reject(error); } }); res.on('error', reject); });
      });
      response.catch(() => {});
      try { req.write(chunks[0]); await deadline(firstChunk, 'upstream first upload chunk'); req.end(chunks[1]); const result = await deadline(response, 'upload response'); assert.equal(result.hash, hash(Buffer.concat(chunks))); assert.equal(result.bytes, 4096); }
      finally { req.destroy(); uploadStarted = null; }
    });
    await t.test('SSE emits before done, stays uncompressed, and propagates cancellation', async () => {
      for (const cancel of [false, true]) {
        const closed = new Promise(resolve => { sseClosed = resolve; });
        const req = request({ host: '127.0.0.1', port, path: cancel ? '/api/w8t/cancel' : '/api/w8t/sse', method: 'POST', headers: { 'Accept-Encoding': 'gzip' } });
        const received = once(req, 'response'); req.end('{}');
        try {
          const [res] = await deadline(received, 'SSE headers');
          assert.equal(res.headers['content-encoding'], undefined); assert.doesNotMatch(res.headers['cache-control'] || '', /immutable/);
          const [part] = await deadline(once(res, 'data'), 'first SSE chunk before completion'); assert.match(part.toString(), /first/);
          if (cancel) { req.destroy(); await deadline(closed, 'upstream cancellation'); }
          else { const ended = once(res, 'end'); releaseSSE(); await deadline(ended, 'SSE completion'); }
        } finally { req.destroy(); releaseSSE?.(); sseClosed = null; }
      }
    });
    await t.test('API errors remain API errors, not cached SPA responses', async () => {
      const result = await get(port, '/api/w8t/error'); assert.equal(result.status, 403);
      assert.equal(JSON.parse(result.body).code, 403); assert.doesNotMatch(result.headers['cache-control'] || '', /immutable|public/);
      const large = await get(port, '/api/w8t/large-json', { 'Accept-Encoding': 'gzip', Authorization: 'Bearer fixture' });
      assert.equal(large.status, 200); assert.equal(large.headers['content-encoding'], undefined);
      assert.equal(JSON.parse(large.body).content.length, 'private-fixture'.length * 1024);
      assert.equal(large.headers['access-control-allow-origin'], '*');
      assert.doesNotMatch(large.headers['cache-control'] || '', /immutable|public/);
    });
  }
});
