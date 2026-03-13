# Army of Agents MVP — Agent Specifications

3 агента для Phase 1 (ADR-003). Каждый агент = один воркер + набор промптов.

---

## Общие принципы

- Каждый агент получает задачу из BullMQ очереди
- Ответ LLM — строго structured JSON (не свободный текст)
- Агент сам пишет результат в DB (ADR-005)
- Промпт = system prompt + dynamic context (project info, section data, feedback)
- LLM provider: настраивается (Claude API / OpenRouter), не хардкодится

---

## 1. Researcher

**Очередь:** `research`

**Задача:** провести исследование одной секции для конкретного проекта.

### Input (из очереди)

```json
{
  "project_id": "uuid",
  "section_type": "market|competitor|signals|tech|risk",
  "iteration": 1,
  "feedback": null
}
```

При повторной итерации (после critic fail):
```json
{
  "project_id": "uuid",
  "section_type": "market",
  "iteration": 2,
  "feedback": "Недостаточно источников по TAM. Нужны конкретные цифры из отчётов."
}
```

### Output (в DB)

```json
{
  "project_id": "uuid",
  "section_type": "market",
  "iteration": 1,
  "content": {
    "summary": "string — краткое резюме секции (2-3 предложения)",
    "findings": [
      {
        "claim": "string — утверждение",
        "evidence": "string — доказательство/источник",
        "confidence": "high|medium|low",
        "source_url": "string|null"
      }
    ],
    "risks": ["string"],
    "opportunities": ["string"]
  },
  "sources_count": 5,
  "status": "completed"
}
```

### Промпт-стратегия

Один system prompt с переменными:

```
ROLE: You are a {section_type} research analyst.
PROJECT: {project_name} — {project_url}
SOURCE: {discovery_source}
TASK: Conduct {section_type} analysis.

{section_specific_instructions}

{feedback_block — если iteration > 1}

OUTPUT FORMAT: JSON schema (строго)
```

**Section-specific instructions** — отдельный блок для каждого типа:

| section_type | Фокус | Мин. источников |
|-------------|-------|-----------------|
| market | TAM/SAM/SOM, рост рынка, тренды, целевая аудитория | 3 |
| competitor | Прямые/косвенные конкуренты, их MRR, фичи, слабости | 3 конкурента |
| signals | Mentions в прессе, HN, Reddit, Twitter, Google Trends | 3 сигнала |
| tech | Стек, сложность реализации, time-to-market, open source альтернативы | — |
| risk | Юридические, технические, рыночные, операционные риски | — |

### Web Search

Researcher должен иметь доступ к web search для сбора актуальных данных. Варианты:
- Встроенный tool (если LLM поддерживает)
- Отдельный шаг: search → collect URLs → summarize
- Решение по реализации — при разработке

---

## 2. Critic

**Очередь:** `critic`

**Задача:** проверить качество research секций, оценить evidence, дать feedback.

### Input (из очереди)

```json
{
  "project_id": "uuid",
  "section_types": ["market", "competitor", "signals", "tech", "risk"]
}
```

### Процесс

1. Читает все секции из DB для данного project_id
2. Для каждой секции оценивает 3 критерия
3. Выносит verdict по каждой секции отдельно

### Output (в DB, для каждой секции)

```json
{
  "project_id": "uuid",
  "section_type": "market",
  "evidence_quality": 4,
  "logic_quality": 3,
  "completeness": 2,
  "verdict": "fail",
  "feedback": "Секция market: TAM указан без источника. Утверждение о росте 15% YoY не подкреплено данными. Нужны ссылки на отчёты (Gartner, Statista, CB Insights).",
  "iteration": 1
}
```

### Критерии оценки

