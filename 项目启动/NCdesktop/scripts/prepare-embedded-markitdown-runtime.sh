#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# prepare-embedded-markitdown-runtime.sh
#
# Task: task_002_markitdown_extras_pin_manifest (T-B)
# 目的: 把 markitdown 0.1.5 + 完整 extras（含 ebooklib/beautifulsoup4/mammoth
#       等）按 requirements.lock 安装到嵌入 PBS Python 的 site-packages，并写
#       出 src-tauri/resources/runtime-manifest.json（ADR-010 schema_version=1）。
#
# 严格遵守:
#   - ADR-002: 顶层 pin markitdown[pdf,docx,pptx,xlsx]==0.1.5 + bs4 + ebooklib。
#   - ADR-010: runtime-manifest schema_version=1，含 imports 7 项。
#   - AC-4   : lock 顶层版本号与 manifest 版本字段由同一组 shell 常量驱动，
#              CI 时 scripts/verify-manifest-consistency.sh 比对。
#   - 红线   : 禁 `pip install markitdown`（无 extras）；禁污染系统 site；
#              禁越权写 self_check / legacy migration。
#
# 用法:
#   ./scripts/prepare-embedded-markitdown-runtime.sh           # 幂等
#   ./scripts/prepare-embedded-markitdown-runtime.sh --force   # 重装
#
# 前置: task_001 已就位 src-tauri/resources/python/bin/python3.12
# ---------------------------------------------------------------------------
set -euo pipefail

# ---- AC-4 单一事实源：版本常量 ---------------------------------------------
# 这些常量同时被 (a) requirements.lock 顶层 pin、(b) runtime-manifest.json
# 字段消费。任何漂移由 scripts/verify-manifest-consistency.sh 检出。
readonly MARKITDOWN_VERSION="0.1.5"
readonly MARKITDOWN_EXTRAS_JSON='["pdf","docx","pptx","xlsx"]'
readonly BS4_VERSION="4.12.3"
readonly EBOOKLIB_VERSION="0.18"

# ---- 嵌入 Python 元数据（与 task_001 / ADR-001 对齐） ----------------------
readonly PBS_PYTHON_SOURCE="python-build-standalone"
readonly PBS_PYTHON_VERSION="3.12.7"
readonly PBS_PYTHON_BUILD="20241016"
readonly RUNTIME_ARCH="arm64"
readonly RUNTIME_ID="ncdesktop-markitdown-runtime"
readonly MANIFEST_SCHEMA_VERSION=1

# ---- 7 个关键 import（AC-3 精确 7 项；顺序 = manifest.imports） ------------
readonly IMPORT_PROBES=(ebooklib bs4 pdfminer pptx mammoth openpyxl PIL)

# ---- 路径 ------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly RESOURCES_DIR="${ROOT_DIR}/src-tauri/resources"
readonly PYTHON_ROOT="${RESOURCES_DIR}/python"
readonly PYTHON_BIN="${PYTHON_ROOT}/bin/python3.12"
readonly SITE_PACKAGES="${PYTHON_ROOT}/lib/python3.12/site-packages"
readonly REQUIREMENTS_LOCK="${SCRIPT_DIR}/requirements.lock"
readonly MANIFEST_PATH="${RESOURCES_DIR}/runtime-manifest.json"

# ---- 参数 ------------------------------------------------------------------
FORCE="0"
for arg in "$@"; do
  case "${arg}" in
    --force) FORCE="1" ;;
    -h|--help) sed -n '2,25p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "[prepare-md-runtime] unknown arg: ${arg}" >&2; exit 2 ;;
  esac
done

# ---- 前置检查 --------------------------------------------------------------
if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "[prepare-md-runtime] ERROR: embedded python not found at ${PYTHON_BIN}" >&2
  echo "  Run scripts/prepare-embedded-python.sh first (task_001)." >&2
  exit 1
fi
if [[ ! -f "${REQUIREMENTS_LOCK}" ]]; then
  echo "[prepare-md-runtime] ERROR: ${REQUIREMENTS_LOCK} missing" >&2
  exit 1
fi

# ---- 幂等检查 (AC-5): manifest 已存在且版本一致 → skip ---------------------
if [[ "${FORCE}" == "0" && -f "${MANIFEST_PATH}" ]]; then
  EXISTING_MD_VER="$("${PYTHON_BIN}" -c "
import json, sys
try:
    m = json.load(open('${MANIFEST_PATH}'))
    print(m.get('markitdown', {}).get('version', ''))
except Exception:
    print('')
