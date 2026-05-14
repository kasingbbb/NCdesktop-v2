#!/usr/bin/env bash
# encrypt-samples.sh
# 用 AES-256-CBC + PBKDF2 加密单个文件或目录（递归）。
# 用法：
#   MARKITDOWN_SAMPLES_KEY=<key> ./encrypt-samples.sh <file_or_dir> [more...]
# 输出：每个 <file> → <file>.enc（保留原文件位置；调用方自行清理明文）
# 幂等：若 <file>.enc 已存在且 mtime 新于源文件，则 skip。
set -euo pipefail

if [[ -z "${MARKITDOWN_SAMPLES_KEY:-}" ]]; then
  echo "[ERROR] MARKITDOWN_SAMPLES_KEY env var not set." >&2
  exit 2
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: MARKITDOWN_SAMPLES_KEY=<key> $0 <file_or_dir> [more...]" >&2
  exit 2
fi

encrypt_one() {
  local src="$1"
  local dst="${src}.enc"
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
      echo "[skip] $src (.enc up-to-date)"
      return 0
    fi
  fi
  openssl aes-256-cbc -pbkdf2 -salt -iter 100000 \
    -in "$src" -out "$dst" -pass env:MARKITDOWN_SAMPLES_KEY
  echo "[enc]  $src → $dst"
}

walk() {
  local target="$1"
  if [[ -f "$target" ]]; then
    # 跳过自身已加密
    if [[ "$target" == *.enc ]]; then
      echo "[skip] $target (already .enc)"
      return 0
    fi
    encrypt_one "$target"
  elif [[ -d "$target" ]]; then
    # 递归遍历，排除 .enc / .meta.json（meta 可加密也可不加密，这里默认加密）
    while IFS= read -r -d '' f; do
      if [[ "$f" == *.enc ]]; then
        continue
      fi
      encrypt_one "$f"
    done < <(find "$target" -type f -print0)
  else
    echo "[ERROR] not a file or directory: $target" >&2
    return 2
  fi
}

for arg in "$@"; do
  walk "$arg"
done