| Критерий | 1 (плохо) | 3 (норма) | 5 (отлично) |
|----------|-----------|-----------|-------------|
| evidence_quality | Нет источников | 2-3 источника, частично проверяемые | 4+ проверяемых источника с URL |
| logic_quality | Противоречия, нет связи claim→evidence | Логично, но есть допущения | Чёткая цепочка рассуждений |
| completeness | Ключевые аспекты пропущены | Основное покрыто, детали отсутствуют | Всё покрыто, нет пробелов |

**Verdict logic:**
- Все три >= 3 → `pass`
- Любой < 3 → `fail` + feedback что улучшить
- После 3й итерации: любой результат → `pass_with_warning`

### Промпт

```
ROLE: You are a critical reviewer of startup research.
PROJECT: {project_name}

Review the following research sections. For each section, evaluate:
1. Evidence quality (1-5) — are claims backed by sources?
2. Logic quality (1-5) — are conclusions logically sound?
3. Completeness (1-5) — are key aspects covered?

Be strict. If evidence is weak, say specifically what's missing.

SECTIONS:
{sections_json}

OUTPUT FORMAT: JSON schema (строго)
```

---

## 3. Scorer

**Очередь:** `scorer`

**Задача:** посчитать score по 7 категориям, сформировать вердикт и рекомендацию.

### Input (из очереди)

```json
{
  "project_id": "uuid"
}
```

### Процесс

1. Читает все research секции из DB
2. Читает все critic reviews из DB
3. Считает score по 7 категориям
4. Формирует текстовую рекомендацию
5. Выносит вердикт

### Output (в DB)

```json
{
  "project_id": "uuid",
  "scores": {
    "market_need": 4.2,
    "competition": 3.5,
    "demand_signals": 3.8,
    "tech_feasibility": 4.5,
    "risk": 3.0,
    "differentiation": 3.2,
    "monetization": 4.0
  },
  "total_score": 3.74,
  "recommendation": "HOLD",
  "reasoning": "Сильный market need и tech feasibility, но слабая дифференциация от существующих конкурентов. Рекомендуется углубить исследование USP перед принятием решения.",
  "weak_sections": ["competitor"],
  "strong_sections": ["tech", "market"]
}
```

### Scoring weights

| Категория | Вес | Обоснование |
|-----------|-----|-------------|
| market_need | 0.20 | Нет рынка — нет бизнеса |
| competition | 0.15 | Можно ли конкурировать |
| demand_signals | 0.15 | Есть ли реальный спрос сейчас |
| tech_feasibility | 0.15 | Можем ли мы это построить |
| risk | 0.10 | Блокеры и угрозы |
| differentiation | 0.15 | Чем мы лучше |
| monetization | 0.10 | Как зарабатываем |

**total_score** = weighted sum

### Decision thresholds

| Score | Решение | Действие |
|-------|---------|----------|
| >= 4.0 | GO | Переход в Build stage |
| 3.0 — 3.9 | HOLD | Оператор решает: доисследовать или подождать |
| < 3.0 | REJECT | Архивировать, зафиксировать причину |

### Промпт

```
ROLE: You are a venture scoring analyst.
PROJECT: {project_name}

Based on the research and critic reviews below, score the project on 7 categories (1-5 each).
Be calibrated: 3 = average startup, 5 = exceptional, 1 = serious problems.

RESEARCH SECTIONS:
{sections_json}

CRITIC REVIEWS:
{reviews_json}

Provide:
- Score per category with brief justification
- Total weighted score
- GO/HOLD/REJECT recommendation
- 2-3 sentence reasoning

OUTPUT FORMAT: JSON schema (строго)
```

---

## Эволюция агентов (после MVP)

| Фаза | Изменение |
|------|-----------|
| Phase 1.1 | Разделить Researcher на специализированных (MarketResearcher, CompetitorResearcher) если качество недостаточно |
| Phase 1.2 | Добавить Interview Agent (сбор доп. контекста от оператора перед research) |
| Phase 2 | Build-агенты: BA, Architect, Developer |
| Phase 3 | GTM-агенты: Strategist, Content Creator |
