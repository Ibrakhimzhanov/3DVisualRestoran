#!/usr/bin/env bash
# Сборка APK приложения официанта.
# Запуск из корня репозитория:  bash waiter-app/build.sh [debug|release]
set -euo pipefail

VARIANT="${1:-debug}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$HERE/android"

export JAVA_HOME="${JAVA_HOME:-F:/dev/jdk17}"
export ANDROID_HOME="${ANDROID_HOME:-F:/dev/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
GRADLE="${GRADLE:-/f/dev/gradle/gradle-8.9/bin/gradle}"

if [ ! -x "$JAVA_HOME/bin/java" ] && [ ! -f "$JAVA_HOME/bin/java.exe" ]; then
  echo "Не вижу JDK в $JAVA_HOME. Поставьте JDK 17 или задайте JAVA_HOME." >&2
  exit 1
fi

if [ ! -f "$HERE/www/index.html" ]; then
  echo "Нет waiter-app/www/index.html. Интерфейс официанта не собран, APK будет пустым." >&2
  exit 1
fi

# Путь к SDK для Gradle. Обратные слэши в properties-файле съедаются при разборе,
# поэтому приводим путь к прямым слэшам, откуда бы он ни пришёл.
SDK_FWD="${ANDROID_HOME//\\//}"
printf 'sdk.dir=%s\n' "$SDK_FWD" > "$ANDROID_DIR/local.properties"

case "$VARIANT" in
  debug)   TASK=assembleDebug;   OUT="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk" ;;
  release) TASK=assembleRelease; OUT="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk" ;;
  *) echo "Вариант сборки: debug или release" >&2; exit 1 ;;
esac

if [ "$VARIANT" = "release" ] && [ ! -f "$ANDROID_DIR/keystore.properties" ]; then
  echo "Нет android/keystore.properties, релиз соберётся без подписи." >&2
  echo "Как завести ключ, написано в waiter-app/README.md" >&2
fi

cd "$ANDROID_DIR"
"$GRADLE" "$TASK" --console=plain

echo
if [ -f "$OUT" ]; then
  SIZE=$(du -h "$OUT" | cut -f1)
  echo "Готово: $OUT ($SIZE)"
  echo "Поставить на телефон по кабелю:"
  echo "  $ANDROID_HOME/platform-tools/adb install -r \"$OUT\""
else
  echo "Сборка прошла, но файла нет по пути $OUT" >&2
  exit 1
fi
