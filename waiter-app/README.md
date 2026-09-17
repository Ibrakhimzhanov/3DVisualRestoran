# Приложение официанта MenuLive

Android-оболочка вокруг веб-интерфейса. Интерфейс лежит в `www/` и упаковывается
внутрь APK, поэтому он открывается мгновенно и не зависит от сети. По сети идут
только данные заказов: REST и поток событий SSE, контракт в `docs/api-orders.md`.

```
waiter-app/
  www/                 интерфейс официанта (html, css, js, шрифты)
  android/             проект Android
    app/src/main/java/uz/shumtuber/menulive/waiter/
      MainActivity.java   оболочка WebView
      NativeBridge.java   звук, вибрация, уведомления для веб-части
      ShiftService.java   служба смены, держит процесс живым
  mock/                мок-сервер для проверки без боевого API
```

## Что нужно на компьютере

- JDK 17
- Android SDK: `platform-tools`, `platforms;android-34`, `build-tools;34.0.0`
- Gradle 8.9

На этой машине всё лежит так:

```
F:\dev\jdk17
F:\dev\android-sdk
F:\dev\gradle\gradle-8.9
```

Переменные `JAVA_HOME` и `ANDROID_HOME` уже указывают туда.
Путь к SDK для сборки прописан в `android/local.properties` (в git не попадает).

## Собрать APK

```bash
cd waiter-app/android
JAVA_HOME=F:/dev/jdk17 /f/dev/gradle/gradle-8.9/bin/gradle assembleDebug
```

Готовый файл: `waiter-app/android/app/build/outputs/apk/debug/app-debug.apk`

Отладочная сборка подписана отладочным ключом. Её можно ставить на любой телефон
через «установку из неизвестных источников», в Play Market она не пойдёт.

## Поставить на телефон

Кабелем:

```bash
F:/dev/android-sdk/platform-tools/adb.exe install -r app/build/outputs/apk/debug/app-debug.apk
```

Без кабеля: скиньте apk в Telegram самому себе, откройте на телефоне, разрешите
установку из этого источника.

## Релизная сборка и подпись

Для Play Market нужен свой ключ. Сгенерируйте его один раз:

```bash
F:/dev/jdk17/bin/keytool -genkeypair -v \
  -keystore menulive-release.jks -alias menulive \
  -keyalg RSA -keysize 2048 -validity 10000
```

Пароль придумайте сами и запишите в надёжное место: потерянный ключ означает, что
обновить приложение в Play Market больше нельзя, только публиковать заново под другим
именем пакета.

Дальше создайте `waiter-app/android/keystore.properties`:

```
storeFile=../menulive-release.jks
storePassword=ваш пароль
keyAlias=menulive
keyPassword=ваш пароль
```

Файл в git не коммитится, он уже в `.gitignore`. После этого:

```bash
gradle assembleRelease
```

## Настройка приложения

При первом запуске приложение спрашивает адрес сервера и токен персонала.
Они сохраняются в памяти приложения.

- Адрес: `https://armenu.shumtuber.uz/api/v1`
- Токен: значение `MENULIVE_STAFF_TOKEN` с сервера, см. `server/README.md`

## Что умеет оболочка

- `window.MenuLiveNative.notifyNewOrder(title, text)` - вибрация, звук, уведомление
- `window.MenuLiveNative.tap()` - короткая вибрация на нажатие
- `window.MenuLiveNative.platform()` - строка `android`, по ней веб-часть понимает,
  что она внутри приложения, а не в браузере

Экран не гаснет, пока приложение открыто. Служба смены не даёт системе выгрузить
процесс, поэтому соединение с сервером живёт и когда приложение свёрнуто.

## Чего пока нет

Уведомления при полностью закрытом приложении. Для этого нужен Firebase Cloud
Messaging, а он требует проект в Google-аккаунте ресторана и файл
`google-services.json`. Аккаунт создаёте вы, дальше подключение делается за час.

Пока приложение не закрыто полностью, всё работает: заказ приходит со звуком,
вибрацией и уведомлением в шторке.
