# План реализации: MenuLive движок 2.0 (этап 1)

**Дизайн:** `2026-09-06-menulive-engine-v2-design.md`
**Gap-анализ:** `2026-09-06-gap-analysis.md` (все 10 пунктов приняты пользователем)
**Ветка:** `engine-v2`
**Дев-адрес:** https://armenu.shumtuber.uz/brest-v2.html (прод `brest.html` не трогаем до подтверждения)

## Порядок

1. Блок A: чистые модули `engine/core/*` и тесты (независимо).
2. Блок B: `engine/ar.js`, шейдер `ml-key`, `test/stage.html` (независимо).
3. Блок C: `engine/ui.js`, `engine/menulive.css` (независимо).
4. Блок D (я): `engine/player.js`, `engine/main.js`, `brest-v2.html`, `restaurants/brest.json`, nginx, деплой.

Блоки A, B, C пишутся параллельно по жёстким контрактам ниже. Блок D связывает их.

## Контракты модулей (обязательны к точному соблюдению)

### engine/core/emitter.js
```js
export class Emitter {
  on(event, fn)        // возвращает функцию отписки
  off(event, fn)
  emit(event, ...args)
}
```

### engine/core/config.js
```js
export const TAGS = ['hit','chef','spicy','veg','halal','new'];
export const ALLERGENS = ['gluten','egg','milk','nuts','fish','seafood','soy','sesame'];
export class ConfigError extends Error { constructor(message, path) } // this.path = 'categories[0].dishes[2].video'
export function validateConfig(raw)  // -> нормализованный конфиг или ConfigError
export function allDishes(config)    // -> плоский массив блюд, у каждого добавлено dish.categoryId
export function findDish(config, id) // -> блюдо или undefined
```
Значения по умолчанию: `theme {bg:'#111', accent:'#c8a050', accent2:'#e0c878', text:'#fff'}`,
`stage {x:0, y:0.35, w:1.1, key:'luma', luma:{threshold:0.10, smoothing:0.10},
chroma:{color:'#00ff00', similarity:0.4, smoothness:0.1, spill:0.1}, feather:0.08}`,
`tracking {filterMinCF:0.0001, filterBeta:0.5, missTolerance:5, warmupTolerance:0,
smoothFactor:0.02, posThreshold:0.005, rotThreshold:0.008}`, `languages:['ru']`,
`defaultLang: languages[0]`, `autoLang:true`, `currency:{}`, `waiter:{url:''}`, `reviewUrl:''`,
`hotspots:false`. Неизвестные `tags`/`allergens` отбрасываются с `console.warn`, не роняя конфиг.
Несуществующие id в `pairs` отбрасываются.

### engine/core/i18n.js
```js
export function pick(strings, lang, defaultLang) // строка или '' ; strings может быть строкой
export function dishCountLabel(n, lang)          // '2 блюда' | '2 ta taom' | '2 dishes'
export function t(key, lang, vars)               // словарь интерфейса, ключи см. ниже
```
Ключи словаря: `welcome.title`, `welcome.why`, `welcome.start`, `welcome.nocam`, `welcome.powered`,
`scan.aim`, `scan.tip`, `card.add`, `card.pairs`, `card.contains`, `card.kcal`, `order.show`,
`order.write`, `order.review`, `order.total`, `order.done`, `error.camera.title`, `error.camera.body`,
`error.camera.retry`, `error.webview.title`, `error.webview.safari`, `error.webview.chrome`,
`error.desktop.title`, `error.config.title`, `error.video`, `toast.added`, `toast.copied`,
`watch.button`, `share.button`, `nocam.title`, `filter.all`, а также `tag.*` и `allergen.*` по кодам.

### engine/core/format.js
```js
export function price(value, lang, currency) // 68000 -> '68 000 сум' / '68 000 so'm' / '68 000 UZS'
export function kcal(value, lang)            // 540 -> '540 ккал' / '540 kkal' / '540 kcal'
```
Разряды разделяются неразрывным пробелом U+00A0.

### engine/core/order.js
```js
export class Order extends Emitter {
  constructor(restaurantId, storage)  // storage по умолчанию globalThis.sessionStorage, может быть null
  add(dishId, qty = 1); inc(dishId); dec(dishId); remove(dishId); clear()
  qty(dishId); get count(); items()   // [{dishId, qty}] в порядке добавления
  total(dishes)                        // dishes: [{id, price}]
  toJSON(); static restore(restaurantId, storage)
}
```
Событие `change` после каждой мутации. Работа с хранилищем в try/catch: приватный режим не должен ронять страницу.

### engine/core/stage.js
```js
export function stageSize(stageCfg, aspect) // -> {w, h, x, y, z}; h = w/aspect, если stageCfg.h не задан; z = 0.01
```

