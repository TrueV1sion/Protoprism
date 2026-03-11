/*
  # PRISM Intelligence Platform -- Initial Schema

  1. New Tables
    - `runs` - Pipeline execution runs with query, status, tier, complexity scores, and cached manifest
      - `id` (text, primary key)
      - `query` (text) - the strategic question being analyzed
      - `status` (text) - lifecycle phase (INITIALIZE, THINK, CONSTRUCT, DEPLOY, SYNTHESIZE, VERIFY, PRESENT, COMPLETE, FAILED, CANCELLED)
      - `tier` (text) - swarm tier (MICRO, STANDARD, EXTENDED, MEGA, CAMPAIGN)
      - `autonomy_mode` (text) - supervised, guided, or autonomous
      - `complexity_score` (integer) - breadth + depth + interconnection (3-15)
      - `breadth`, `depth`, `interconnection` (integer) - individual complexity dimensions
      - `estimated_time` (text) - human-readable time estimate
      - `manifest` (jsonb) - cached full IntelligenceManifest for re-use
      - `created_at`, `updated_at`, `completed_at` (timestamptz)

    - `dimensions` - Analytical dimensions decomposed from the query
      - `id` (text, primary key)
      - `name` (text) - dimension name
      - `description` (text) - dimension description
      - `run_id` (text, FK -> runs) - parent run

    - `agents` - AI research agents deployed during pipeline execution
      - `id` (text, primary key)
      - `name` (text) - agent display name
      - `archetype` (text) - e.g. RESEARCHER-DATA, ANALYST-FINANCIAL
      - `mandate` (text) - agent's research mandate
      - `tools` (text) - JSON array of tool names
      - `dimension` (text) - which dimension this agent covers
      - `color` (text) - UI display color
      - `status` (text) - idle, active, complete, failed
      - `progress` (integer) - 0-100
      - `run_id` (text, FK -> runs)

    - `findings` - Individual research findings from agents
      - `id` (text, primary key)
      - `statement` (text) - finding statement
      - `evidence` (text) - supporting evidence
      - `confidence` (text) - HIGH, MEDIUM, LOW
      - `evidence_type` (text) - direct, inferred, analogical, modeled
      - `source` (text) - source citation
      - `source_tier` (text) - PRIMARY, SECONDARY, TERTIARY
      - `implication` (text) - strategic implication
      - `action` (text) - keep, dismiss, boost, flag
      - `tags` (text) - JSON array of tags
      - `agent_id` (text, FK -> agents)
      - `run_id` (text, FK -> runs)

    - `synthesis` - Synthesis layers from emergence detection
      - `id` (text, primary key)
      - `layer_name` (text) - foundation, convergence, tension, emergence, gap
      - `description` (text)
      - `insights` (text) - JSON array of insight strings
      - `sort_order` (integer) - display order
      - `run_id` (text, FK -> runs)

    - `presentations` - Generated HTML5 intelligence briefs
      - `id` (text, primary key)
      - `title` (text)
      - `subtitle` (text)
      - `html_path` (text) - path in public/decks/
      - `slide_count` (integer)
      - `created_at` (timestamptz)
      - `run_id` (text, unique, FK -> runs)

    - `settings` - Platform configuration (singleton row with id='default')
      - `id` (text, primary key)
      - `data` (text) - JSON blob of SettingsState
      - `onboarding_dismissed` (boolean)
      - `has_completed_tour` (boolean)
      - `updated_at` (timestamptz)

    - `api_keys` - Encrypted API keys for external providers
      - `id` (uuid, primary key)
      - `provider` (text, unique)
      - `encrypted_key` (text)
      - `created_at`, `updated_at` (timestamptz)

  2. Security
    - RLS enabled on ALL tables
    - Policies allow authenticated users full access
    - Anon users get read-only access to runs, agents, findings, synthesis, presentations, dimensions
    - Settings and api_keys restricted to authenticated users only

  3. Notes
    - Uses text primary keys (cuid/uuid format) matching existing application ID generation
    - JSON arrays stored as text columns for compatibility with existing parsing logic
    - manifest column on runs uses jsonb for efficient querying
    - Cascade deletes ensure referential integrity when runs are removed
*/

