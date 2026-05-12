#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOTLING_DIR="$(dirname "$SCRIPT_DIR")"
COMFY_DIR="$(dirname "$DOTLING_DIR")/ComfyUI"
COMFY_PY="$COMFY_DIR/venv/bin/python3.12"
COMFY_MAIN="$COMFY_DIR/main.py"

if [[ ! -f "$COMFY_PY" ]]; then
  echo "[dotling] ComfyUI not found at $COMFY_DIR, skipping."
  exec npx next dev
  exit
fi

# Start ComfyUI
echo "[dotling] Starting ComfyUI..."
"$COMFY_PY" "$COMFY_MAIN" --listen 0.0.0.0 --port 8188 > /tmp/comfyui.log 2>&1 &
COMFY_PID=$!

cleanup() {
  echo ""
  echo "[dotling] Stopping ComfyUI (PID $COMFY_PID)..."
  kill "$COMFY_PID" 2>/dev/null
  wait "$COMFY_PID" 2>/dev/null
  echo "[dotling] ComfyUI stopped."
}
trap cleanup EXIT INT TERM QUIT

# Wait for ComfyUI to be ready
echo "[dotling] Waiting for ComfyUI to be ready..."
until curl -s -f http://localhost:8188/ > /dev/null 2>&1; do sleep 1; done
echo "[dotling] ComfyUI ready at http://localhost:8188"

# Start Next.js (foreground — script exits when this exits)
exec npx next dev
