#!/usr/bin/env bash
# decrypt-samples.sh
# 反向解密 .enc 文件 / 递归目录。
# 用法：
#   MARKITDOWN_SAMPLES_KEY=<key> ./decrypt-samples.sh <file.enc_or_dir> [more...]
# 输出：每个 <file>.enc → <file>（去掉 .enc 后缀）
# 幂等：若目标已存在且 mtime 新于 .enc，则 skip。
set -euo pipefail

if [[ -z "${MARKITDOWN_SAMPLES_KEY:-}" ]]; then
  echo "[ERROR] MARKITDOWN_SAMPLES_KEY env var not set." >&2
  exit 2
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: MARKITDOWN_SAMPLES_KEY=<key> $0 <file.enc_or_dir> [more...]" >&2
  exit 2
fi

decrypt_one() {
  local src="$1"
  if [[ "$src" != *.enc ]]; then
    echo "[skip] $src (not .enc)"
    return 0
  fi
  local dst="${src%.enc}"
  if [[ -f "$dst" ]]; then
    local src_mtime dst_mtime
    if [[ "$(uname)" == "Darwin" ]]; then
      src_mtime="$(stat -f %m "$src")"
      dst_mtime="$(stat -f %m "$dst")"
    else
      src_mtime="$(stat -c %Y "$src")"
      dst_mtime="$(stat -c %Y "$dst")"
    fi
    if (( dst_mtime >= src_mtime )); then
      echo "[skip] $dst (up-to-date)"
      return 0
    fi
  fi
  openssl aes-256-cbc -d -pbkdf2 -salt -iter 100000 \
    -in "$src" -out "$dst" -pass env:MARKITDOWN_SAMPLES_KEY
  echo "[dec]  $src → $dst"
}

walk() {
  local target="$1"
  if [[ -f "$target" ]]; then
    decrypt_one "$target"
  elif [[ -d "$target" ]]; then
    while IFS= read -r -d '' f; do
      decrypt_one "$f"
    done < <(find "$target" -type f -name '*.enc' -print0)
  else
    echo "[ERROR] not a file or directory: $target" >&2
    return 2
  fi
}

for arg in "$@"; do
  walk "$arg"
done
