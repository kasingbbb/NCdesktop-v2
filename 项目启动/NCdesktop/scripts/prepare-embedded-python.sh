#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_ROOT="${ROOT_DIR}/build/runtime"
PYTHON_OUT_DIR="${RUNTIME_ROOT}/python"

# python-build-standalone release to use when no external source is provided
PBS_VERSION="${PBS_VERSION:-20241016}"
PBS_PYTHON_VERSION="${PBS_PYTHON_VERSION:-3.12.7}"
PBS_ARCH="$(uname -m)"  # arm64 or x86_64
PBS_PLATFORM="aarch64-apple-darwin"
if [[ "${PBS_ARCH}" == "x86_64" ]]; then
  PBS_PLATFORM="x86_64-apple-darwin"
fi
PBS_TARBALL_NAME="cpython-${PBS_PYTHON_VERSION}+${PBS_VERSION}-${PBS_PLATFORM}-install_only.tar.gz"
PBS_DOWNLOAD_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_VERSION}/${PBS_TARBALL_NAME}"
PBS_CACHE_PATH="${RUNTIME_ROOT}/${PBS_TARBALL_NAME}"

rm -rf "${PYTHON_OUT_DIR}"
mkdir -p "${RUNTIME_ROOT}"

if [[ -n "${PYTHON_STANDALONE_DIR:-}" ]]; then
  echo "[prepare-embedded-python] Using PYTHON_STANDALONE_DIR=${PYTHON_STANDALONE_DIR}"
  cp -R "${PYTHON_STANDALONE_DIR}" "${PYTHON_OUT_DIR}"
elif [[ -n "${PYTHON_STANDALONE_TARBALL:-}" ]]; then
  echo "[prepare-embedded-python] Extracting PYTHON_STANDALONE_TARBALL=${PYTHON_STANDALONE_TARBALL}"
  mkdir -p "${PYTHON_OUT_DIR}"
  tar -xf "${PYTHON_STANDALONE_TARBALL}" -C "${PYTHON_OUT_DIR}" --strip-components=1
else
  echo "[prepare-embedded-python] No external Python source provided, downloading python-build-standalone"
  echo "[prepare-embedded-python] → ${PBS_DOWNLOAD_URL}"

  if [[ ! -f "${PBS_CACHE_PATH}" ]]; then
    curl -L --progress-bar -o "${PBS_CACHE_PATH}" "${PBS_DOWNLOAD_URL}"
  else
    echo "[prepare-embedded-python] Cache hit: ${PBS_CACHE_PATH}"
  fi

  mkdir -p "${PYTHON_OUT_DIR}"
  tar -xf "${PBS_CACHE_PATH}" -C "${PYTHON_OUT_DIR}" --strip-components=1
fi

if [[ ! -x "${PYTHON_OUT_DIR}/bin/python3" && ! -x "${PYTHON_OUT_DIR}/bin/python" ]]; then
  echo "[prepare-embedded-python] Embedded Python runtime does not contain bin/python3 or bin/python"
  exit 1
fi

echo "[prepare-embedded-python] Prepared embedded Python at ${PYTHON_OUT_DIR}"
