-- Army of Agents — Supabase migration
-- Generated from prisma/schema.prisma

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  url TEXT,
  source TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS research_cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'created',
  decision TEXT,
  decision_comment TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_research_cases_project ON research_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_research_cases_status ON research_cases(status);

CREATE TABLE IF NOT EXISTS research_sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES research_cases(id),
  section_type TEXT NOT NULL,
  iteration INT NOT NULL DEFAULT 1,
  content JSONB NOT NULL DEFAULT '{}',
  sources_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(case_id, section_type)
);
CREATE INDEX IF NOT EXISTS idx_research_sections_case ON research_sections(case_id);

CREATE TABLE IF NOT EXISTS critic_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES research_cases(id),
  section_type TEXT NOT NULL,
  iteration INT NOT NULL DEFAULT 1,
  evidence_quality INT NOT NULL,
  logic_quality INT NOT NULL,
  completeness INT NOT NULL,
  verdict TEXT NOT NULL,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(case_id, section_type, iteration)
);
CREATE INDEX IF NOT EXISTS idx_critic_reviews_case ON critic_reviews(case_id);

CREATE TABLE IF NOT EXISTS scoring_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID UNIQUE NOT NULL REFERENCES research_cases(id),
  scores JSONB NOT NULL,
  total_score DECIMAL(3,2) NOT NULL,
  recommendation TEXT NOT NULL,
  reasoning TEXT,
  weak_sections TEXT[] DEFAULT '{}',
  strong_sections TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES research_cases(id),
  agent_type TEXT NOT NULL,
  section_type TEXT,
  iteration INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  llm_model TEXT,
  input_tokens INT,
  output_tokens INT,
  duration_ms INT,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_case ON agent_runs(case_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
