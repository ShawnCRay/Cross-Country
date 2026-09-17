CREATE TABLE IF NOT EXISTS entities (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (collection, id)
);
CREATE INDEX IF NOT EXISTS idx_entities_updated ON entities(updated_at);
CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'nightly',
  entity_count INTEGER NOT NULL,
  data TEXT NOT NULL
);
