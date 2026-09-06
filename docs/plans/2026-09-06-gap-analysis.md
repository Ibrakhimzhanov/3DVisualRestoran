# Gap-анализ MenuLive: конкуренты, лучшие практики, локальный рынок

**Дата исследования:** 06 сентября 2026 (все поисковые запросы датированы этим днём).
**Метод:** три параллельных исследования через Exa: конкуренты AR-меню в мире, лучшие практики
цифровых меню и веб-AR, рынок Узбекистана и соседей. Только факты из источников, ссылки в конце.

## Главный вывод

Прямых аналогов MenuLive (видео блюда поверх бумажного меню в браузере, без приложения) почти нет.
Ближайшие: Kivicube (Китай, точки на бумажном меню) и PulseMeal (Ереван, маркер на бумаге -> 3D).
Мировой рынок ушёл либо в 3D через Apple Quick Look, либо в «видеоленту как TikTok» (Disho, Yoaan).
В Узбекистане ни один сервис QR-меню не предлагает ни AR, ни видео блюд: Foodee, RestoMenu,
QR-Menu.uz, SmartMenu, MilliyMenu продают обычное QR-меню за 100-500 тыс. сум в месяц.
Платформа 8th Wall закрылась 28.02.2026, поэтому независимый открытый стек (MindAR + A-Frame)
является плюсом при продаже, но MindAR не обновлялся с января 2024: версии фиксируем у себя.

## 1. Кто есть на рынке (сокращённо)

| Сервис | Что видит гость | Запуск | Бизнес-функции | Цена |
|---|---|---|---|---|
| QReal (ex-Kabaq), США | фотореалистичное 3D, у Denny's огонь и шипение | QR -> WebAR, линзы Snap/IG | скидки только внутри AR, переход к заказу | по запросу |
| Kivicube, Китай | точки на бумажном меню, тап оживляет блюдо видео/3D | QR -> WebAR | no-code редактор, GenAI картинок и видео | создание бесплатно |
| PulseMeal, Ереван | маркер на бумаге -> 3D и состав | QR -> браузер | AI-рекомендации (заявляют +22% к чеку), маскот | 18-39 тыс. AMD/мес |
| Reliefs, Франция | 3D 360, загрузка < 2 с | QR -> браузер | стоп-лист, меню по времени суток, мультиязык, дашборд | free, далее от 29 евро/мес |
| Disho, Испания | вертикальные видео блюд лентой | QR со столом -> браузер | оплата у стола, AI-видео за 2,20 евро, 12 языков | 40 евро/мес + 1,5% |
| Truebyte, Турция | 3D в реальном размере, ккал | App Clip / WebAR | аналитика «что дольше смотрят», лояльность | по запросу |
| MenuAR, США | 3D в браузере | QR -> браузер | white-label, запуск 7-10 дней | 129 $/мес + 120 $ за модель |
| ARmenu, Великобритания | 3D на столе | QR -> Quick Look | модель за 48 ч из 20 фото, первое блюдо бесплатно | 49 / 99 / 199 фунтов/мес |
| Jarit, Ереван | 3D над маркером | приложение | аналитика, white-label | 99-299 $/мес |
| Hustlar, Греция (авг. 2026) | 3D в размере 1:1 | QR -> браузер | автоменю из фото бумажного меню, 9 языков, голосовой поиск | подписка |
| Chinese Wok, Индия | CGI-шеф жонглирует воком | QR -> веб | ваучер за репост в Stories | акция |
| mARgic, Россия | 3D-копия блюда, сам QR служит маркером | QR -> WebAR | состав, наличие | демо 35 тыс. руб., от 300 тыс. руб. |
| YAEM (KZ, есть UZ-лендинг) | 3D из фото, AI-видео, 50+ языков | QR -> браузер | синхронизация с iiko | 10 / 35 / 60 $/мес |
| Foodee, Ташкент | обычное QR-меню с фото | QR -> браузер | заказ, оплата, интеграции r_keeper/Poster/iiko | 430 тыс. сум/мес |
| RestoMenu.uz, Ташкент | QR-меню + Telegram Mini App | QR/Telegram | UZ/RU/EN, аналитика | 500 тыс. сум/мес |

