# Army of Agents MVP — Data Model

PostgreSQL (Supabase). Схема для research pipeline.

---

## ER-диаграмма

```
projects 1──* research_cases 1──* research_sections
                    │                     │
                    │                1──* critic_reviews
                    │
                    1──* scoring_results
```

---

## Таблицы

### projects

Стартап/продукт для анализа.

```sql
CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  url         TEXT,
  source      TEXT NOT NULL,          -- 'trustmrr', 'producthunt', 'manual'
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
```

### research_cases

Один запуск research для проекта. Проект может иметь несколько research cases (повторный анализ).

```sql
CREATE TABLE research_cases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id),
  status      TEXT NOT NULL DEFAULT 'created',
  -- FSM: created → research_queued → research_in_progress → critic_review
  --      → scoring → report_ready → decision_pending → go/hold/reject
  decision    TEXT,                    -- 'go', 'hold', 'reject'
  decision_comment TEXT,              -- комментарий оператора
  decided_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_research_cases_project ON research_cases(project_id);
CREATE INDEX idx_research_cases_status ON research_cases(status);
```

### research_sections

Результат работы Researcher по одной секции. Upsert по (case_id, section_type) — idempotent.

```sql
CREATE TABLE research_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID NOT NULL REFERENCES research_cases(id),
  section_type  TEXT NOT NULL,        -- 'market', 'competitor', 'signals', 'tech', 'risk'
  iteration     INT NOT NULL DEFAULT 1,
  content       JSONB NOT NULL,       -- structured research output
  sources_count INT DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',
  -- 'pending', 'in_progress', 'completed', 'failed'
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),

  UNIQUE(case_id, section_type)
);

CREATE INDEX idx_sections_case ON research_sections(case_id);
```

**content JSONB structure:**
```json
{
  "summary": "string",
  "findings": [
    {
      "claim": "string",
      "evidence": "string",
      "confidence": "high|medium|low",
      "source_url": "string|null"
    }
  ],
  "risks": ["string"],
  "opportunities": ["string"]
}
```

### critic_reviews

Результат работы Critic по одной секции за одну итерацию.

```sql
CREATE TABLE critic_reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID NOT NULL REFERENCES research_cases(id),
  section_type      TEXT NOT NULL,
  iteration         INT NOT NULL DEFAULT 1,
  evidence_quality  INT NOT NULL CHECK (evidence_quality BETWEEN 1 AND 5),
  logic_quality     INT NOT NULL CHECK (logic_quality BETWEEN 1 AND 5),
  completeness      INT NOT NULL CHECK (completeness BETWEEN 1 AND 5),
  verdict           TEXT NOT NULL,    -- 'pass', 'fail', 'pass_with_warning'
  feedback          TEXT,             -- что доработать (при fail)
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reviews_case ON critic_reviews(case_id);
CREATE UNIQUE INDEX idx_reviews_unique ON critic_reviews(case_id, section_type, iteration);
```

### scoring_results

Итоговый score от Scorer.

```sql
CREATE TABLE scoring_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL REFERENCES research_cases(id) UNIQUE,
  scores          JSONB NOT NULL,     -- {"market_need": 4.2, "competition": 3.5, ...}
  total_score     DECIMAL(3,2) NOT NULL,
  recommendation  TEXT NOT NULL,      -- 'go', 'hold', 'reject'
  reasoning       TEXT,
  weak_sections   TEXT[],
  strong_sections TEXT[],
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

**scores JSONB structure:**
```json
{
  "market_need": 4.2,
  "competition": 3.5,
  "demand_signals": 3.8,
  "tech_feasibility": 4.5,
  "risk": 3.0,
  "differentiation": 3.2,
  "monetization": 4.0
}
```

### agent_runs (логирование)

Каждый вызов агента логируется для отладки и мониторинга.

```sql
CREATE TABLE agent_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID NOT NULL REFERENCES research_cases(id),
  agent_type    TEXT NOT NULL,        -- 'researcher', 'critic', 'scorer'
  section_type  TEXT,                 -- null для scorer
  iteration     INT DEFAULT 1,
  status        TEXT NOT NULL,        -- 'started', 'completed', 'failed', 'retrying'
  llm_model     TEXT,                 -- 'claude-sonnet-4-20250514', 'gpt-4o', etc.
  input_tokens  INT,
  output_tokens INT,
  duration_ms   INT,
  error         TEXT,
  started_at    TIMESTAMPTZ DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX idx_runs_case ON agent_runs(case_id);
CREATE INDEX idx_runs_status ON agent_runs(status);
```

---

## Миграции

Порядок создания:
1. `001_create_projects.sql`
2. `002_create_research_cases.sql`
3. `003_create_research_sections.sql`
4. `004_create_critic_reviews.sql`
5. `005_create_scoring_results.sql`
6. `006_create_agent_runs.sql`

Инструмент миграций: Prisma (NestJS) или Supabase migrations.

---

## RLS (Row Level Security)

Для MVP — без RLS (single operator). При масштабировании:
- projects: по `owner_id`
- research_cases: через projects.owner_id
- Остальные: через research_cases → projects
