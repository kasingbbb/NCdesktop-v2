#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# prepare-embedded-python.sh
#
# Task: task_001_prepare_embedded_python_rpath_verify (T-A)
# 目的: 下载固定 release 的 python-build-standalone cpython 3.12.7 (arm64
#       macOS, 20241016 build) 到 src-tauri/resources/python/，确保所有 rpath
#       为 @executable_path/ 相对，便于后续 DMG 自包含分发。
#
# 严格遵守:
#   - ADR-001: 仅使用 python-build-standalone，禁用 brew / 系统 python。
#   - ADR-003: 不破坏内部目录结构（rpath 依赖 ../lib 相对路径）。
#   - 红线: 下载 URL + SHA256 为硬编码常量，禁动态拼接。
#
# 用法:
#   ./scripts/prepare-embedded-python.sh           # 幂等模式（已存在则跳过）
#   ./scripts/prepare-embedded-python.sh --force   # 显式重下
# ---------------------------------------------------------------------------
set -euo pipefail

# ---- 硬编码常量（禁止动态拼接，违反即红线） --------------------------------
readonly PBS_TARBALL_NAME="cpython-3.12.7+20241016-aarch64-apple-darwin-install_only.tar.gz"
readonly PBS_DOWNLOAD_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-aarch64-apple-darwin-install_only.tar.gz"
# SHA256 来自 python-build-standalone 20241016 release 官方 .sha256 文件
# 校验源: https://github.com/astral-sh/python-build-standalone/releases/download/20241016/
#         cpython-3.12.7+20241016-aarch64-apple-darwin-install_only.tar.gz.sha256
# 本机 (Darwin arm64, 2026-05-13) 实测下载并交叉验证一致。
readonly PBS_TARBALL_SHA256="4c18852bf9c1a11b56f21bcf0df1946f7e98ee43e9e4c0c5374b2b3765cf9508"

# ---- 路径常量 ---------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly RESOURCES_DIR="${ROOT_DIR}/src-tauri/resources"
readonly PYTHON_OUT_DIR="${RESOURCES_DIR}/python"
readonly PYTHON_BIN="${PYTHON_OUT_DIR}/bin/python3.12"

# ---- 参数 -------------------------------------------------------------------
FORCE="0"
for arg in "$@"; do
  case "${arg}" in
    --force) FORCE="1" ;;
    -h|--help)
      sed -n '2,20p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "[prepare-embedded-python] unknown arg: ${arg}" >&2
      exit 2
      ;;
  esac
done

# ---- 平台守卫: 仅 macOS arm64 (ADR-008) ------------------------------------
HOST_OS="$(uname -s)"
HOST_ARCH="$(uname -m)"
if [[ "${HOST_OS}" != "Darwin" ]]; then
  echo "[prepare-embedded-python] ERROR: only macOS Darwin supported, got '${HOST_OS}'" >&2
  exit 1
fi
if [[ "${HOST_ARCH}" != "arm64" && "${HOST_ARCH}" != "aarch64" ]]; then
  echo "[prepare-embedded-python] ERROR: only arm64 MVP (ADR-008), got '${HOST_ARCH}'" >&2
  exit 1
fi

# ---- 幂等检查 (AC-4) --------------------------------------------------------
if [[ "${FORCE}" == "0" && -x "${PYTHON_BIN}" ]]; then
  echo "[prepare-embedded-python] python already present, skipping"
  echo "[prepare-embedded-python] (use --force to redownload)"
  exit 0
fi

if [[ "${FORCE}" == "1" ]]; then
  echo "[prepare-embedded-python] --force: cleaning ${PYTHON_OUT_DIR}"
  rm -rf "${PYTHON_OUT_DIR}"
fi

# ---- 下载到临时目录 + SHA256 校验 -------------------------------------------
mkdir -p "${RESOURCES_DIR}"

TMP_DIR="$(mktemp -d -t pbs-py.XXXXXX)"
trap 'rm -rf "${TMP_DIR}"' EXIT INT TERM

readonly TARBALL_PATH="${TMP_DIR}/${PBS_TARBALL_NAME}"

echo "[prepare-embedded-python] Downloading:"
echo "  URL : ${PBS_DOWNLOAD_URL}"
echo "  dest: ${TARBALL_PATH}"
curl -fL --retry 3 --retry-delay 2 --progress-bar -o "${TARBALL_PATH}" "${PBS_DOWNLOAD_URL}"

echo "[prepare-embedded-python] Verifying SHA256..."
ACTUAL_SHA="$(shasum -a 256 "${TARBALL_PATH}" | awk '{print $1}')"
if [[ "${ACTUAL_SHA}" != "${PBS_TARBALL_SHA256}" ]]; then
  echo "[prepare-embedded-python] ERROR: SHA256 mismatch" >&2
  echo "  expected: ${PBS_TARBALL_SHA256}" >&2
  echo "  actual  : ${ACTUAL_SHA}" >&2
  exit 1
fi
echo "[prepare-embedded-python] SHA256 OK: ${ACTUAL_SHA}"

# ---- 解压: python-build-standalone tar 顶层为 python/ -----------------------
echo "[prepare-embedded-python] Extracting into ${PYTHON_OUT_DIR}"
mkdir -p "${PYTHON_OUT_DIR}"
# install_only tarball 顶层目录是 "python/"; --strip-components=1 把内容直接放入 PYTHON_OUT_DIR
tar -xzf "${TARBALL_PATH}" -C "${PYTHON_OUT_DIR}" --strip-components=1

# ---- 结构校验 (AC-2) --------------------------------------------------------
if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "[prepare-embedded-python] ERROR: missing ${PYTHON_BIN} after extract" >&2
  exit 1
fi
if [[ ! -d "${PYTHON_OUT_DIR}/lib/python3.12" ]]; then
  echo "[prepare-embedded-python] ERROR: missing lib/python3.12/" >&2
  exit 1
fi
if [[ ! -d "${PYTHON_OUT_DIR}/include/python3.12" ]]; then
  echo "[prepare-embedded-python] ERROR: missing include/python3.12/" >&2
  exit 1
fi

echo "[prepare-embedded-python] Layout OK:"
echo "  ${PYTHON_OUT_DIR}/bin/python3.12"
echo "  ${PYTHON_OUT_DIR}/lib/python3.12/"
echo "  ${PYTHON_OUT_DIR}/include/python3.12/"

# ---- rpath 自检 (AC-3, 调用 verify-rpath.sh) --------------------------------
if [[ -x "${SCRIPT_DIR}/verify-rpath.sh" ]]; then
  echo "[prepare-embedded-python] Running verify-rpath.sh"
  "${SCRIPT_DIR}/verify-rpath.sh" "${PYTHON_OUT_DIR}"
else
  echo "[prepare-embedded-python] WARN: verify-rpath.sh not executable; skipping rpath check"
fi

echo "[prepare-embedded-python] Done."
