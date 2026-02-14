# AR Меню — Инструкция по запуску

## Структура папки на сервере

```
ar-menu/
├── index.html          ← главный файл (уже готов)
├── targets.mind        ← ТЫ создаёшь (шаг 1)
└── models/
    ├── dish-0.glb      ← ТЫ сканируешь в Polycam (шаг 2)
    ├── dish-1.glb      ← второе блюдо
    └── dish-2.glb      ← третье блюдо
```

## Шаг 1: Сделай маркер (.mind файл)

1. Сфоткай страницу меню ресторана на iPhone
2. Открой в браузере: https://hiukim.github.io/mind-ar-js-doc/tools/compile/
3. Нажми "Upload Images" → выбери фото страницы меню
   - Можно загрузить несколько фото (каждая страница = отдельный маркер)
4. Нажми "Start" → подожди компиляцию
5. Скачай файл targets.mind
6. Положи его в папку ar-menu/ рядом с index.html

## Шаг 2: Сканируй блюда в Polycam

1. Открой Polycam на iPhone 16 Pro
2. Выбери Object Capture (LiDAR)
3. Обойди блюдо по кругу 1-2 минуты
4. Дождись обработки
5. Нажми Export → GLB
6. Переименуй файл: dish-0.glb (первое блюдо), dish-1.glb и т.д.
7. Положи в папку ar-menu/models/

## Шаг 3: Залей на сервер

```bash
# Подключись к своему серверу
ssh root@твой-сервер

# Создай папку
mkdir -p /var/www/ar-menu/models

# С компа залей файлы (из другого терминала)
scp -r ar-menu/* root@твой-сервер:/var/www/ar-menu/
```

## Шаг 4: Настрой nginx (если ещё нет)

Добавь в nginx конфиг:

```nginx
server {
    listen 443 ssl;
    server_name ar.твойдомен.com;

    # SSL обязателен! Камера не работает без HTTPS
    ssl_certificate /etc/letsencrypt/live/ar.твойдомен.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ar.твойдомен.com/privkey.pem;

    root /var/www/ar-menu;
    index index.html;

    # Важно для GLB файлов
    location ~* \.glb$ {
        add_header Content-Type application/octet-stream;
        add_header Access-Control-Allow-Origin *;
    }

    location ~* \.mind$ {
        add_header Content-Type application/octet-stream;
        add_header Access-Control-Allow-Origin *;
    }
}
```

```bash
# Получи SSL (ОБЯЗАТЕЛЬНО — без HTTPS камера не включится)
certbot --nginx -d ar.твойдомен.com

# Перезапусти nginx
nginx -t && systemctl reload nginx
```

## Шаг 5: Сделай QR код

Открой https://qr-code-generator.com
Вставь: https://ar.твойдомен.com
Скачай QR → напечатай → положи на стол

## Проверка

1. Открой https://ar.твойдомен.com на телефоне
2. Разреши камеру
3. Наведи на напечатанную/открытую на экране страницу меню
4. 3D блюдо должно появиться на меню!

## Добавление новых блюд

1. Сканируй новое блюдо → dish-1.glb
2. В index.html раскомментируй блоки для dish-1
3. Перекомпилируй targets.mind если добавляешь новые страницы меню
4. Залей на сервер

## Частые проблемы

| Проблема | Решение |
|----------|---------|
| Камера не включается | Нужен HTTPS! Без SSL не работает |
| Модель не появляется | Проверь путь к .glb файлу в браузере |
| Плохой трекинг | Фото маркера должно быть контрастным, с деталями |
| Модель слишком большая/маленькая | Измени scale в index.html |
| Модель повёрнута | Измени rotation в index.html |
