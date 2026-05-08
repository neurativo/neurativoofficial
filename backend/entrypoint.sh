#!/bin/sh

if command -v ffmpeg >/dev/null 2>&1; then
  echo "[entrypoint] ffmpeg available"
else
  echo "[entrypoint] WARNING: ffmpeg missing"
fi

if command -v ffprobe >/dev/null 2>&1; then
  echo "[entrypoint] ffprobe available"
else
  echo "[entrypoint] WARNING: ffprobe missing"
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8080