### engine/core/env.js
```js
export function detectWebView(ua)     // null | 'telegram' | 'instagram' | 'facebook'
export function escapeUrl(href, ua)   // строка для «Открыть в Safari/Chrome» или null
export function pickLang(navLangs, languages, defaultLang, autoLang) // код языка
export function isLikelyDesktop(ua, width) // boolean
```

### engine/ar.js
```js
export function registerAll()                  // компоненты и шейдер, идемпотентно
export function createScene({config, mount})   // -> ARScene
// ARScene: .el .videoEl .start() .on(event, fn) .setStageSize({w,h,x,y,z})
//          .setKey(mode, params) .setLoading(bool) .setVisible(bool) .destroy()
// события: 'ready' | 'found' | 'lost' | 'error'
```

### engine/player.js
```js
export class Player extends Emitter {
  constructor(videoEl)
  load(dish); play(); pause(); setMuted(b); prefetch(urls)
}
// события: 'loading' | 'metadata'(aspect) | 'ready' | 'error' | 'blocked'
```

### engine/ui.js
```js
export class UI extends Emitter {
  constructor({root, config, lang})
  setLang(lang); setState(state, detail)   // 'welcome','starting','scanning','found','lost','nocam','error'
  renderCategories(activeId); renderDishes(categoryId, activeId, filter)
  renderCard(dish, qty); renderOrder(count, total)
  openOrderSheet(dishes); showWaiterScreen(dishes); toast(text)
  setSoundVisible(b); setMuted(b); setWatchVisible(b); noCamSlot()
}
// события: 'start','nocam','lang'(code),'dish'(id),'category'(id),'filter'(tag|null),
//          'add'(id),'inc'(id),'dec'(id),'sound','share','review','retry','escape','watch','reset'
```

## Задачи

### A1. Emitter, config, i18n, format, order, stage, env + тесты
Файлы: `engine/core/*.js`, `engine/package.json` (`{"type":"module"}`), `test/*.test.js`.
Готово, когда `node --test test/` зелёный и покрыты: валидация с путём ошибки, значения по умолчанию,
отбрасывание неизвестных тегов, выбор языка и запасной вариант, склонения счётчика на трёх языках,
формат цены и калорий, полный цикл заказа с сериализацией, расчёт сцены при разных пропорциях,
определение Telegram и Instagram, ссылка выхода из встроенного браузера.

### B1. AR-сцена и шейдер
Файлы: `engine/ar.js`, `test/stage.html`.
Шейдер `ml-key` с режимами none/luma/chroma и растушёвкой краёв. Компоненты `smooth-track` и `pinch-zoom`
переносятся из `index.html` без изменения поведения, параметры из `config.tracking`. Двойной тап сбрасывает масштаб.
Кольцо-лоадер. `test/stage.html` показывает плоскость с ключом поверх фото меню и ползунки порога.

### C1. Интерфейс и стили
Файлы: `engine/ui.js`, `engine/menulive.css`.
Все экраны из раздела 6 дизайна: приветствие с объяснением камеры и ссылкой «без камеры», подсказка
сканирования с миниатюрой и вторым советом через 8 секунд, вкладки категорий, чипы-фильтры, лента блюд,
карточка со значками, калориями, аллергенами, блоком «Сочетается с», бейджем промо и степпером,
плашка списка, лист заказа, экран для официанта, кнопки языка, звука, «Поделиться», «Смотреть»,
экраны ошибок (камера, встроенный браузер, десктоп, конфиг), тосты. Цели касания от 44 px,
`prefers-reduced-motion` отключает анимации. Только CSS-переменные темы, никаких жёстких цветов бренда.

### D1. Плеер, сборка, конфиг Brest, дев-деплой
Файлы: `engine/player.js`, `engine/main.js`, `brest-v2.html`, `restaurants/brest.json`,
`deploy/nginx-armenu.conf`, `.gitignore`.
Временный конфиг Brest на существующих видео и `targets-brest.mind`, чтобы дев-страница работала
до этапа 2. Локальная проверка через статический сервер и встроенный браузер, затем push и `git pull` на сервере.

### D2. Проверка на дев-адресе
Открыть https://armenu.shumtuber.uz/brest-v2.html, снять скриншоты приветствия, режима без камеры
и экрана заказа, убедиться в отсутствии ошибок в консоли. Передать пользователю чек-лист для телефона.

## Критерии готовности этапа

- `node --test test/` зелёный.
- Дев-страница открывается, приветствие и режим без камеры работают в десктопном браузере.
- Прод-страницы MU, Balzac, Afra, Bravo, Brest не изменились.
- Все 10 пунктов gap-анализа присутствуют в коде либо отмечены как отложенные в отчёте пользователю.
