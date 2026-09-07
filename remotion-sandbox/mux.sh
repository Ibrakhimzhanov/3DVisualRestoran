#!/usr/bin/env bash
# Подмешивает музыку к отрендеренным роликам и кладёт финальные файлы в media-out/.
# Запуск из папки remotion-sandbox: bash mux.sh
set -e

FF=/c/tools/ffmpeg/ffmpeg
OUT=../media-out
AUD=../assets/audio

mux() {
  local video="$1" music="$2" result="$3" fadeout="$4"
  if [ ! -f "$video" ]; then echo "нет видео: $video"; return 1; fi
  if [ ! -f "$music" ]; then
    echo "музыки нет ($music), оставляю без звука: $result"
    cp "$video" "$result"
    return 0
  fi
  local dur
  dur=$(/c/tools/ffmpeg/ffprobe -v error -show_entries format=duration -of csv=p=0 "$video")
  echo "склеиваю $result, длительность $dur c"
  "$FF" -v error -y -i "$video" -stream_loop -1 -i "$music" \
    -filter_complex "[1:a]volume=0.85,afade=t=in:st=0:d=1.2,afade=t=out:st=$fadeout:d=2.2[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest \
    -movflags +faststart "$result"
}

mux "$OUT/menulive-promo-silent.mp4"  "$AUD/promo-main.mp3"  "$OUT/menulive-promo-16x9.mp4"  72.8
mux "$OUT/menulive-vertical-silent.mp4" "$AUD/promo-short.mp3" "$OUT/menulive-promo-9x16.mp4" 27.8

echo "--- готово ---"
ls -la "$OUT"
