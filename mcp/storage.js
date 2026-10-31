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
