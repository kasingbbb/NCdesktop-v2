#!/usr/bin/env bash
# NoteCapt — 安装后若提示「应用已损坏」或无法打开，在本机执行此脚本
# 作用：清除隔离属性并做本地 ad-hoc 签名（非公证包分发时常用）
#
# 用法：
#   chmod +x fix-note-capt-gatekeeper.sh
#   ./fix-note-capt-gatekeeper.sh
#   ./fix-note-capt-gatekeeper.sh "/路径/到/NoteCapt.app"
#
# 默认处理：/Applications/NoteCapt.app

set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "用法: $0 [NoteCapt.app 的路径]"
  echo "默认: /Applications/NoteCapt.app"
  exit 0
fi

APP_PATH="${1:-/Applications/NoteCapt.app}"

if [[ ! -d "$APP_PATH" ]]; then
  echo "错误：找不到应用包：$APP_PATH" >&2
  echo "请把 NoteCapt.app 拖到「应用程序」，或传入本机上的 .app 完整路径。" >&2
  exit 1
fi

echo "处理: $APP_PATH"

echo "→ 清除扩展属性（隔离等）…"
xattr -cr "$APP_PATH" 2>/dev/null || true
xattr -rd com.apple.quarantine "$APP_PATH" 2>/dev/null || true

echo "→ 本地 ad-hoc 签名（需本机已安装 Xcode 命令行工具）…"
if command -v codesign >/dev/null 2>&1; then
  codesign --force --deep --sign - "$APP_PATH"
else
  echo "（未找到 codesign，跳过签名；仅清除隔离有时已足够）" >&2
fi

echo "完成。若仍被拦截：系统设置 → 隐私与安全性 → 仍要打开 NoteCapt。"
