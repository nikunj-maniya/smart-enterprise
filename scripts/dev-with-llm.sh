#!/usr/bin/env bash
# Starts the local Ollama server (if not already running) alongside the usual `pnpm dev`, so
# Smart Search has a model to talk to without a separate manual step. Ollama lives outside this
# repo/workspace entirely, so `pnpm -r --parallel dev` alone can never see it.
set -euo pipefail

OLLAMA_BIN="$(command -v ollama || true)"
if [ -z "$OLLAMA_BIN" ] && [ -x "$HOME/ollama-local/bin/ollama" ]; then
  OLLAMA_BIN="$HOME/ollama-local/bin/ollama"
  export LD_LIBRARY_PATH="$HOME/ollama-local/lib/ollama${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
export OLLAMA_MODELS="${OLLAMA_MODELS:-$HOME/ollama-local/models}"

if [ -z "$OLLAMA_BIN" ]; then
  echo "Ollama isn't installed — see the Smart Search integration guide for setup steps." >&2
  exit 1
fi

if curl -s -m 1 http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "[dev-with-llm] Ollama already running."
else
  echo "[dev-with-llm] Starting Ollama..."
  "$OLLAMA_BIN" serve >/tmp/ollama-dev.log 2>&1 &
  until curl -s -m 1 http://localhost:11434/api/tags >/dev/null 2>&1; do sleep 0.5; done
  echo "[dev-with-llm] Ollama ready."
fi

exec pnpm -r --parallel dev