## 2. Таблица разрывов

| Область | Что у конкурентов | Есть ли у нас? | Приоритет | Краткая рекомендация под нашу архитектуру |
|---|---|---|---|---|
| Меню без камеры | Zarvo, iSPACE, Disho показывают фото/видео, если AR не сработал | Нет (сейчас без камеры пусто) | высокий | Кнопка «Меню без камеры» на приветствии и на экране отказа: тот же UI с видео блюд, но без AR (расширение режима preview) |
| Открытие из Telegram/Instagram | Встроенные браузеры часто не дают камеру; 8th Wall документирует это | Нет | высокий | Определять WebView по user agent и показывать кнопку «Открыть в Safari/Chrome»; в Узбекистане QR часто шлют в Telegram |
| iOS режим энергосбережения | Autoplay блокируется даже без звука, обхода нет | Нет | высокий | `play().catch` -> кнопка «Смотреть» на сцене |
| Языки и автоопределение | Hustlar 9, Disho 12, YAEM 50+ языков с автодетектом | RU/UZ вручную | высокий | Добавить EN третьим языком, язык по умолчанию из настроек телефона; аргумент продаж: узбекский в меню обязателен по закону |
| Значки и аллергены | Visuosofts 14 аллергенов с фильтром, Truebyte ккал, vrt.one БЖУ | Нет | высокий | Поля `tags` (острое, вег, халяль), `allergens`, `kcal` в конфиге; иконки в карточке, чипы-фильтры над вкладками |
| «Сочетается с» | Intermenu: мягкая рекомендация конвертирует в 2-3 раза лучше, чем «добавь за 4$» | Нет | высокий | Поле `pairs` у блюда, две подсказки в карточке, тап добавляет в список для официанта |
| Оффер только в AR | Denny's давал скидки, которых нет в бумажном меню; Zarvo флеш-карты по расписанию | Нет | средний | Поле `promo` у блюда или категории: бейдж «Только в AR: комплимент десерт» |
| Отзыв и вызов официанта после списка | Sunday: чаевые 20-22%, отзывов в 8-10 раз больше | Нет | средний | После «Показать официанту» кнопки «Оставить отзыв» (ссылка на Google/Yandex Карты из конфига) и «Позвать официанта» |
| Поделиться | Chinese Wok даёт ваучер за репост, ARmenu хвастается 50 000 просмотров TikTok | Нет | средний | Кнопка «Поделиться» через Web Share API (ссылка + постер блюда); запись экрана остаётся системной |
| Точки прямо на бумаге | Kivicube: тап по блюду на самом листе оживляет его | Нет (вкладки и чипы) | средний | Невидимые плоскости-хотспоты над строками меню в единицах таргета, тап через raycaster; делать после ядра, если тапы надёжны |
| Доступность | WCAG: уважать `prefers-reduced-motion`, цели от 44 px | Частично | средний | Отключать «парение» при reduced-motion, кнопки не меньше 44 px |
| Аналитика по блюдам | Truebyte, MenuQ, TastyTap: просмотры, удержание, воронка | Заглушка `track()` | высокий (этап 4) | Воронка scan -> camera_granted -> target_found -> dish_view -> list; недельный дайджест владельцу в Telegram; цель: до первого «вау» < 10 с, камера >= 70% |
| Кабинет владельца | Reliefs, Disho, Hustlar: цены, стоп-лист, меню по времени | Нет (правка JSON через git) | высокий (этап 4) | Простая админка: пароль, правка цен и стоп-листа, кнопка «Опубликовать» |
| Лояльность через Telegram | DELICIO: повторные визиты с 18% до 41% | Нет | средний (этап 4) | Кнопка «Бонус за подписку» на Telegram-бот ресторана в конце сессии |
| Заказ, оплата, касса | TastyTap (Stripe), SmartMenu (Click/Payme), Foodee (iiko/Poster/r_keeper) | Нет | средний (этап 5) | Продавать как «по запросу»; список для официанта закрывает 80% ценности без интеграций |
| Маскот или шеф-персонаж | PulseMeal, Chinese Wok CGI-шеф | Нет | низкий | Ошпаз у казана как AR-персонаж для местных заведений, только после основного продукта |
| Производство видео из фото | du-menu «3D motion», Disho AI-видео за 2,20 евро, Reliefs AI Studio | Нет | высокий (этап 2) | Image-to-video из фото блюда (Kling 3 ~0,03 $/с, Veo 3.1 Fast 0,10-0,12 $/с); клипы 4-6 с; ни одна модель не отдаёт альфу, поэтому фон снимаем отдельным шагом |

