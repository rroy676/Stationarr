#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"
SCRAPER_DIR="${DATA_DIR}/scraper"
APP_USER="node"
APP_UID="1000"
APP_GID="1000"
SCRAPER_CHANNELS_PATH="${SCRAPER_CHANNELS_PATH:-${SCRAPER_DIR}/channels.xml}"

mkdir -p "$DATA_DIR" "$SCRAPER_DIR"

if [ "$(id -u)" = "0" ]; then
  chown -R "${APP_UID}:${APP_GID}" "$DATA_DIR"
fi

case "$SCRAPER_CHANNELS_PATH" in
  "$DATA_DIR"/*) ;;
  *)
    echo "[WARN] SCRAPER_CHANNELS_PATH is outside DATA_DIR: $SCRAPER_CHANNELS_PATH" >&2
    if [ "$SCRAPER_CHANNELS_PATH" = "/epg/public/channels.xml" ] || [ "${SCRAPER_CHANNELS_PATH#"/epg/public"}" != "$SCRAPER_CHANNELS_PATH" ]; then
      echo "[WARN] Do not point Stationarr to /epg/public. Keep SCRAPER_CHANNELS_PATH under $DATA_DIR (recommended: $SCRAPER_DIR/channels.xml)." >&2
    fi
    ;;
esac

if [ "$(id -u)" = "0" ]; then
  exec su-exec "$APP_USER" "$@"
fi

exec "$@"
