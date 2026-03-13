# Army of Agents — MVP Documentation

Документация для Phase 1 (Research System). Отражает принятые архитектурные решения (см. ../decisions.md).

## Документы

| Файл | Описание | Статус |
|------|----------|--------|
| architecture.md | Архитектура MVP (сервисы, очереди, DB) | TODO |
| workflow.md | Pipeline с обратными петлями | TODO |
| agents.md | 3 агента: Researcher, Critic, Scorer | TODO |
| data-model.md | Схема DB для research pipeline | TODO |
| api.md | API endpoints | TODO |

## Принципы MVP

1. **3 агента**, не 30 — Researcher, Critic, Scorer
2. **Асинхронные очереди** (BullMQ + Redis), не синхронные вызовы
3. **Воркеры пишут в DB напрямую**, оркестратор управляет состояниями
4. **Обратные петли** — Critic может вернуть секцию на доработку (макс 3 итерации)
5. **Pipeline Manager** отдельно от Dispatcher отдельно от Evaluator
