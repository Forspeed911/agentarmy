# Army of Agents MVP — Architecture

Phase 1: Research System. Основано на решениях ADR-001..005 (см. ../decisions.md).

---

## Обзор

Система принимает стартап на вход, проводит автоматический research по 5 секциям, критически оценивает результат, считает score и формирует вердикт (GO / HOLD / REJECT).

---

## Компоненты

```
┌─────────────────────────────────────────────────────┐
│                     API Gateway                      │
│              (NestJS, REST endpoints)                │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
           ▼                          ▼
┌─────────────────────┐   ┌─────────────────────────┐
│   Pipeline Manager  │   │      Dashboard UI        │
│                     │   │     (React + Tailwind)    │
│ - создаёт case      │   │                           │
│ - управляет states  │   │ - список проектов         │
│ - слушает events    │   │ - статус research         │
│ - переходы FSM      │   │ - отчёт + score           │
└──────────┬──────────┘   └─────────────────────────┘
           │
           ▼
┌─────────────────────┐
│   Task Dispatcher   │
│                     │
│ - fan-out задач     │
│ - кладёт в очередь  │
│ - трекает прогресс  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐       ┌──────────────┐
│    BullMQ + Redis   │◄─────►│   Workers    │
│                     │       │              │
│ - research queue    │       │ - Researcher │
│ - critic queue      │       │ - Critic     │
│ - scorer queue      │       │ - Scorer     │
└─────────────────────┘       └──────┬───────┘
                                     │
                                     ▼ (напрямую)
                              ┌──────────────┐
                              │  PostgreSQL   │
                              │  (Supabase)   │
                              │              │
                              │ - projects    │
                              │ - cases       │
                              │ - sections    │
                              │ - evidence    │
                              │ - scores      │
                              └──────────────┘
```

---

## Описание компонентов

### API Gateway (NestJS)

REST API для внешнего мира. Принимает запросы от UI и внешних клиентов.

Ответственность:
- POST /projects — создать проект
- POST /projects/:id/research — запустить research
- GET /projects/:id/report — получить отчёт
- GET /projects/:id/status — статус pipeline
- Авторизация (позже, в MVP — без auth)

### Pipeline Manager

Стейт-машина research case. Управляет переходами между состояниями.

Состояния FSM:
```
created → research_queued → research_in_progress → critic_review
    → [pass] → scoring → report_ready → decision_pending → go/hold/reject
    → [fail] → research_queued (обратная петля, макс 3 итерации)
```

Слушает события от воркеров через Redis pub/sub:
- `research.section.done` — секция исследована
- `critic.section.reviewed` — секция проверена (pass/fail)
- `scorer.done` — score посчитан

НЕ работает с данными — только со статусами и переходами.

### Task Dispatcher

Раскладывает работу по очередям.

При запуске research создаёт 5 параллельных задач (fan-out):
- market_analysis
- competitor_analysis
- media_signals
- tech_feasibility
- risk_analysis

Каждая задача — сообщение в BullMQ `research` queue.
После завершения всех 5 секций — ставит задачу в `critic` queue.
После прохождения critic — ставит задачу в `scorer` queue.

### Workers (3 типа)

Каждый воркер — отдельный процесс, слушает свою очередь.

**Researcher Worker:**
- Берёт задачу из `research` queue
- Получает section_type + project info
- Вызывает LLM с промптом для конкретной секции
- Парсит structured output
- Пишет результат в DB (таблица `research_sections`)
- Публикует event `research.section.done`

**Critic Worker:**
- Берёт задачу из `critic` queue
- Читает секции из DB
- Оценивает quality + evidence для каждой секции
- Пишет review в DB
- Публикует `critic.section.reviewed` с pass/fail
- При fail — Pipeline Manager вернёт секцию на доработку

**Scorer Worker:**
- Берёт задачу из `scorer` queue
- Читает все секции + critic reviews из DB
- Считает score по 7 категориям
- Формирует итоговый вердикт
- Пишет в DB
- Публикует `scorer.done`

### PostgreSQL (Supabase)

Единственный источник правды. Воркеры пишут напрямую.
Схема — см. data-model.md.

### Redis

Две роли:
- BullMQ backend — очереди задач с retry, backoff, dead letter queue
- Pub/Sub — события между компонентами

### Dashboard UI (React)

Минимальный UI для MVP:
- Список проектов с текущим статусом
- Форма создания проекта (name + URL + source)
- Страница research: прогресс по секциям, статус critic
- Отчёт: секции + score + вердикт

---

## Деплой (MVP)

Для MVP — Docker Compose на одной машине:

```yaml
services:
  api:        # NestJS API + Pipeline Manager + Dispatcher
  worker:     # 3 воркера в одном процессе (разные очереди)
  redis:      # BullMQ + pub/sub
  db:         # PostgreSQL (или Supabase cloud)
  ui:         # React dev server (или собранный билд через api)
```

Pipeline Manager и Task Dispatcher живут в одном процессе с API на этапе MVP.
Разделение на отдельные сервисы — при масштабировании.

---

## Ключевые принципы

1. **Данные идут мимо оркестратора** — воркеры пишут в DB, оркестратор управляет состояниями
2. **Очереди, не HTTP** — между dispatcher и workers только BullMQ
3. **Idempotent workers** — повторный запуск задачи безопасен (upsert в DB)
4. **Structured output** — LLM возвращает JSON по схеме, не свободный текст
5. **Fail-safe loops** — обратная петля critic→research ограничена 3 итерациями
