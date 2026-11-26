import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { modes, object, redact, StudioError } from './contracts.mjs';
import { Studio } from './engine.mjs';
import { FactoryController } from './factory-controller.mjs';
import { factoryRoles } from './factory-contracts.mjs';
import { digest } from './contracts.mjs';

const webRoot = fileURLToPath(new URL('../prototype/', import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/service.js', ['service.js', 'text/javascript; charset=utf-8']],
  ['/live-ui.js', ['live-ui.js', 'text/javascript; charset=utf-8']],
  ['/factory-ui.js', ['factory-ui.js', 'text/javascript; charset=utf-8']],
]);
const tokenHash = (token) => createHash('sha256').update(token).digest();

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(body));
}

async function bodyOf(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw new StudioError('CONTENT_TYPE', 'Send application/json requests.', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new StudioError('BODY_LIMIT', 'Request body exceeds 64 KiB.', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new StudioError('INVALID_JSON', 'Request body is not valid JSON.');
  }
}

export async function createStudioServer({ studio, token, mode = 'local', allowedOrigins = [], tls, hostname = '127.0.0.1', port = 4319, container = false, proxyOrigin, factoryOptions = {}, executorToken }) {
  if (!modes.includes(mode)) throw new StudioError('INVALID_MODE', 'Use local, hosted, or self-hosted mode.');
  if (typeof token !== 'string' || token.length < 32 || token.length > 256 || /[\s\u0000-\u001f]/.test(token)) {
    throw new StudioError('AUTH_CONFIGURATION', 'Provide a 32-256 character service token from a secret store. Never place it in Git or a URL.');
  }
  if (mode === 'local' && !container && !['127.0.0.1', 'localhost', '::1'].includes(hostname)) throw new StudioError('BIND_DENIED', 'Local mode must bind to loopback.');
  const proxy = proxyOrigin ? new URL(proxyOrigin) : null;
  if (proxy && (proxy.origin !== proxyOrigin || proxy.protocol !== 'https:' || proxy.username || proxy.password)) throw new StudioError('TLS_REQUIRED', 'TLS termination needs an explicit, exact trusted HTTPS public origin.');
  if ((mode !== 'local' || container) && !proxy && (!tls?.cert || !tls?.key)) throw new StudioError('TLS_REQUIRED', 'Hosted and container services require configured TLS or explicitly configured trusted HTTPS ingress.');
  const origins = new Set(allowedOrigins.map((value) => {
    const url = new URL(value);
    if (url.origin !== value || !['http:', 'https:'].includes(url.protocol)) throw new StudioError('INVALID_ORIGIN', 'Allow exact HTTP(S) origins only.');
    return value;
  }));
  const expectedHash = tokenHash(token);
  const productId = (await studio.records.read()).data.productId;
  const workerCredentials = Object.fromEntries(factoryRoles.map((role) => [role, createHmac('sha256', token).update(`adhd-worker:${productId}:${role}`).digest('hex')]));
  const workerHashes = Object.entries(workerCredentials).map(([role, credential]) => [role, tokenHash(credential)]);
  if (executorToken && (typeof executorToken !== 'string' || executorToken.length < 32 || executorToken === token || Object.values(workerCredentials).includes(executorToken))) throw new StudioError('AUTH_CONFIGURATION', 'The executor requires a distinct protected credential of at least 32 characters.');
  const executorHash = executorToken ? tokenHash(executorToken) : null;
  studio.factory ??= await new FactoryController(studio, { ...factoryOptions, secret: token }).initialize();
  const attempts = new Map();
  const clients = new Set();
  let server;
  const listener = async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/healthz') {
        json(response, 200, { status: 'responsive', production: 'Not inferred from transport health.' });
        return;
      }
      const protocol = tls ? 'https:' : 'http:';
      const host = new URL(`${protocol}//${request.headers.host ?? ''}`);
      const boundPort = server.address().port;
      if (proxy ? request.headers.host !== proxy.host : Number(host.port || (tls ? 443 : 80)) !== boundPort
        || (mode === 'local' && !container && !['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname))) {
        throw new StudioError('HOST_DENIED', 'Unexpected service host.', 403);
      }
      const origin = request.headers.origin;
      if (origin && origin !== (proxy?.origin ?? host.origin) && !origins.has(origin)) throw new StudioError('ORIGIN_DENIED', 'This browser origin is not authorized by the service owner.', 403);
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
      }
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization,Content-Type',
          ...(request.headers['access-control-request-private-network'] === 'true' && origin ? { 'Access-Control-Allow-Private-Network': 'true' } : {}),
        });
        response.end();
        return;
      }
      const url = new URL(request.url, host.origin);
      if (url.search) throw new StudioError('QUERY_DENIED', 'Use request bodies and authorization headers, not URL credentials or query parameters.');
      if (request.method === 'GET' && assets.has(url.pathname)) {
        const [filename, mime] = assets.get(url.pathname);
        response.writeHead(200, { 'Content-Type': mime, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache' });
        response.end(await readFile(join(webRoot, filename)));
        return;
      }
      if (!url.pathname.startsWith('/api/')) throw new StudioError('NOT_FOUND', 'Resource not found.', 404);
      const address = request.socket.remoteAddress;
      const previous = attempts.get(address);
      if (previous && previous.until > Date.now() && previous.count >= 10) throw new StudioError('AUTH_RATE_LIMIT', 'Too many authentication failures. Retry after one minute.', 429);
      const supplied = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '')?.[1];
      const suppliedHash = supplied ? tokenHash(supplied) : null;
      const owner = suppliedHash && timingSafeEqual(suppliedHash, expectedHash);
      const workerRole = suppliedHash ? workerHashes.find(([, hash]) => timingSafeEqual(suppliedHash, hash))?.[0] : null;
      const executor = suppliedHash && executorHash && timingSafeEqual(suppliedHash, executorHash);
      if (!owner && !workerRole && !executor) {
        if (attempts.size >= 2048 && !attempts.has(address)) throw new StudioError('AUTH_RATE_LIMIT', 'Authentication capacity exceeded.', 429);
        attempts.set(address, { count: previous && previous.until > Date.now() ? previous.count + 1 : 1, until: Date.now() + 60_000 });
        throw new StudioError('UNAUTHORIZED', 'Enter the service owner-issued access token. It is retained only in page memory.', 401);
      }
      attempts.delete(address);
      if (workerRole && !/^\/api\/factory\/(?:claim|tasks\/[a-zA-Z0-9_-]+\/(?:observe|complete|check))$/.test(url.pathname)) throw new StudioError('WORKER_SCOPE_DENIED', 'This credential only accesses its role-scoped assignment protocol.', 403);
      if (executor && !['/api/executor/health', '/api/executor/verify'].includes(url.pathname)) throw new StudioError('EXECUTOR_SCOPE_DENIED', 'This credential only accesses the isolated executor protocol.', 403);
      if (request.method === 'GET' && url.pathname === '/api/state') {
        json(response, 200, await studio.snapshot());
      } else if (request.method === 'GET' && url.pathname === '/api/runtime') {
        json(response, 200, await studio.runner.inspect(studio.repository.root));
      } else if (request.method === 'GET' && url.pathname === '/api/events') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        response.write(`event: state\ndata: ${JSON.stringify(await studio.snapshot())}\n\n`);
        const client = { response };
        clients.add(client);
        const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15_000);
        request.once('close', () => { clients.delete(client); clearInterval(heartbeat); });
      } else if (request.method === 'PUT' && url.pathname === '/api/blueprint') {
        json(response, 200, await studio.saveBlueprint(await bodyOf(request)));
      } else if (request.method === 'POST' && url.pathname === '/api/readiness') {
        json(response, 200, await studio.check(await bodyOf(request)));
      } else if (request.method === 'POST' && url.pathname === '/api/runs') {
        json(response, 201, await studio.start(await bodyOf(request)));
      } else if (request.method === 'POST' && /^\/api\/runs\/[a-zA-Z0-9_-]+\/(pause|resume|cancel|verify|accept)$/.test(url.pathname)) {
        object(await bodyOf(request), []);
        const [, , , id, action] = url.pathname.split('/');
        json(response, 200, await studio.control(id, action));
      } else if (request.method === 'POST' && url.pathname === '/api/feedback') {
        json(response, 201, await studio.feedback(await bodyOf(request)));
      } else if (request.method === 'POST' && url.pathname === '/api/factory/authorize') {
        json(response, 200, await studio.factory.authorize(await bodyOf(request)));
      } else if (request.method === 'POST' && /^\/api\/factory\/(start|resume|pause|revoke)$/.test(url.pathname)) {
        object(await bodyOf(request), []);
        json(response, 200, await studio.factory.control(url.pathname.split('/').at(-1)));
      } else if (request.method === 'GET' && url.pathname === '/api/factory/mandate') {
        json(response, 200, await studio.factory.exportMandate());
      } else if (request.method === 'GET' && url.pathname === '/api/factory/worker-credentials') {
        json(response, 200, { productId, credentials: workerCredentials, warning: 'Secret material: store outside Git. Not a Factory operating authorization.' });
      } else if (request.method === 'GET' && url.pathname === '/api/factory/observations') {
        if (!studio.factory.observer) throw new StudioError('OBSERVABILITY_UNAVAILABLE', 'This host has no Operations Center adapter.', 503);
        json(response, 200, await studio.factory.observer.read());
      } else if (request.method === 'POST' && url.pathname === '/api/factory/package') {
        json(response, 200, await studio.factory.package(await bodyOf(request)));
      } else if (request.method === 'POST' && url.pathname === '/api/factory/claim') {
        if (!workerRole) throw new StudioError('WORKER_SCOPE_DENIED', 'Use the designated role worker credential.', 403);
        json(response, 200, await studio.factory.claim(workerRole, await bodyOf(request)));
      } else if (request.method === 'POST' && /^\/api\/factory\/tasks\/[a-zA-Z0-9_-]+\/(observe|complete|check)$/.test(url.pathname)) {
        if (!workerRole) throw new StudioError('WORKER_SCOPE_DENIED', 'Use the designated role worker credential.', 403);
        const id = url.pathname.split('/')[4];
        const action = url.pathname.split('/')[5];
        const input = await bodyOf(request);
        if (action === 'observe') json(response, 200, await studio.factory.workerEvent(workerRole, id, input));
        else if (action === 'complete') json(response, 200, await studio.factory.workerComplete(workerRole, id, input));
        else {
          object(input, ['lease']);
          await studio.factory.workerTask(workerRole, id, input.lease);
          json(response, 200, { active: true });
        }
      } else if (request.method === 'GET' && url.pathname === '/api/executor/health') {
        if (!studio.factory.executor) throw new StudioError('EXECUTOR_UNAVAILABLE', 'No isolated executor is configured.', 503);
        json(response, 200, await studio.factory.executor.inspect());
      } else if (request.method === 'POST' && url.pathname === '/api/executor/verify') {
        if (!studio.factory.executor) throw new StudioError('EXECUTOR_UNAVAILABLE', 'No isolated executor is configured.', 503);
        const input = object(await bodyOf(request), ['directory', 'verification', 'maximumMillis']);
        const selected = await realpath(input.directory);
        const root = studio.repository.root;
        const inside = relative(root, selected).replaceAll('\\', '/');
        if (selected !== root && !/^\.adhd\/studio\/worktrees\/[a-f0-9-]{36}$/.test(inside)) throw new StudioError('EXECUTOR_SCOPE_DENIED', 'Verification only reads this product or its registered worktrees.', 403);
        const programs = [studio.verification, ...Object.values(studio.factory.commands)];
        if (!programs.some((program) => digest(program) === digest(input.verification)) || !Number.isInteger(input.maximumMillis) || input.maximumMillis < 1 || input.maximumMillis > 3600000) throw new StudioError('EXECUTOR_SCOPE_DENIED', 'Use a registered verification/build program and a bounded operating window.', 403);
        json(response, 200, await studio.factory.executor.execute({ ...input, directory: selected, signal: AbortSignal.timeout(input.maximumMillis) }));
      } else throw new StudioError('NOT_FOUND', 'API operation not found.', 404);
    } catch (error) {
      if (!(error instanceof StudioError)) console.error(`Studio request failed: ${redact(error.message)}`);
      if (!response.headersSent) json(response, error instanceof StudioError ? error.status : 500, { error: { code: error.code ?? 'INTERNAL_ERROR', message: error instanceof StudioError ? error.message : 'The operation failed. Inspect service diagnostics; no success is claimed.' } });
      else response.destroy(error);
    }
  };
  server = tls ? httpsServer(tls, listener) : httpServer(listener);
  const send = (type, data) => {
    for (const { response } of clients) {
      response.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      if (response.writableLength > 2 * 1024 * 1024) response.destroy(new StudioError('STREAM_BACKPRESSURE', 'The event consumer exceeded its bounded output buffer.', 503));
    }
  };
  studio.on('state', (state) => send('state', state));
  studio.on('output', (output) => send('output', output));
  studio.on('factory-event', (event) => send('factory-event', event));
  studio.on('incident', (incident) => { console.error(`Studio incident: ${redact(incident.message)}`); send('incident', incident); });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, hostname, resolve); });
  return {
    server,
    url: `${tls ? 'https' : 'http'}://${hostname === '::1' ? '[::1]' : hostname}:${server.address().port}`,
    async close() {
      for (const { response } of clients) response.end();
      server.closeIdleConnections();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await studio.close();
    },
  };
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!['--workspace', '--mode', '--host', '--port', '--verify-command', '--verify-args', '--token-file', '--allow-origin', '--cert', '--key'].includes(args[index])
      || !args[index + 1] || Object.hasOwn(options, args[index])) throw new StudioError('INVALID_ARGUMENTS', 'Use explicit, unique option/value pairs.');
    options[args[index]] = args[index + 1];
  }
  if (!options['--workspace'] || !options['--verify-command'] || !options['--verify-args']) {
    throw new StudioError('CONFIGURATION_REQUIRED', 'Provide --workspace, --verify-command, and --verify-args (a JSON string array). The product repository must be separate from ADHD.');
  }
  if (options['--token-file']) {
    const inside = relative(await realpath(options['--workspace']), await realpath(options['--token-file']));
    if (!inside || (!inside.startsWith('..') && !isAbsolute(inside))) {
      throw new StudioError('AUTH_CONFIGURATION', 'Keep the service token file outside the product repository.');
    }
  }
  const token = options['--token-file'] ? (await readFile(options['--token-file'], 'utf8')).trim() : process.env.STUDIO_ACCESS_TOKEN;
  const mode = options['--mode'] ?? 'local';
  const studio = await new Studio({ workspace: options['--workspace'], mode, verification: { command: options['--verify-command'], args: JSON.parse(options['--verify-args']) } }).initialize();
  const service = await createStudioServer({
    studio, token, mode, hostname: options['--host'] ?? '127.0.0.1', port: Number(options['--port'] ?? 4319),
    allowedOrigins: options['--allow-origin'] ? [options['--allow-origin']] : [],
    tls: options['--cert'] && options['--key'] ? { cert: await readFile(options['--cert']), key: await readFile(options['--key']) } : undefined,
  });
  console.log(`ADHD Studio (${mode}): ${service.url}`);
  console.log('Use the configured service access token in the browser. Tokens are never printed or placed in URLs.');
  process.once('SIGINT', () => service.close().catch((error) => { console.error(redact(error.message)); process.exitCode = 1; }));
  process.once('SIGTERM', () => service.close().catch((error) => { console.error(redact(error.message)); process.exitCode = 1; }));
  return service;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => { console.error(redact(error.message)); process.exitCode = 1; });
}
