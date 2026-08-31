CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'coach', 'school', 'compliance')),
  school TEXT,
  ncaa_division TEXT,
  school_email_domain TEXT,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  lock_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  stored_file_name TEXT NOT NULL,
  stored_file_path TEXT NOT NULL,
  file_size INT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  ai_screening JSONB,
  access_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_contracts_user_created ON contracts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_user_accessed ON contracts (user_id, last_accessed_at DESC);

CREATE TABLE IF NOT EXISTS rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school TEXT NOT NULL,
  sport TEXT NOT NULL,
  year INT NOT NULL,
  players JSONB NOT NULL DEFAULT '[]',
  player_count INT NOT NULL DEFAULT 0,
  source_file_name TEXT,
  stored_file_name TEXT,
  stored_file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, school, sport, year)
);

CREATE INDEX IF NOT EXISTS idx_rosters_user_updated ON rosters (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS document_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL UNIQUE,
  contract_id TEXT NOT NULL,
  contract_file_name TEXT,
  contract_file_size INT,
  stored_file_path TEXT,
  mime_type TEXT,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_email TEXT,
  student_school TEXT,
  student_division TEXT,
  assigned_compliance_user_id UUID REFERENCES users(id),
  assigned_compliance_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  reviewer_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  UNIQUE (student_user_id, contract_id)
);

CREATE INDEX IF NOT EXISTS idx_requests_student ON document_requests (student_user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_officer ON document_requests (assigned_compliance_user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_school_status ON document_requests (student_school, status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  user_id TEXT,
  email TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs (user_id, created_at DESC);
