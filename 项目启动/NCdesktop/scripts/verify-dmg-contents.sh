#!/usr/bin/env bash
# verify-dmg-contents.sh — 挂载 DMG，列出 markitdown 与 ASR 关键证据
#
# 用法：bash scripts/verify-dmg-contents.sh dist/NoteCapt-x.y.z-arm64.dmg
#
# 输出：
#   - .app bundle 内 Python + markitdown 7 模块 imports 状态
#   - notecapt binary 内 iflytek/讯飞 ASR 符号是否存在（strings 抽取）
#   - Resources 目录树关键 layer + 体积分布

set -euo pipefail

DMG="${1:?用法：bash $0 <path-to.dmg>}"
[[ -f "$DMG" ]] || { echo "❌ DMG 不存在: $DMG"; exit 1; }

MOUNT_DIR="$(mktemp -d -t notecapt-verify.XXXXXX)"
cleanup() { hdiutil detach "$MOUNT_DIR" -force 2>/dev/null || true; rm -rf "$MOUNT_DIR"; }
trap cleanup EXIT

echo "=== 1. 挂载 DMG ==="
hdiutil attach "$DMG" -mountpoint "$MOUNT_DIR" -nobrowse -noverify -noautoopen
APP="$MOUNT_DIR/NoteCapt.app"
[[ -d "$APP" ]] || { echo "❌ NoteCapt.app 不在 DMG 内"; exit 1; }
echo "  挂载点: $MOUNT_DIR"

echo ""
echo "=== 2. .app 体积 + 顶层结构 ==="
du -sh "$APP"
du -sh "$APP/Contents/Resources/python" 2>/dev/null || echo "  ❌ Resources/python 不存在"
du -sh "$APP/Contents/Resources/markitdown-venv" 2>/dev/null || echo "  ❌ Resources/markitdown-venv 不存在"
ls -la "$APP/Contents/Resources/" 2>/dev/null | head -10
echo ""

echo "=== 3. runtime-manifest.json ==="
MANIFEST="$APP/Contents/Resources/runtime-manifest.json"
if [[ -f "$MANIFEST" ]]; then
  cat "$MANIFEST"
else
  echo "  ❌ runtime-manifest.json 不在"
fi
echo ""

echo "=== 4. venv-shim 链路 ==="
SHIM="$APP/Contents/Resources/markitdown-venv/bin/python"
ls -la "$SHIM" 2>/dev/null && readlink "$SHIM"
PYBIN="$APP/Contents/Resources/python/bin/python3.12"
[[ -x "$PYBIN" ]] && echo "  PBS Python: $PYBIN ($(stat -f %z "$PYBIN") bytes)"
echo ""

echo "=== 5. Markitdown 7 imports 真探针 ==="
if [[ -x "$SHIM" ]]; then
  for mod in ebooklib bs4 pdfminer pptx mammoth openpyxl PIL; do
    if "$SHIM" -E -s -c "import $mod" 2>/dev/null; then
      echo "  ✅ $mod"
    else
      echo "  ❌ $mod (import 失败)"
    fi
  done
else
  echo "  ❌ shim 无可执行权限或不存在"
fi
echo ""

echo "=== 6. markitdown 包本体 + CLI ==="
"$SHIM" -E -s -c "import markitdown; print('  ✅ markitdown', markitdown.__version__ if hasattr(markitdown,'__version__') else '(no __version__)')" 2>&1 | head -2
ls -la "$APP/Contents/Resources/python/bin/markitdown" 2>/dev/null && echo "  CLI 存在" || echo "  ⚠️ markitdown CLI 不在 bin/"
echo ""

echo "=== 7. ASR (讯飞) 是否编译进 notecapt 二进制 ==="
NOTECAPT_BIN="$APP/Contents/MacOS/notecapt"
if [[ -x "$NOTECAPT_BIN" ]]; then
  echo "  binary 大小: $(du -sh "$NOTECAPT_BIN" | awk '{print $1}')"
  # 抽取 binary 中讯飞 API endpoint 字面字符串，证明 ASR 编进 binary
  ASR_HITS="$(strings "$NOTECAPT_BIN" 2>/dev/null | grep -cE '(iflyaisol|/v2/upload|/v2/getResult|HmacSha1|access_key_id)' || echo 0)"
  echo "  ASR 字面符号命中: $ASR_HITS （> 0 即表示讯飞 ASR 客户端已编入）"
  if [[ "$ASR_HITS" -gt 0 ]]; then
    echo "  ✅ ASR 已打包（HTTP 客户端编译进主 binary）"
    strings "$NOTECAPT_BIN" 2>/dev/null | grep -E "iflyaisol|/v2/upload" | head -3 | sed 's/^/    /'
  else
    echo "  ❌ ASR 字面符号 0 命中（可能 release 模式被 strip）"
  fi
else
  echo "  ❌ notecapt binary 不在"
fi
echo ""

echo "=== 8. 体积报告 ==="
du -sh "$APP/Contents/"* 2>/dev/null | sort -rh | head -10
echo ""

echo "=== 9. SHA256 ==="
shasum -a 256 "$DMG"

echo ""
echo "✅ DMG 验证完成。"
