import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analytics, eventPage, matching, parseQuery, readModel } from './query.mjs';
import { createStore, eventSchema, ObservationError, VERSION } from './store.mjs';

const web = join(dirname(fileURLToPath(import.meta.url)), 'web');
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};

function errorBody(error) {
  return { error: error instanceof ObservationError ? error.message : 'Operations Center I/O failure; inspect the local service diagnostics' };
}

export function createCenterServer(directory, { intervalMs = 1000, log = (message) => process.stderr.write(`${message}\n`) } = {}) {
  const store = createStore(directory);
  const clients = new Set();
  let polling = false;
  let timer;

  function json(response, status, body) {
    response.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
  }

  function send(client, type, body, sequence) {
    const frame = `${sequence === undefined ? '' : `id: ${sequence}\n`}event: ${type}\ndata: ${JSON.stringify(body)}\n\n`;
    client.response.write(frame);
    if (client.response.writableLength > 2 * 1024 * 1024) {
      // Disconnect a slow consumer instead of buffering an unbounded journal.
      client.response.end();
      clients.delete(client);
      return false;
    }
    return true;
  }

  const server = createServer(async (request, response) => {
    try {
      const address = server.address();
      const authority = `127.0.0.1:${address.port}`;
      if (request.headers.host !== authority ||
          (request.headers.origin && request.headers.origin !== `http://${authority}`) ||
          ['cross-site', 'same-site'].includes(request.headers['sec-fetch-site'])) {
        json(response, 403, { error: 'This center is accessible only from its exact loopback origin' });
        return;
      }
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        json(response, 405, { error: 'Observation only: HTTP mutation and Factory control are not supported' });
        return;
      }
      const url = new URL(request.url, `http://${authority}`);
      if (assets.has(url.pathname)) {
        const [filename, type] = assets.get(url.pathname);
        response.writeHead(200, { ...headers, 'Content-Type': type });
        response.end(await readFile(join(web, filename)));
        return;
      }
      if (url.pathname === '/api/v1/schema') {
        if (url.searchParams.size) throw new ObservationError('Schema does not accept query parameters');
        json(response, 200, eventSchema);
        return;
      }
      const routes = ['/healthz', '/api/v1/overview', '/api/v1/metadata', '/api/v1/events', '/api/v1/analytics', '/api/v1/stream'];
      if (!routes.includes(url.pathname)) {
        json(response, 404, { error: 'Unknown Operations Center route' });
        return;
      }
      const query = parseQuery(url.searchParams);
      if (['/healthz', '/api/v1/overview', '/api/v1/metadata'].includes(url.pathname) && url.searchParams.size) throw new ObservationError('This route describes the whole Factory and does not accept filters');
      const { events, snapshot } = await readModel(store);
      if (url.pathname === '/healthz') {
        json(response, snapshot.coverage.ingestion_errors.length ? 503 : 200, {
          service: 'factory-operations-center', version: VERSION, factory_id: store.config.factory_id,
          status: snapshot.coverage.ingestion_errors.length ? 'degraded' : 'ready',
          factory_freshness: snapshot.freshness.state, coverage: snapshot.coverage,
        });
      } else if (url.pathname === '/api/v1/overview') {
        json(response, 200, snapshot);
      } else if (url.pathname === '/api/v1/metadata') {
        json(response, 200, snapshot.metadata);
      } else if (url.pathname === '/api/v1/events') {
        json(response, 200, eventPage(events, query));
      } else if (url.pathname === '/api/v1/analytics') {
        json(response, 200, analytics(events, store.config, query));
      } else {
        if (clients.size >= 20) throw new ObservationError('This local center supports at most 20 simultaneous streams', 429);
        const lastId = request.headers['last-event-id'];
        if (lastId !== undefined) {
          if (Array.isArray(lastId)) throw new ObservationError('Supply one stream cursor');
          query.after = parseQuery({ after: lastId }).after;
        }
        if (query.before !== undefined || query.order !== undefined || query.limit !== undefined) throw new ObservationError('Streaming uses forward after cursors and does not accept before, order, or limit');
        eventPage(events, query);
        response.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        response.write('retry: 2000\n\n');
        const client = { response, query, cursor: query.after ?? snapshot.last_sequence };
        clients.add(client);
        send(client, 'snapshot', snapshot);
        const replay = matching(events, query).filter((event) => event.sequence > client.cursor);
        for (const event of replay) {
          if (!send(client, 'fact', event, event.sequence)) break;
          client.cursor = event.sequence;
        }
        request.on('close', () => clients.delete(client));
      }
    } catch (error) {
      log(`[factory-observability] ${error instanceof ObservationError ? error.message : error.code ?? error.name}`);
      if (!response.headersSent) json(response, error instanceof ObservationError ? error.status : 503, errorBody(error));
      else response.end();
    }
  });

  async function poll() {
    if (polling || !clients.size) return;
    polling = true;
    try {
      const { events, snapshot } = await readModel(store);
      for (const client of clients) {
        for (const event of matching(events, client.query).filter((entry) => entry.sequence > client.cursor)) {
          if (!send(client, 'fact', event, event.sequence)) break;
          client.cursor = event.sequence;
        }
        if (clients.has(client)) send(client, 'status', { freshness: snapshot.freshness, coverage: snapshot.coverage, metadata: snapshot.metadata });
      }
    } catch (error) {
      log(`[factory-observability] stream read failed: ${error instanceof ObservationError ? error.message : error.code ?? error.name}`);
      for (const client of clients) send(client, 'capture-error', errorBody(error));
    } finally {
      polling = false;
    }
  }

  server.on('listening', () => { timer = setInterval(poll, intervalMs); timer.unref(); });
  server.on('close', () => clearInterval(timer));
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5000;
  server.maxConnections = 50;
  return {
    server, store,
    async listen(port = 0) {
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ObservationError('Port must be an integer between 0 and 65535');
      await new Promise((done, fail) => {
        server.once('error', fail);
        server.listen(port, '127.0.0.1', () => { server.removeListener('error', fail); done(); });
      });
      return `http://127.0.0.1:${server.address().port}`;
    },
    async close() {
      for (const client of clients) client.response.end();
      clients.clear();
      clearInterval(timer);
      if (server.listening) await new Promise((done, fail) => server.close((error) => error ? fail(error) : done()));
    },
  };
}
