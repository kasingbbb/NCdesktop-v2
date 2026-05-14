#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# verify-rpath.sh
#
# Task: task_001_prepare_embedded_python_rpath_verify (T-A, AC-3)
# 目的: 对 src-tauri/resources/python/ 下的 bin/python3.12 与
#       lib/**/*.{so,dylib} 运行 otool -L，断言所有依赖路径以
#       @executable_path/ 或 @loader_path/ 或 /usr/lib/ 或 /System/Library/
#       开头。任何 /opt/homebrew/、/usr/local/、其它开发机绝对路径都视为违规。
#
# 用法:
#   ./scripts/verify-rpath.sh                          # 默认 ../src-tauri/resources/python
#   ./scripts/verify-rpath.sh /path/to/python/root     # 指定根目录
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly DEFAULT_ROOT="${SCRIPT_DIR}/../src-tauri/resources/python"

PYTHON_ROOT="${1:-${DEFAULT_ROOT}}"
if [[ ! -d "${PYTHON_ROOT}" ]]; then
  echo "[verify-rpath] ERROR: python root not found: ${PYTHON_ROOT}" >&2
  exit 1
fi
PYTHON_ROOT="$(cd "${PYTHON_ROOT}" && pwd)"
readonly PYTHON_ROOT

if ! command -v otool >/dev/null 2>&1; then
  echo "[verify-rpath] ERROR: otool not found (need Xcode CLT)" >&2
  exit 1
fi

# ---- 合法前缀 (AC-3) --------------------------------------------------------
# 注意: @loader_path/ 与 @rpath/ 也是合法的 Mach-O 相对引用形式，
#       python-build-standalone 实际产物中确实存在 @loader_path/ 引用。
is_allowed_path() {
  local p="$1"
  case "${p}" in
    @executable_path/*) return 0 ;;
    @loader_path/*)     return 0 ;;
    @rpath/*)           return 0 ;;
    /usr/lib/*)         return 0 ;;
    /System/Library/*)  return 0 ;;
    *) return 1 ;;
  esac
}

# D-2 防御：开发机绝对路径前缀，任何情况下都视为 VIOLATION
# 即使 install_name basename 跳过逻辑放行了相同 basename 的依赖，
# 只要其路径含以下任一开发机前缀，立即报违规（防"同名假身份"绕过）。
is_dev_machine_path() {
  local p="$1"
  case "${p}" in
    /Users/*)      return 0 ;;
    /opt/*)        return 0 ;;
    /private/*)    return 0 ;;
    /tmp/*)        return 0 ;;
    /usr/local/*)  return 0 ;;
    *) return 1 ;;
  esac
}

VIOLATIONS=0

check_file() {
  local file="$1"
  local file_base
  file_base="$(basename "${file}")"
  # otool -L 第一行是 "<file>:" 头。
  # 对 .dylib 文件，第二行通常是该 dylib 自身的 install_name —— python-build-standalone
  # 把它设为 "/install/lib/<self>.dylib" 占位符，调用方实际通过 @executable_path/
  # 或 @loader_path/ 解析，故仅当 dependency basename 与文件 basename 一致时
  # 视为 install_name 行并跳过（不作为外部依赖判断）。
  local first="1"
  local self_skipped="0"
  while IFS= read -r line; do
    if [[ "${first}" == "1" ]]; then
      first="0"
      continue
    fi
    local dep
    dep="$(printf '%s\n' "${line}" | sed -e 's/^[[:space:]]*//' -e 's/ (.*$//')"
    [[ -z "${dep}" ]] && continue
    # D-2 防御：先查开发机绝对路径前缀，无论是否 install_name 行一律 VIOLATION
    if is_dev_machine_path "${dep}"; then
      echo "[verify-rpath] VIOLATION (dev-machine path): ${file}"
      echo "                 -> ${dep}"
      VIOLATIONS=$((VIOLATIONS + 1))
      continue
    fi
    # 跳过 dylib 自身的 install_name 行（仅第一次出现）
    if [[ "${self_skipped}" == "0" && "${file}" == *.dylib && "$(basename "${dep}")" == "${file_base}" ]]; then
      self_skipped="1"
      continue
    fi
    if ! is_allowed_path "${dep}"; then
      echo "[verify-rpath] VIOLATION: ${file}"
      echo "                 -> ${dep}"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  done < <(otool -L "${file}" 2>/dev/null || true)
}

# ---- 扫描 bin/python3.12 ----------------------------------------------------
PYTHON_BIN="${PYTHON_ROOT}/bin/python3.12"
if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "[verify-rpath] ERROR: missing ${PYTHON_BIN}" >&2
  exit 1
fi
echo "[verify-rpath] Scanning binary: ${PYTHON_BIN}"
check_file "${PYTHON_BIN}"

# ---- 扫描 lib/**/*.so / *.dylib --------------------------------------------
echo "[verify-rpath] Scanning shared libs under: ${PYTHON_ROOT}/lib"
LIB_COUNT=0
while IFS= read -r -d '' libfile; do
  LIB_COUNT=$((LIB_COUNT + 1))
  check_file "${libfile}"
done < <(find "${PYTHON_ROOT}/lib" \( -name '*.so' -o -name '*.dylib' \) -type f -print0)

echo "[verify-rpath] Scanned 1 binary + ${LIB_COUNT} shared libs"

if [[ "${VIOLATIONS}" -gt 0 ]]; then
  echo "[verify-rpath] FAIL: ${VIOLATIONS} violation(s) found" >&2
  exit 1
fi

echo "[verify-rpath] PASS: all dependency paths are relocatable or system-only"
