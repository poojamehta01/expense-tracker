function initializeMcpStorage(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_idempotency (
      actor_email TEXT NOT NULL, client_id TEXT NOT NULL, operation TEXT NOT NULL,
      key TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, expires_at INTEGER NOT NULL,
      PRIMARY KEY(actor_email,client_id,operation,key)
    );
    CREATE INDEX IF NOT EXISTS mcp_idempotency_expiry ON mcp_idempotency(expires_at);
    CREATE TABLE IF NOT EXISTS mcp_write_audit (
      id INTEGER PRIMARY KEY, actor_email TEXT NOT NULL, client_id TEXT NOT NULL,
      operation TEXT NOT NULL, transaction_id INTEGER NOT NULL, changed_at TEXT NOT NULL,
      before_snapshot TEXT, after_snapshot TEXT NOT NULL
    );
  `);
}
module.exports = { initializeMcpStorage };

function createProviderAdapter(db, { now = () => Math.floor(Date.now() / 1000) } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS mcp_oauth (
    model TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER,
    grant_id TEXT, account_id TEXT, uid TEXT, user_code TEXT,
    PRIMARY KEY(model,id)
  );
  CREATE INDEX IF NOT EXISTS mcp_oauth_grant ON mcp_oauth(grant_id);
  CREATE INDEX IF NOT EXISTS mcp_oauth_uid ON mcp_oauth(model,uid);
  CREATE INDEX IF NOT EXISTS mcp_oauth_user_code ON mcp_oauth(model,user_code);
  CREATE INDEX IF NOT EXISTS mcp_oauth_expiry ON mcp_oauth(expires_at);`);
  return class SQLiteAdapter {
    constructor(model) { this.model = model; }
    async upsert(id, payload, expiresIn) {
      db.prepare('DELETE FROM mcp_oauth WHERE expires_at IS NOT NULL AND expires_at <= ?').run(now());
      db.prepare(`INSERT INTO mcp_oauth (model,id,payload,expires_at,grant_id,account_id,uid,user_code) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(model,id) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at,grant_id=excluded.grant_id,account_id=excluded.account_id,uid=excluded.uid,user_code=excluded.user_code`)
        .run(this.model, id, JSON.stringify(payload), typeof expiresIn === 'number' ? now() + expiresIn : null,
          payload.grantId || null, payload.accountId || null, payload.uid || null, payload.userCode || null);
    }
    async find(id) { return this.lookup('id', id); }
    async findByUid(uid) { return this.lookup('uid', uid); }
    async findByUserCode(code) { return this.lookup('user_code', code); }
    lookup(column, value) {
      if (value === undefined) return undefined;
      const row = db.prepare(`SELECT payload FROM mcp_oauth WHERE model=? AND ${column}=? AND (expires_at IS NULL OR expires_at>?)`).get(this.model, value, now());
      return row ? JSON.parse(row.payload) : undefined;
    }
    async destroy(id) { db.prepare('DELETE FROM mcp_oauth WHERE model=? AND id=?').run(this.model, id); }
    async consume(id) {
      const result = db.prepare("UPDATE mcp_oauth SET payload=json_set(payload,'$.consumed',?) WHERE model=? AND id=? AND json_extract(payload,'$.consumed') IS NULL AND (expires_at IS NULL OR expires_at>?)").run(now(), this.model, id, now());
      if (!result.changes) throw new Error('OAuth artifact already consumed or expired');
    }
    async revokeByGrantId(grantId) { db.prepare('DELETE FROM mcp_oauth WHERE grant_id=? OR (model=? AND id=?)').run(grantId, 'Grant', grantId); }
  };
}
module.exports.createProviderAdapter = createProviderAdapter;