" 2>/dev/null || echo "")"
  if [[ "${EXISTING_MD_VER}" == "${MARKITDOWN_VERSION}" ]]; then
    # 再验证 markitdown 包真的装上了
    if "${PYTHON_BIN}" -c "import markitdown" 2>/dev/null; then
      echo "[prepare-md-runtime] manifest already at markitdown ${MARKITDOWN_VERSION}; skip (use --force to reinstall)"
      exit 0
    fi
  fi
fi

# ---- --force: 清空已安装的 markitdown 及相关包 -----------------------------
if [[ "${FORCE}" == "1" ]]; then
  echo "[prepare-md-runtime] --force: cleaning markitdown + extras from ${SITE_PACKAGES}"
  # 安全删除：只删 lock 中提到的顶层包目录/dist-info；不递归 rm site-packages
  # （那会把 pip/setuptools 也删了）
  while IFS= read -r line; do
    [[ -z "${line}" || "${line}" =~ ^# ]] && continue
    # 去掉 extras 标记与版本: "markitdown[pdf,docx,pptx,xlsx]==0.1.5" → "markitdown"
    pkg="${line%%[*}"
    pkg="${pkg%%==*}"
    pkg="${pkg%%[[:space:]]*}"
    [[ -z "${pkg}" ]] && continue
    # 用 pip uninstall（最安全，处理大小写 / dist-info / RECORD）
    "${PYTHON_BIN}" -m pip uninstall -y "${pkg}" >/dev/null 2>&1 || true
  done < "${REQUIREMENTS_LOCK}"
fi

# ---- 安装（--no-deps，所有依赖来自 lock） ----------------------------------
echo "[prepare-md-runtime] Installing pinned runtime into ${SITE_PACKAGES}"
echo "  markitdown==${MARKITDOWN_VERSION} extras=${MARKITDOWN_EXTRAS_JSON}"
echo "  beautifulsoup4==${BS4_VERSION}"
echo "  ebooklib==${EBOOKLIB_VERSION}"

# 关键：装入嵌入 python 自身 site-packages（不污染系统 / 不进 user-site）
# --no-deps  : 严格按 lock 解析，无隐式抓包
# --no-cache-dir: 避免 CI 缓存中毒
# --disable-pip-version-check: 输出干净
"${PYTHON_BIN}" -m pip install \
  --no-cache-dir \
  --no-deps \
  --disable-pip-version-check \
  --upgrade \
  -r "${REQUIREMENTS_LOCK}"

# ---- AC-2: import 自检（7 项必须全过） -------------------------------------
echo "[prepare-md-runtime] Verifying imports: ${IMPORT_PROBES[*]}"
IMPORT_STMT="$(printf 'import %s\n' "${IMPORT_PROBES[@]}")"
if ! "${PYTHON_BIN}" -c "${IMPORT_STMT}
print('[prepare-md-runtime] all 7 imports OK')"; then
  echo "[prepare-md-runtime] ERROR: import probe failed" >&2
  exit 1
fi

# ---- AC-3: 生成 runtime-manifest.json --------------------------------------
BUILD_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
IMPORTS_JSON_ARR="$(printf ',"%s"' "${IMPORT_PROBES[@]}")"
IMPORTS_JSON_ARR="[${IMPORTS_JSON_ARR:1}]"

cat > "${MANIFEST_PATH}" <<EOF
{
  "schema_version": ${MANIFEST_SCHEMA_VERSION},
  "runtime_id": "${RUNTIME_ID}",
  "python": {
    "source": "${PBS_PYTHON_SOURCE}",
    "version": "${PBS_PYTHON_VERSION}",
    "build": "${PBS_PYTHON_BUILD}"
  },
  "markitdown": {
    "version": "${MARKITDOWN_VERSION}",
    "extras": ${MARKITDOWN_EXTRAS_JSON}
  },
  "extras_extra": {
    "beautifulsoup4": "${BS4_VERSION}",
    "ebooklib": "${EBOOKLIB_VERSION}"
  },
  "imports": ${IMPORTS_JSON_ARR},
  "build_timestamp": "${BUILD_TS}",
  "arch": "${RUNTIME_ARCH}"
}
EOF

# 用 Python 校验 JSON 合法性
"${PYTHON_BIN}" -c "import json; json.load(open('${MANIFEST_PATH}'))" \
  || { echo "[prepare-md-runtime] ERROR: manifest JSON invalid" >&2; exit 1; }

echo "[prepare-md-runtime] Wrote manifest: ${MANIFEST_PATH}"

# ---- AC-6: 体积报告 --------------------------------------------------------
echo "[prepare-md-runtime] site-packages size:"
du -sh "${SITE_PACKAGES}"

echo "[prepare-md-runtime] Done."