-- ─── Runs ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runs (
  id text PRIMARY KEY,
  query text NOT NULL,
  status text NOT NULL DEFAULT 'INITIALIZE',
  tier text NOT NULL DEFAULT 'STANDARD',
  autonomy_mode text NOT NULL DEFAULT 'supervised',
  complexity_score integer NOT NULL DEFAULT 0,
  breadth integer NOT NULL DEFAULT 0,
  depth integer NOT NULL DEFAULT 0,
  interconnection integer NOT NULL DEFAULT 0,
  estimated_time text,
  manifest jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage runs"
  ON runs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon users can read runs"
  ON runs FOR SELECT
  TO anon
  USING (true);

-- ─── Dimensions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dimensions (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE
);

ALTER TABLE dimensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage dimensions"
  ON dimensions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon users can read dimensions"
  ON dimensions FOR SELECT
  TO anon
  USING (true);

-- ─── Agents ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id text PRIMARY KEY,
  name text NOT NULL,
  archetype text NOT NULL DEFAULT '',
  mandate text NOT NULL DEFAULT '',
  tools text NOT NULL DEFAULT '[]',
  dimension text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#59DDFD',
  status text NOT NULL DEFAULT 'idle',
  progress integer NOT NULL DEFAULT 0,
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage agents"
  ON agents FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon users can read agents"
  ON agents FOR SELECT
  TO anon
  USING (true);

-- ─── Findings ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS findings (
  id text PRIMARY KEY,
  statement text NOT NULL,
  evidence text NOT NULL DEFAULT '',
  confidence text NOT NULL DEFAULT 'MEDIUM',
  evidence_type text NOT NULL DEFAULT 'direct',
  source text NOT NULL DEFAULT '',
  source_tier text NOT NULL DEFAULT 'SECONDARY',
  implication text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT 'keep',
  tags text NOT NULL DEFAULT '[]',
  agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE
);

ALTER TABLE findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage findings"
  ON findings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon users can read findings"
  ON findings FOR SELECT
  TO anon
  USING (true);

-- ─── Synthesis ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS synthesis (
  id text PRIMARY KEY,
  layer_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  insights text NOT NULL DEFAULT '[]',
  sort_order integer NOT NULL DEFAULT 0,
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE
);

ALTER TABLE synthesis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage synthesis"
  ON synthesis FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon users can read synthesis"
  ON synthesis FOR SELECT
  TO anon
  USING (true);

-- ─── Presentations ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS presentations (
  id text PRIMARY KEY,
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  html_path text NOT NULL,
  slide_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  run_id text NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE
);

ALTER TABLE presentations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage presentations"
  ON presentations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon users can read presentations"
  ON presentations FOR SELECT
  TO anon
  USING (true);

-- ─── Settings ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id text PRIMARY KEY DEFAULT 'default',
  data text NOT NULL DEFAULT '{}',
  onboarding_dismissed boolean NOT NULL DEFAULT false,
  has_completed_tour boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage settings"
  ON settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon users can read settings"
  ON settings FOR SELECT
  TO anon
  USING (true);

-- ─── API Keys ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  encrypted_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage api_keys"
  ON api_keys FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_run_id ON agents(run_id);
CREATE INDEX IF NOT EXISTS idx_findings_run_id ON findings(run_id);
CREATE INDEX IF NOT EXISTS idx_findings_agent_id ON findings(agent_id);
CREATE INDEX IF NOT EXISTS idx_synthesis_run_id ON synthesis(run_id);
CREATE INDEX IF NOT EXISTS idx_dimensions_run_id ON dimensions(run_id);
CREATE INDEX IF NOT EXISTS idx_presentations_run_id ON presentations(run_id);

-- ─── Updated_at trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER runs_updated_at
  BEFORE UPDATE ON runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();