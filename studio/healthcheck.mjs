import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { X509Certificate } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { StudioError } from './contracts.mjs';
import { exactOrigin, integerEnvironment, readProtectedFile, sanitizeRuntimeError } from './container.mjs';
import { factoryRoles } from './factory-contracts.mjs';
import { workerHealthFile } from './worker.mjs';

export async function requestHealth({ port, cert, servername, timeoutMs = 4000 }) {
  return new Promise((resolveHealth, reject) => {
    const request = (cert ? httpsGet : httpGet)({
      hostname: '127.0.0.1', port, path: '/healthz', timeout: timeoutMs,
      ...(cert ? { ca: cert, servername, rejectUnauthorized: true, minVersion: 'TLSv1.2' } : {}),
    }, (response) => {
      let bytes = 0, body = '';
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 8192) request.destroy(new StudioError('HEALTH_UNAVAILABLE', 'Health response exceeded its transport limit.'));
        else body += chunk.toString('utf8');
      });
      response.once('error', reject);
      response.once('end', () => {
        try {
          const result = JSON.parse(body);
          if (response.statusCode !== 200 || result.status !== 'responsive') throw new StudioError('HEALTH_UNAVAILABLE', 'The local controller did not report responsive transport.');
          resolveHealth(result);
        } catch (error) { reject(error); }
      });
    });
    request.once('timeout', () => request.destroy(new StudioError('HEALTH_UNAVAILABLE', 'The local transport health deadline expired.')));
    request.once('error', reject);
  });
}

export async function checkHealth(env = process.env, {
  readFileFn = readProtectedFile, requestFn = requestHealth, processApi = process, now = Date.now(),
} = {}) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new StudioError('TLS_REQUIRED', 'Health checks never disable TLS verification.');
  if (env.STUDIO_WORKER_ROLE !== undefined) {
    if (!factoryRoles.includes(env.STUDIO_WORKER_ROLE)) throw new StudioError('INVALID_ROLE', 'Invalid worker health role.');
    const bytes = await readFileFn(workerHealthFile, { workspace: env.STUDIO_WORKSPACE, maximum: 4096 });
    let health;
    try { health = JSON.parse(bytes.toString('utf8')); } catch { throw new StudioError('HEALTH_UNAVAILABLE', 'Worker transport heartbeat is invalid.'); }
    if (health.version !== 1 || health.role !== env.STUDIO_WORKER_ROLE || !['idle', 'running'].includes(health.state)
      || !Number.isSafeInteger(health.pid) || health.pid < 1 || !Number.isFinite(health.updatedAt)
      || health.updatedAt > now + 5000 || !Number.isFinite(health.expiresAt) || health.expiresAt <= now) {
      throw new StudioError('HEALTH_UNAVAILABLE', 'Worker responsiveness heartbeat is absent, stopped, stale or role-mismatched.');
    }
    processApi.kill(health.pid, 0);
    return { status: 'responsive', production: 'Worker process/heartbeat only; no authority or successful inference is inferred.' };
  }
  const port = integerEnvironment(env, 'STUDIO_PORT', 4319, 1, 65535);
  if (env.STUDIO_PROXY_ORIGIN) {
    exactOrigin(env.STUDIO_PROXY_ORIGIN);
    return requestFn({ port });
  }
  const cert = await readFileFn(env.STUDIO_CERT_FILE, { workspace: env.STUDIO_WORKSPACE, publicFile: true });
  const certificate = new X509Certificate(cert);
  const servername = env.STUDIO_HEALTH_HOSTNAME
    ?? /\bDNS:([a-zA-Z0-9.-]+)(?:,|$)/.exec(certificate.subjectAltName ?? '')?.[1]
    ?? 'localhost';
  if (!/^[a-zA-Z0-9.-]+$/.test(servername) || !certificate.checkHost(servername)) {
    throw new StudioError('TLS_REQUIRED', 'The health-check DNS name must be covered by the configured controller certificate.');
  }
  return requestFn({ port, cert, servername });
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length) throw new StudioError('INVALID_ARGUMENTS', 'The health check accepts runtime environment inputs only.');
  return checkHealth(env);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => { console.error(sanitizeRuntimeError(error)); process.exitCode = 1; });
}