## 3. Топ-5 по влиянию

1. **Меню без камеры + открытие из Telegram + iOS энергосбережение.** Без этого часть гостей видит пустой экран, и продукт «не работает» на демо у владельца.
2. **«Сочетается с», значки, аллергены, калории.** Превращают карточку из красивой в продающую: это и есть рычаг среднего чека, который владелец покупает.
3. **Три языка с автоопределением и аргумент закона об узбекском языке.** В 2024 году у 75% из 700 проверенных заведений не было меню на узбекском; туристы: 11,7 млн в 2025, +22,6% за январь-июль 2026.
4. **Производство видео из фото нейросетью (этап 2).** Снимает главное узкое место: у ресторана нет видео, а съёмка за 3 000 $ считается неоправданной (кейс Sholi, Spot.uz).
5. **Аналитика и кабинет владельца (этап 4).** То, за что платят ежемесячно, а не разово. Пока в ролике показываем как «статистика для владельца», реализуем после ролика.

## 4. Что добавляем в спеку этапа 1 (дёшево и важно)

- Режим «Меню без камеры»: кнопка на приветствии и на экранах ошибок камеры.
- Определение встроенного браузера Telegram/Instagram и кнопка «Открыть в Safari/Chrome».
- Кнопка «Смотреть» на сцене, если autoplay заблокирован (iOS энергосбережение).
- Третий язык EN, язык по умолчанию из настроек телефона, ручной переключатель остаётся.
- Поля `tags`, `allergens`, `kcal`, `pairs`, `promo`, `reviewUrl` в конфиге; иконки, «Сочетается с», бейдж оффера, кнопка «Оставить отзыв».
- Кнопка «Поделиться» (Web Share API).
- `prefers-reduced-motion`, цели касания не меньше 44 px.
- Хотспоты на бумаге: отдельная задача в конце этапа 1, включается флагом конфига `hotspots`, если тапы окажутся надёжными на устройствах.

Откладываем: аналитика с сервером и дайджестом, кабинет владельца, лояльность, заказ и оплата, касса, маскот.

## 5. Локальный рынок и цены

Планка QR-меню в Узбекистане: 100-500 тыс. сум/мес (Choy.Menu 100 тыс., QR-Menu.uz 120-210 тыс.,
Foodee 430 тыс., RestoMenu 500 тыс.), модуль QR у iiko от 778 тыс. сум/мес. Мировые AR-меню:
49-299 $/мес плюс 80-120 $ за блюдо.

Рекомендуемая модель MenuLive (надстройка «вау + туристы», а не замена QR-меню):
- Разовая настройка 3-6 млн сум: 10-15 видео блюд, разметка бумажного меню, таргет, QR.
- Подписка по числу блюд: Start до 10 блюд около 600 тыс. сум/мес, Standard до 25 блюд около 1,2 млн,
  Premium до 50 блюд с EN и приоритетной поддержкой около 2 млн. Годовая оплата минус два месяца.
- Добавление или пересъёмка блюда 150-250 тыс. сум.
- Пилот 14 дней с 3-5 блюдами бесплатно (так делают DishReal и ARmenu).
- Апсейл: ежемесячные клипы для соцсетей ресторана.
Обоснование: при среднем чеке 200-280 тыс. сум и 100 чеках в день выручка около 600 млн сум/мес,
прирост 3% это 18 млн, подписка 1,2 млн окупается многократно.

