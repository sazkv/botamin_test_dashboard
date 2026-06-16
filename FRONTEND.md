# Frontend

React/Vite frontend dashboard для аналитика Botamin: KPI, интерактивная воронка, очередь ручной проверки, таблица звонков и карточка звонка.

## Запуск

```bash
npm install
npm run dev
```

По умолчанию frontend ходит в `/api`. Для отдельного backend URL создайте `.env` по примеру `.env.example`:

```bash
VITE_API_BASE_URL=http://localhost:8000/api
```

Если API недоступен, frontend использует статический fallback `calls.json`, который генерируется из `calls_week_anon.xlsx` командой `npm run prepare:data`.

Production build:

```bash
npm run build
```

## API Endpoints

- `GET /api/calls` - список звонков. Можно принимать query-параметры фильтров, но frontend также фильтрует данные на клиенте.
- `GET /api/calls/:id` - детальная карточка звонка. Если endpoint вернёт `404`, используется запись из списка.
- `PATCH /api/calls/:id/analyst-review` - сохранение ручной проверки аналитика.

Payload для `PATCH /api/calls/:id/analyst-review`:

```json
{
  "qualification_is_correct": true,
  "manual_qualification": "Горячий",
  "manual_funnel_stage": "Встреча назначена",
  "manual_failure_stage": "",
  "manual_failure_reason": "",
  "analyst_comment": "Комментарий аналитика"
}
```

## Важные правила отображения

- `company` показывается пустым, если данных нет.
- В таблице показывается `normalized_status`.
- `technical_status` показывается только внутри карточки звонка.
- Transcript показывается репликами `user`/`bot`, если их можно распарсить; иначе plain text.
