-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "source" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_cases" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "decision" TEXT,
    "decision_comment" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_sections" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "section_type" TEXT NOT NULL,
    "iteration" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "sources_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "critic_reviews" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "section_type" TEXT NOT NULL,
    "iteration" INTEGER NOT NULL DEFAULT 1,
    "evidence_quality" INTEGER NOT NULL,
    "logic_quality" INTEGER NOT NULL,
    "completeness" INTEGER NOT NULL,
    "verdict" TEXT NOT NULL,
    "feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "critic_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_results" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "scores" JSONB NOT NULL,
    "total_score" DECIMAL(3,2) NOT NULL,
    "recommendation" TEXT NOT NULL,
    "reasoning" TEXT,
    "weak_sections" TEXT[],
    "strong_sections" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "agent_type" TEXT NOT NULL,
    "section_type" TEXT,
    "iteration" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "llm_model" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "duration_ms" INTEGER,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_cases_project_id_idx" ON "research_cases"("project_id");

-- CreateIndex
CREATE INDEX "research_cases_status_idx" ON "research_cases"("status");

-- CreateIndex
CREATE INDEX "research_sections_case_id_idx" ON "research_sections"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "research_sections_case_id_section_type_key" ON "research_sections"("case_id", "section_type");

-- CreateIndex
CREATE INDEX "critic_reviews_case_id_idx" ON "critic_reviews"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "critic_reviews_case_id_section_type_iteration_key" ON "critic_reviews"("case_id", "section_type", "iteration");

-- CreateIndex
CREATE UNIQUE INDEX "scoring_results_case_id_key" ON "scoring_results"("case_id");

-- CreateIndex
CREATE INDEX "agent_runs_case_id_idx" ON "agent_runs"("case_id");

-- CreateIndex
CREATE INDEX "agent_runs_status_idx" ON "agent_runs"("status");

-- AddForeignKey
ALTER TABLE "research_cases" ADD CONSTRAINT "research_cases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_sections" ADD CONSTRAINT "research_sections_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "research_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "critic_reviews" ADD CONSTRAINT "critic_reviews_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "research_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_results" ADD CONSTRAINT "scoring_results_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "research_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "research_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