Что важно владельцам (по статьям и интервью 2025-2026): цена и прозрачность, обновление без
типографии за минуты, соответствие закону об узбекском языке, интеграция с кассой, скорость загрузки
2-3 с, работа без приложения, часть гостей 55+ хочет бумагу (MenuLive работает поверх бумаги, это
снимает возражение). Продавать «решение и эстетику», а не технологию (урок LUNIQ). В Узбекистане
партнёры сначала хотят узнать вас как человека (Хенрик Винтер, Tigrus, retail.ru, 02.09.2026).

## 6. Честные цифры для ролика и переговоров

| Утверждение | Источник | Надёжность |
|---|---|---|
| Меню с фото блюд продаёт до +44% в месяц | DoorDash, 15 000 мерчантов, 2022 | средняя-высокая, но доставка |
| Видео-меню сильнее всего влияет на желание заказать | Lin et al., Journal of Hospitality and Tourism Technology, 2023, N=502 | высокая, измерено намерение |
| Движущееся блюдо заказывали на 39% чаще | Frontiers in Computer Science, 2021, полевой тест | высокая, одно блюдо и проекция |
| 71% ходили бы чаще при понятной информации об аллергенах | Nutritics Allergy Dining Report, июнь 2026 | средняя, опрос вендора |
| Чаевые 20-22%, отзывов в 8-10 раз больше при оплате с телефона | Sunday, 2026 | низкая-средняя, вендор |
| 11,7 млн иностранных туристов в 2025; +22,6% за январь-июль 2026 | stat.uz, Комитет по туризму | высокая |
| У 75% из 700 проверенных заведений не было меню на узбекском (2024) | Gazeta.uz, Комитет по конкуренции | высокая |

Не использовать без методики: «+20-35% к чеку от видео-меню» (Tamada, LoveBite), «+22% к чеку» (PulseMeal, собственные данные).

Что снимать в видео блюд (по исследованиям): подачу, а не готовку: полить соусом, разрезать, поднять
вилкой; крупный формат; 4-6 секунд; рядом с видео показывать калории, иначе динамика «утяжеляет» блюдо
в глазах гостя (Du & Wang, 2024).

## 7. Каналы продаж и события

- HoReCa Uzbekistan: 17-19 ноября 2026, Узэкспоцентр.
- ПИЩЁВКА3D Food Nomad Summit: 10-12 ноября 2026, Ташкент, сессия «Общепит и HoReCa».
- Meal&Drinks Choice Award (award.myday.uz): голосование октябрь-январь, список 300+ заведений как база лидов.
- UzFood 2027: заявки до 2 декабря 2026.
- Telegram: @horeca_clubuz, @rabotarestouz (141 тыс.), @myhorecauz, @HoReCa_Food_Service_Partners, @restodays, @restoran_topchat.
- Ассоциации: рестораторов Самарканда (2026), отельеров (hoteliers.uz), рестораторов Узбекистана (активность не подтверждена).
- Медиа: Spot.uz, Gazeta.uz, Afisha.uz, myday.uz, RestoBook.uz.

## 8. Технические предупреждения

- 8th Wall закрыт 28.02.2026, проекты живут до 28.02.2027; наш стек независим, это аргумент.
- MindAR без релизов с января 2024: фиксируем версии MindAR 1.2.5 и A-Frame 1.5.0, при необходимости форк.
- Запрос камеры только по тапу и с объяснением: доля разрешивших растёт в 2,5 раза (CHI 2024), оверлей-объяснение даёт +41% (CHI 2025).
- 53% уходят при загрузке дольше 3 с (AccessAR); первый кадр раньше 1 МБ трафика; тесты на iPhone 11/SE и Android среднего класса на медленном 4G.
- Печать меню матовая, без бликов, маркерные детали по всей площади; минимальный размер маркера 8x8 см.

## Источники

