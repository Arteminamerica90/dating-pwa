# WalkDate server (demo)

Минимальный HTTP API без зависимостей (Node.js).

## Запуск

```bash
cd pwa-dating/server
PORT=8787 HOST=127.0.0.1 SECRET=dev-secret-change-me node server.js
```

## API

- `GET /api/health`
- `GET /api/events?city=Moscow`
- `POST /api/register` {"email","password"}
- `POST /api/login` {"email","password"}
- `GET /api/me` (Bearer token)
- `GET /api/sync` (Bearer token) -> { payload, updatedAt }
- `POST /api/sync` (Bearer token) { payload, updatedAt }
- `POST /api/public` (Bearer token) { profile }  (публичный профиль для карты)
- `POST /api/loc` (Bearer token) { loc }  (lat/lon/cityKey/ts)
- `GET /api/nearby?lat=..&lon=..&city=Moscow&radiusKm=2` (Bearer token)

Важно: это демо, данные хранятся в `pwa-dating/server/data/users.json`.
