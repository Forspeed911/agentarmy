# Army of Agents Platform

## System Specification

### Version
0.1 (MVP)

### Author
Andrey

### Purpose
Создать платформу, состоящую из набора AI-агентов, которая автоматизирует:
- поиск перспективных проектов
- исследование рынка
- принятие инвестиционного решения
- проектирование и разработку
- запуск и эксплуатацию продукта

---

# 1. System Overview

Платформа реализует AI Venture Studio, которая позволяет одному оператору анализировать проекты и запускать новые продукты.

Основной workflow делится на четыре программы работ:

1. Research - исследование идеи
2. Build - проектирование и разработка
3. Go-To-Market - маркетинг и запуск
4. Run - эксплуатация продукта

Решение принимает человек, агенты формируют аналитическую основу.

---

# 2. High-Level Workflow

Project Input → Interview Agent → Research Card → Research Agents → Critic Agents → Research Report → Human Decision

Possible decisions:
- GO → Build Stage
- HOLD
- RESEARCH MORE
- REJECT

---

# 3. System Architecture

Architecture layers:

1. UI Layer
2. Application Layer
3. Agent Runtime
4. Data Layer
5. External Integrations

---

# 4. Technology Stack

Frontend: Vercel
Backend API: Container Service
Agent Runtime: Container Workers
Database: Supabase (Postgres)
Vector Storage: pgvector
Task Management: Linear
Source Code: GitHub
CI/CD: GitHub Actions
Deployment: Containers

---

# 5. Research Process

Input:
- project name
- project link
- discovery source (TrustMRR)

Research tasks:

1. Competitor Analysis
2. Market Demand
3. Media Signals
4. Technology Feasibility
5. Risk Analysis
6. Improvement Opportunities
7. Business Case

Evidence requirements:

Market >= 3 sources
Competitors >= 3 competitors
Signals >= 3-4 recent signals
ROI -> hypothesis

---

# 6. Research Report Template

## Summary
## Market and Competitors
## Demand Signals
## Media Signals
## Technology Feasibility
## Risks
## Differentiation Opportunities
## Investment Hypothesis
## ROI Hypothesis
## Final Verdict
## Confidence Level
## Sources

---

# 7. Decision Model

Scoring categories:

- market_need
- competition
- demand_signals
- tech_feasibility
- risk
- differentiation
- monetization

Decision thresholds:

Score >= 4 -> GO
Score 3-3.9 -> HOLD / RESEARCH MORE
Score < 3 -> REJECT

---

# 8. Agent Roles

## Core Agents
Coordinator Agent - orchestration
Interview Agent - collect requirements
Knowledge Curator - maintain knowledge base

## Research Agents
Competitor Analyst
Market Analyst
Media Signals Analyst
Tech Feasibility Analyst
Risk Analyst
Innovation Analyst
Business Case Analyst

## Critic Agents
Competitor Critic
Market Critic
Media Critic
Tech Critic
Risk Critic
Business Critic
Investment Reviewer

## Build Agents
Business Analyst
Solution Architect
Technical Analyst
UX/UI Designer
Test Case Designer
Frontend Developer
Backend Developer
QA Engineer
DevOps Engineer

## Go-To-Market Agents
GTM Strategist
Content Creator
Marketing Planner

## Run Agents
Product Analytics
Support Agent
Reliability Monitoring

---

# 9. Database Schema (Supabase)

Main tables:

projects
research_cases
research_sections
evidence_items
agent_runs
build_projects
artifacts
test_assets
ops_metrics

---

# 10. Research States

draft
intake
queued
research_in_progress
critic_review
report_ready
decision_pending
go
hold
reject
research_more
archived

---

# 11. Build States

build_planning
analysis
design
development
qa
release_ready
deployed

---

# 12. Deployment Model

Vercel:
- frontend
- dashboard
- API gateway

Container runtime:
- orchestrator
- agent workers
- research tasks

---

# 13. Knowledge Storage Strategy

Operational Knowledge -> Supabase
Documentation Artifacts -> GitHub Docs
Task Knowledge -> Linear

Recommended repository structure:

/docs /architecture /research /build /gtm /run /prompts

---

# 14. MVP Scope

Phase 1 - Research system

Agents: Coordinator, Interview Agent, Knowledge Curator, Research Agents, Critic Agents, Investment Reviewer

Phase 2 - Build system
Phase 3 - Go-To-Market
Phase 4 - Run platform

---

# 15. Future Extensions

- automated idea sourcing
- venture scoring models
- automated product generation
- AI-driven marketing
- autonomous product operations
