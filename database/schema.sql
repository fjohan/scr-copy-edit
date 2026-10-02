CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(64) PRIMARY KEY,
  state_json LONGTEXT NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS process_events (
  id CHAR(36) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  document_id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  sequence_number BIGINT UNSIGNED NOT NULL,
  client_timestamp VARCHAR(32) NOT NULL,
  elapsed_ms BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  event_data JSON NOT NULL,
  received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX document_sequence (workspace_id, document_id, sequence_number),
  INDEX session_timeline (session_id, elapsed_ms),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
