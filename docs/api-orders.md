# MenuLive Orders API v1

Контракт между гостевым меню (браузер по QR), приложением официанта (Android WebView)
и сервером заказов. Этот файл - единственный источник правды. Любая часть, которая
расходится с ним, считается сломанной.

## Общее

- База: `https://armenu.shumtuber.uz/api/v1`
- Поток событий: `https://armenu.shumtuber.uz/api/v1/stream` (Server-Sent Events)
- Всё в UTF-8 JSON. Времена в RFC 3339 UTC: `2026-09-17T14:41:09Z`.
- Деньги: целое число в сумах, без копеек. `265000`.
- Идентификаторы заказов: `ord_<26 симв. base32>`. Человеческий номер: `А-1204`.

## Роли и доступ

| Роль | Как авторизуется | Что может |
|------|------------------|-----------|
| Гость | ничего, но обязан передать `restaurant` и `table` | создать заказ, читать только свой заказ по его id, создать вызов |
| Официант | заголовок `X-Staff-Token: <token>` | читать все заказы ресторана, менять статусы, закрывать вызовы |

Токен персонала лежит в `server/data/staff.json` на сервере и в настройках приложения.
В репозиторий токен не коммитится. В коде только `process.env.MENULIVE_STAFF_TOKEN`.

## Статусы заказа

```
new -> accepted -> kitchen -> served -> paid
                \-> cancelled
```

- `new` ставит гость отправкой заказа
- `accepted`, `kitchen`, `served`, `paid`, `cancelled` ставит официант
- Переход только вперёд по цепочке или в `cancelled`. Откат на один шаг разрешён
  (официант ошибся), прыжки через шаг запрещены, ответ `409`.

## Методы

### POST /orders

Создаёт заказ. Гостевой метод.

```json
{
  "restaurant": "brest",
  "table": "12",
  "clientOrderId": "c_9f2a1b7e4d",
  "lang": "ru",
  "comment": "Приборы отдельно",
  "items": [
    { "dishId": "plato", "qty": 1, "note": "соус чили отдельно" },
    { "dishId": "kebab", "qty": 1, "note": "средняя прожарка" }
  ]
}
```

- `clientOrderId` обязателен и генерируется на телефоне гостя. Повторный POST с тем же
  `clientOrderId` в течение суток возвращает тот же заказ и код `200` вместо `201`.
  Это защита от дублей при плохой связи.
- Цены сервер берёт сам из `restaurants/<id>.json`, клиент их не присылает.
  Клиентским ценам доверять нельзя.
- Пустой `items` или неизвестный `dishId` - `400`.

Ответ `201`:

```json
{
  "id": "ord_01JB2C3D4E5F6G7H8J9K0M1N2P",
  "number": "А-1204",
  "restaurant": "brest",
  "table": "12",
  "status": "new",
  "createdAt": "2026-09-17T14:41:09Z",
  "subtotal": 413000,
  "service": 41300,
  "total": 454300,
  "items": [
    { "dishId": "plato", "name": "Мясное плато Brest", "qty": 1, "price": 265000, "note": "соус чили отдельно" }
  ]
}
```

### GET /orders/:id

Гостевой. Возвращает тот же объект плюс `waiter` и `timeline`.

```json
{
  "waiter": { "name": "Азиз Каримов", "initials": "АК" },
  "timeline": [
    { "status": "new", "at": "2026-09-17T14:41:09Z" },
    { "status": "accepted", "at": "2026-09-17T14:42:31Z", "by": "aziz" }
  ]
}
```

### GET /orders?restaurant=brest&status=new,accepted&limit=50

Метод персонала, нужен `X-Staff-Token`. Свежие сверху.

```json
{ "orders": [ ... ] }
```

### POST /orders/:id/status

Метод персонала.

```json
{ "status": "accepted", "by": "aziz" }
```

Ответ `200` с полным заказом. Неверный переход - `409` и текущий статус в теле.

### POST /calls

Гостевой. Вызов официанта или просьба счёта.

```json
{ "restaurant": "brest", "table": "12", "kind": "waiter", "orderId": "ord_..." }
```

`kind`: `waiter` или `bill`. `orderId` необязателен.
Повторный вызов с того же стола, пока предыдущий не закрыт, возвращает тот же вызов.

Ответ `201`: `{ "id": "call_...", "kind": "waiter", "table": "12", "createdAt": "...", "ackAt": null }`

### POST /calls/:id/ack

Метод персонала. Закрывает вызов. `{ "by": "aziz" }`

### GET /health

`{ "ok": true, "version": "1.0.0", "uptime": 12345 }`

## Поток событий SSE

`GET /stream?restaurant=brest&role=waiter` с заголовком `X-Staff-Token`
`GET /stream?restaurant=brest&role=guest&orderId=ord_...` без токена

Сервер шлёт именованные события. Клиент использует `EventSource`, переподключение
браузерное. Каждое событие несёт `id:`, чтобы после обрыва клиент прислал
`Last-Event-ID` и добрал пропущенное.

```
event: order.created
id: 42
data: {"order": { ... полный объект заказа ... }}

event: order.status
id: 43
data: {"orderId":"ord_...","status":"accepted","at":"...","by":"aziz"}

event: call.created
id: 44
data: {"call": { ... }}

event: call.ack
id: 45
data: {"callId":"call_...","by":"aziz"}

event: ping
data: {}
```

- `ping` каждые 25 секунд, чтобы nginx и мобильные сети не рвали соединение.
- Гостю приходят только события его заказа и его стола.
- Официанту приходит всё по ресторану.

## Коды ошибок

Тело всегда `{ "error": { "code": "...", "message": "..." } }`.

| Код | HTTP | Когда |
|-----|------|-------|
| `bad_request` | 400 | не прошла валидация |
| `unauthorized` | 401 | нет или неверный `X-Staff-Token` |
| `not_found` | 404 | нет такого заказа, вызова или ресторана |
| `conflict` | 409 | недопустимый переход статуса |
| `rate_limited` | 429 | больше 20 заказов со стола за час |
| `server_error` | 500 | всё остальное |

## Что клиент обязан делать

- Гость: хранить `clientOrderId` и `orderId` в `sessionStorage`, чтобы перезагрузка
  страницы не создавала второй заказ и возвращала на экран статуса.
- Официант: при старте `GET /orders`, затем слушать SSE. При обрыве переподключиться
  и снова сделать `GET /orders`, а не надеяться на добор по `Last-Event-ID`.
- Никто не доверяет ценам с другой стороны. Считает сервер.
