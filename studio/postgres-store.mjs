import pg from 'pg';
import { StudioError } from './contracts.mjs';
import { revisionOf } from '../.github/tools/revision-lock.mjs';

export class PostgresStore {
  constructor({ connectionString, key, client } = {}) {
    if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(key)) throw new StudioError('STORE_CONFIGURATION', 'Configure an explicit product-scoped PostgreSQL store key.');
    this.key = key;
    if (!client) {
      if (typeof connectionString !== 'string' || !connectionString.trim()) throw new StudioError('STORE_CONFIGURATION', 'Provide an explicit PostgreSQL connection from protected runtime storage.');
      const uri = new URL(connectionString);
      if (!['postgres:', 'postgresql:'].includes(uri.protocol)) throw new StudioError('STORE_CONFIGURATION', 'Use a PostgreSQL connection URI.');
      if (!['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname) && uri.searchParams.get('sslmode') !== 'verify-full') {
        throw new StudioError('TLS_REQUIRED', 'Remote PostgreSQL state requires sslmode=verify-full and a trusted server certificate.');
      }
    }
    this.client = client ?? new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });
    this.error = null;
    this.closed = false;
    this.client.on?.('error', (error) => { this.error = error; });
  }

  async initialize(content) {
    await this.client.connect();
    const lock = await this.client.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired', [`adhd-studio:${this.key}`]);
    if (lock.rows[0]?.acquired !== true) {
      await this.client.end();
      this.closed = true;
      throw new StudioError('SERVICE_ALREADY_RUNNING', 'Another controller owns the product PostgreSQL lease.', 409);
    }
    await this.client.query('CREATE TABLE IF NOT EXISTS adhd_studio_records (product_key text PRIMARY KEY, content text NOT NULL, revision text NOT NULL, projection_revision text NOT NULL)');
    const revision = revisionOf(content);
    await this.client.query('INSERT INTO adhd_studio_records (product_key, content, revision, projection_revision) VALUES ($1, $2, $3, $3) ON CONFLICT (product_key) DO NOTHING', [this.key, content, revision]);
    return this.read();
  }

  async query(sql, args) {
    if (this.error) throw new StudioError('STORE_LEASE_LOST', 'The PostgreSQL session/lease was lost. No local-store fallback is permitted.', 503);
    return this.client.query(sql, args);
  }

  async read() {
    const result = await this.query('SELECT content, revision, projection_revision FROM adhd_studio_records WHERE product_key = $1', [this.key]);
    const row = result.rows[0];
    if (!row || row.revision !== revisionOf(row.content)) throw new StudioError('CORRUPT_RECORDS', 'The external product record or its digest is invalid.', 409);
    return { exists: true, content: row.content, revision: row.revision, projectionRevision: row.projection_revision };
  }

  async update(expected, content) {
    const revision = revisionOf(content);
    const result = await this.query('UPDATE adhd_studio_records SET content = $1, revision = $2 WHERE product_key = $3 AND revision = $4 RETURNING revision', [content, revision, this.key, expected]);
    return result.rowCount === 1 ? { ok: true, revision } : { ok: false, reason: 'revision-mismatch' };
  }

  async projected(revision) {
    const result = await this.query('UPDATE adhd_studio_records SET projection_revision = $1 WHERE product_key = $2 AND revision = $1', [revision, this.key]);
    if (result.rowCount !== 1) throw new StudioError('RECORD_CONFLICT', 'External state changed while its Git export was saved.', 409);
  }

  async close() {
    if (!this.closed) { this.closed = true; await this.client.end(); }
  }
}