Конкуренты: https://www.qreal.io/qreal/about-us-qreal , https://arpost.co/2023/04/07/dennys-70th-anniversary-ar-food-menu/ , https://arinsider.co/2023/04/05/how-can-restaurants-use-ar/ , https://jarit.app/ , https://menuar.app/pricing , https://8thwall.org/docs/migration/faq , https://appeteyes.me/ , https://www.armenu.co.uk/ , https://thetruebyte.com/ , https://reliefsapp.com/en/pricing , https://tastytap.app/ , https://holofood.ai/ , https://nexinbe.com/ , https://softwareontheweb.com/product/hustlar , https://zarvo.ai/ , https://menuq.app/ , https://www.visuosofts.com/ar-menus , https://www.kivicube.com/post/how-to-create-an-ar-menu/ , https://pulsemealx.com/ , https://disho.net/ , https://www.yoaan.menu/ , https://du-menu.com/ai/ , https://margic.ru/ar-restaurants , https://augmentedreality.by/menu/ , https://www.indiaretailing.com/2025/03/24/chinese-wok-ar-dining-experience/ , https://i-space.gr/imodels/

Практики и UX: https://intermenu.io/en/blog/qr-menu-upsell , https://costorestaurante.com/EN/digital-menu-and-qr-that-sells-before-vs-after-with-masterestaurant-2026-2026.html , https://www.mdpi.com/2304-8158/13/6/928 , https://adde.food-regulations.org/allergy-dining-report/ , https://doi.org/10.1108/jhtt-07-2021-0217 , https://doi.org/10.1016/j.displa.2024.102671 , https://ideas.repec.org/a/eee/joreco/v81y2024ics0969698924003382.html , https://www.frontiersin.org/journals/computer-science/articles/10.3389/fcomp.2021.662824/full , https://merchants.doordash.com/en-us/blog/menu-photography , https://sundayapp.com/qr-code-payments-for-restaurants-real-roi/ , https://delicio.kz/kejs-restorany-almaty-35-vyruchki-delicio/ , https://qrkoder.ru/blog/qr-kod-dlya-restorana-menu , https://dl.acm.org/doi/full/10.1145/3613904.3642252 , https://group.cispa.io/bugiel/publication/elbitar-chi-25/elbitar-chi-25.pdf , https://accessar.co/tracking-webar-performance-analytics-metrics-that-actually-matter/ , https://plugwith.me/escape-in-app-browser/ , https://8thwall.org/docs/troubleshooting/browser-requirements , https://webkit.org/blog/6784/new-video-policies-for-ios/ , https://wojtek.im/journal/safari-autoplay-not-working-in-low-power-mode , https://developers.google.com/ar/design/interaction/ui , https://www.blippar.com/webar-performance-optimisation-the-complete-developer-guide/ , https://www.utsubo.com/blog/webar-brand-campaigns-guide , https://www.w3.org/TR/xaur/ , https://ai.google.dev/gemini-api/docs/pricing , https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation , https://alertforge.ai/ai-transparent-video , https://help.runwayml.com/hc/en-us/articles/19112532638995-Remove-Background , https://ffmpeg-cookbook.com/en/articles/chromakey-filter/ , https://orbitvu.com/blog/how-master-black-background-product-photography

Рынок Узбекистана: https://restomenu.uz/ru/pricing , https://qr-menu.uz , https://foodee.menu/ru , https://mmenu.uz , https://choyga.uz/menu , https://smartmenu.uz , https://vedavector.uz/czeny-test , https://joinposter.uz , https://jowi.club , https://online-menu.org/uz/qr-menu-uzbekistan , https://restero.ru/blog/onlajn-menyu-dlya-restorana-rossiya-2026 , https://foodonaut.ru/blog/qr-menyu-dlya-restorana-plyusy-minusy-vnedrenie , https://vc.ru/id962536/2714437 , https://www.gazeta.uz/ru/2024/10/21/public-catering/ , https://afisha.uz/ru/restaurants/2025/04/22/the-official-language , https://www.spot.uz/ru/2026/04/17/sholi-video/ , https://stat.uz/ru/press-tsentr/novosti-goskomstata/66310 , https://www.gazeta.uz/ru/2026/03/26/tourism/ , https://uz.kursiv.media/2025-09-04/turisty-samarkand-rashody-2025/ , https://expomap.ru/expo/horeca-uzbekistan/ , https://pischevka3d.ru/nomad , https://myday.uz/news/luchshie-restorani-uzbekistana-2024-vse-laureati-i-rezulytati , https://t.me/horeca_clubuz , https://t.me/rabotarestouz
