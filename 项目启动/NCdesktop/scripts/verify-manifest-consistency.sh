#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# verify-manifest-consistency.sh
#
# Task: task_002 AC-4
# 目的: 校验 scripts/requirements.lock 顶层 3 条版本号与
#       src-tauri/resources/runtime-manifest.json 对应字段完全一致。
#       任何不一致 → exit 1（CI 阻塞）。
#
# 检查项:
#   lock "markitdown[...]==X"   == manifest.markitdown.version
#   lock "beautifulsoup4==X"    == manifest.extras_extra.beautifulsoup4
#   lock "ebooklib==X"          == manifest.extras_extra.ebooklib
#   manifest.imports 长度       == 7（PRD F1/F2 关键模块）
#   manifest.schema_version     == 1（ADR-010）
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly LOCK_FILE="${SCRIPT_DIR}/requirements.lock"
readonly MANIFEST="${ROOT_DIR}/src-tauri/resources/runtime-manifest.json"

# 优先使用嵌入 python，回退系统 python3
PY=""
if [[ -x "${ROOT_DIR}/src-tauri/resources/python/bin/python3.12" ]]; then
  PY="${ROOT_DIR}/src-tauri/resources/python/bin/python3.12"
elif command -v python3 >/dev/null 2>&1; then
  PY="$(command -v python3)"
else
  echo "[verify-manifest] ERROR: no python3 available" >&2
  exit 2
fi

if [[ ! -f "${LOCK_FILE}" ]]; then
  echo "[verify-manifest] ERROR: lock missing: ${LOCK_FILE}" >&2; exit 1
fi
if [[ ! -f "${MANIFEST}" ]]; then
  echo "[verify-manifest] ERROR: manifest missing: ${MANIFEST}" >&2; exit 1
fi

# 从 lock 提取顶层 3 条
extract_lock_version() {
  # $1 = package base name (regex-safe)
  local pkg="$1"
  # 匹配形如 "markitdown[...]==0.1.5" 或 "ebooklib==0.18"，忽略注释行
  grep -E "^${pkg}(\[[^]]*\])?==" "${LOCK_FILE}" | head -n1 | sed -E 's/^[^=]*==([0-9A-Za-z.+_-]+).*$/\1/'
}

LOCK_MD="$(extract_lock_version 'markitdown')"
LOCK_BS4="$(extract_lock_version 'beautifulsoup4')"
LOCK_EBOOK="$(extract_lock_version 'ebooklib')"

if [[ -z "${LOCK_MD}" || -z "${LOCK_BS4}" || -z "${LOCK_EBOOK}" ]]; then
  echo "[verify-manifest] ERROR: cannot extract top-level versions from lock" >&2
  echo "  markitdown=${LOCK_MD} bs4=${LOCK_BS4} ebooklib=${LOCK_EBOOK}" >&2
  exit 1
fi

# 用 Python 解析 manifest 并断言
"${PY}" - "${MANIFEST}" "${LOCK_MD}" "${LOCK_BS4}" "${LOCK_EBOOK}" <<'PYEOF'
import json, sys
manifest_path, lock_md, lock_bs4, lock_ebook = sys.argv[1:5]
with open(manifest_path) as f:
    m = json.load(f)

errors = []

def check(label, actual, expected):
    if actual != expected:
        errors.append(f"  {label}: manifest={actual!r} lock={expected!r}")

# schema_version (ADR-010)
if m.get("schema_version") != 1:
    errors.append(f"  schema_version: got {m.get('schema_version')!r}, expected 1")

# markitdown.version
check("markitdown.version", m.get("markitdown", {}).get("version"), lock_md)

# extras_extra.beautifulsoup4 / ebooklib
ee = m.get("extras_extra", {}) or {}
check("extras_extra.beautifulsoup4", ee.get("beautifulsoup4"), lock_bs4)
check("extras_extra.ebooklib", ee.get("ebooklib"), lock_ebook)

# imports 必须精确 7 项（AC-3）
imports = m.get("imports", [])
expected_imports = ["ebooklib", "bs4", "pdfminer", "pptx", "mammoth", "openpyxl", "PIL"]
if imports != expected_imports:
    errors.append(f"  imports: got {imports!r}, expected {expected_imports!r}")

# 必备字段
for field in ("runtime_id", "build_timestamp", "arch"):
    if not m.get(field):
        errors.append(f"  missing/empty field: {field}")
py = m.get("python", {}) or {}
for sub in ("source", "version", "build"):
    if not py.get(sub):
        errors.append(f"  missing/empty python.{sub}")
md_extras = m.get("markitdown", {}).get("extras")
if md_extras != ["pdf", "docx", "pptx", "xlsx"]:
    errors.append(f"  markitdown.extras: got {md_extras!r}, expected ['pdf','docx','pptx','xlsx']")

if errors:
    print("[verify-manifest] FAIL — inconsistencies detected:")
    for e in errors:
        print(e)
    sys.exit(1)

print("[verify-manifest] OK")
print(f"  markitdown      {lock_md}  (lock == manifest)")
print(f"  beautifulsoup4  {lock_bs4}")
print(f"  ebooklib        {lock_ebook}")
print(f"  schema_version  {m['schema_version']}")
print(f"  imports         {imports}")
PYEOF
