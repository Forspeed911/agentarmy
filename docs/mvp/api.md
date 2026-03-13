# Army of Agents MVP — API

REST API (NestJS). Без аутентификации в MVP (single operator).

---

## Base URL

```
http://localhost:3000/api/v1
```

---

## Endpoints

### Projects

#### POST /projects
Создать проект.

**Request:**
```json
{
  "name": "Acme SaaS",
  "url": "https://acme.com",
  "source": "trustmrr",
  "notes": "MRR $12k, растёт 15% m/m"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "name": "Acme SaaS",
  "url": "https://acme.com",
  "source": "trustmrr",
  "notes": "MRR $12k, растёт 15% m/m",
  "created_at": "2026-03-13T10:00:00Z"
}
```

#### GET /projects
Список проектов.

**Query params:** `?status=decision_pending&limit=20&offset=0`

**Response:** `200 OK`
```json
{
  "items": [...],
  "total": 42
}
```

#### GET /projects/:id
Детали проекта с последним research case.

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "name": "Acme SaaS",
  "url": "https://acme.com",
  "source": "trustmrr",
  "latest_case": {
    "id": "uuid",
    "status": "report_ready",
    "total_score": 3.74,
    "recommendation": "hold"
  }
}
```

---

### Research

#### POST /projects/:id/research
Запустить research. Создаёт research_case, ставит 5 задач в очередь.

**Request:** пустое тело (всё берётся из project)

**Response:** `202 Accepted`
```json
{
  "case_id": "uuid",
  "status": "research_queued",
  "sections": ["market", "competitor", "signals", "tech", "risk"]
}
```

#### GET /projects/:id/research/:case_id/status
Текущий статус research case + прогресс по секциям.

**Response:** `200 OK`
```json
{
  "case_id": "uuid",
  "status": "critic_review",
  "sections": {
    "market":     {"status": "completed", "iteration": 1, "critic": "pass"},
    "competitor": {"status": "completed", "iteration": 2, "critic": "pass_with_warning"},
    "signals":    {"status": "completed", "iteration": 1, "critic": "pass"},
    "tech":       {"status": "completed", "iteration": 1, "critic": "pass"},
    "risk":       {"status": "in_progress", "iteration": 2, "critic": null}
  },
  "progress": "4/5 sections reviewed"
}
```

#### GET /projects/:id/research/:case_id/report
Полный отчёт: секции + critic reviews + score.

**Response:** `200 OK`
```json
{
  "case_id": "uuid",
  "project": {
    "name": "Acme SaaS",
    "url": "https://acme.com"
  },
  "sections": [
    {
      "section_type": "market",
      "iteration": 1,
      "content": { "summary": "...", "findings": [...] },
      "critic": {
        "evidence_quality": 4,
        "logic_quality": 4,
        "completeness": 3,
        "verdict": "pass"
      }
    }
  ],
  "scoring": {
    "scores": { "market_need": 4.2, "...": "..." },
    "total_score": 3.74,
    "recommendation": "hold",
    "reasoning": "..."
  },
  "status": "decision_pending"
}
```

---

### Decisions

#### POST /projects/:id/research/:case_id/decision
Оператор принимает решение.

**Request:**
```json
{
  "decision": "go",
  "comment": "Сильный рынок, конкуренция управляемая. Стартуем с MVP."
}
```

**Response:** `200 OK`
```json
{
  "case_id": "uuid",
  "decision": "go",
  "decided_at": "2026-03-13T12:30:00Z"
}
```

---

### Monitoring

#### GET /health
Health check.

**Response:** `200 OK`
```json
{
  "status": "ok",
  "db": "connected",
  "redis": "connected",
  "queues": {
    "research": {"waiting": 2, "active": 1},
    "critic": {"waiting": 0, "active": 0},
    "scorer": {"waiting": 0, "active": 0}
  }
}
```

#### GET /agent-runs?case_id=uuid
Лог запусков агентов для отладки.

**Response:** `200 OK`
```json
{
  "items": [
    {
      "agent_type": "researcher",
      "section_type": "market",
      "iteration": 1,
      "status": "completed",
      "llm_model": "claude-sonnet-4-20250514",
      "duration_ms": 12340,
      "input_tokens": 1500,
      "output_tokens": 2800
    }
  ]
}
```

---

## Ошибки

Единый формат ошибок:

```json
{
  "error": "NOT_FOUND",
  "message": "Project not found",
  "details": {}
}
```

| HTTP | error | Когда |
|------|-------|-------|
| 400 | VALIDATION_ERROR | Невалидный input |
| 404 | NOT_FOUND | Проект/case не найден |
| 409 | CONFLICT | Research уже запущен для этого проекта |
| 500 | INTERNAL_ERROR | Неожиданная ошибка |

---

## WebSocket (опционально, Phase 1.1)

Для real-time обновлений статуса на Dashboard:

```
WS /ws/projects/:id/research/:case_id

Events:
← { "event": "section.done", "section_type": "market", "iteration": 1 }
← { "event": "critic.reviewed", "section_type": "market", "verdict": "pass" }
← { "event": "scoring.done", "total_score": 3.74 }
```

В MVP — polling через GET /status каждые 5 сек.
