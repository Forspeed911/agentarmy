# Army of Agents MVP — Workflow

Research pipeline от входа до вердикта. Отражает ADR-004 (обратные петли) и ADR-003 (3 агента).

---

## Общий flow

```
                    ┌─────────────┐
                    │  Оператор   │
                    │  создаёт    │
                    │  проект     │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   created   │
                    └──────┬──────┘
                           │ POST /projects/:id/research
                           ▼
                    ┌──────────────────┐
                    │ research_queued  │
                    └──────┬───────────┘
                           │ Dispatcher: fan-out 5 задач
                           ▼
              ┌────────────────────────────┐
              │   research_in_progress     │
              │                            │
              │  ┌─────┐ ┌─────┐ ┌─────┐  │
              │  │ MKT │ │ CMP │ │ SIG │  │  5 секций параллельно
              │  └──┬──┘ └──┬──┘ └──┬──┘  │
              │  ┌──┴──┐ ┌──┴──┐          │
              │  │TECH │ │RISK │          │
              │  └─────┘ └─────┘          │
              └────────────┬───────────────┘
                           │ все 5 done
                           ▼
                    ┌──────────────┐
                    │ critic_review│
                    └──────┬───────┘
                           │ Critic проверяет каждую секцию
                           ▼
                    ┌──────────────┐
                    │  pass/fail?  │
                    └──┬───────┬───┘
                       │       │
                  pass │       │ fail (iteration < 3)
                       │       │
                       │       ▼
                       │  ┌──────────────────┐
                       │  │ research_queued   │ ◄── только failed секции
                       │  │ (retry с feedback │     + feedback от Critic
                       │  │  от Critic)       │
                       │  └──────────────────┘
                       │
                       ▼
                ┌─────────────┐
                │   scoring   │
                └──────┬──────┘
                       │ Scorer считает 7 категорий
                       ▼
                ┌──────────────┐
                │ report_ready │
                └──────┬───────┘
                       │
                       ▼
              ┌──────────────────┐
              │ decision_pending │ ◄── оператор смотрит отчёт
              └──────┬───────────┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
       ┌─────┐  ┌──────┐  ┌────────┐
       │ GO  │  │ HOLD │  │ REJECT │
       └─────┘  └──────┘  └────────┘
```

---

## Детали этапов

### 1. Создание проекта

Оператор вводит:
- `name` — название стартапа
- `url` — ссылка на продукт
- `source` — откуда узнал (TrustMRR, ProductHunt, etc.)
- `notes` — свободный комментарий (опционально)

Pipeline Manager создаёт запись в DB со статусом `created`.

### 2. Запуск research

POST `/projects/:id/research` → Pipeline Manager переводит в `research_queued`.

Task Dispatcher создаёт 5 задач в BullMQ `research` queue:

| Секция | section_type | Что исследует |
|--------|-------------|---------------|
| Market Analysis | `market` | TAM/SAM, рост рынка, тренды |
| Competitor Analysis | `competitor` | Прямые/косвенные конкуренты, их MRR, преимущества |
| Media Signals | `signals` | Упоминания в прессе, HN, Reddit, Twitter, тренды |
| Tech Feasibility | `tech` | Стек, сложность, time-to-market |
| Risk Analysis | `risk` | Юридические, технические, рыночные риски |

Все 5 задач запускаются параллельно (fan-out).

### 3. Research (Researcher Worker)

Для каждой задачи:
1. Берёт из очереди `{project_id, section_type, iteration, feedback?}`
2. Загружает project info из DB
3. Вызывает LLM с section-specific промптом
4. Парсит structured JSON response
5. Upsert в `research_sections` (idempotent)
6. Публикует `research.section.done {project_id, section_type}`

Pipeline Manager слушает events. Когда все 5 секций `done` → переход в `critic_review`.

### 4. Critic Review (Critic Worker)

1. Берёт из очереди `{project_id}`
2. Читает все 5 секций из DB
3. Для каждой секции оценивает:
   - `evidence_quality` (1-5) — достаточно ли источников?
   - `logic_quality` (1-5) — логичны ли выводы?
   - `completeness` (1-5) — все ли аспекты покрыты?
   - `verdict`: pass / fail
   - `feedback`: текст — что доработать (при fail)
4. Пишет reviews в DB
5. Публикует `critic.section.reviewed {project_id, section_type, verdict}`

### 5. Обратная петля (ADR-004)

Pipeline Manager при получении `critic.section.reviewed`:

```
if verdict == "fail" AND iteration < 3:
    → создать задачу в research queue:
      {project_id, section_type, iteration: N+1, feedback: critic_feedback}
    → статус секции: research_queued

if verdict == "fail" AND iteration >= 3:
    → принять как есть, пометить weak_evidence
    → verdict = "pass_with_warning"

if все секции pass (или pass_with_warning):
    → переход в scoring
```

### 6. Scoring (Scorer Worker)

1. Берёт из очереди `{project_id}`
2. Читает все секции + critic reviews из DB
3. Считает score по 7 категориям (1-5):

| Категория | Источник данных |
|-----------|----------------|
| market_need | market section |
| competition | competitor section |
| demand_signals | signals section |
| tech_feasibility | tech section |
| risk | risk section |
| differentiation | competitor + market sections |
| monetization | market + competitor sections |

4. Считает `total_score` = weighted average
5. Формирует `recommendation`:
   - score >= 4.0 → GO
   - score 3.0-3.9 → HOLD
   - score < 3.0 → REJECT
6. Пишет в DB, публикует `scorer.done`

### 7. Decision

Pipeline Manager → `report_ready` → `decision_pending`.

Оператор видит в Dashboard:
- Все 5 секций research
- Critic reviews (pass/fail/warnings)
- Score по 7 категориям + total
- Рекомендация системы

Оператор принимает решение: GO / HOLD / REJECT.
Система фиксирует решение + комментарий оператора.

---

## Обработка ошибок

| Ситуация | Поведение |
|----------|-----------|
| LLM timeout | BullMQ retry (3 попытки, exponential backoff) |
| LLM вернул невалидный JSON | Retry с пометкой `parse_error` |
| 3 retry исчерпаны | Задача в dead letter queue, уведомление оператору |
| DB недоступна | Worker крашится, BullMQ вернёт задачу в очередь |
| Секция fail после 3 итераций critic | pass_with_warning, помечается `weak_evidence` |

---

## Временные ожидания (MVP)

| Этап | Ожидаемое время |
|------|-----------------|
| 5 секций research (параллельно) | 30-90 сек |
| Critic review | 20-40 сек |
| Обратная петля (1 итерация) | 30-60 сек |
| Scoring | 10-20 сек |
| Полный pipeline (без retry) | 1-3 мин |
| Полный pipeline (с 1 retry loop) | 2-5 мин |
