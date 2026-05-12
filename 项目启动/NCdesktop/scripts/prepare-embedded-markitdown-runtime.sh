#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_ROOT="${ROOT_DIR}/build/runtime"
PYTHON_DIR="${RUNTIME_ROOT}/python"
VENV_DIR="${RUNTIME_ROOT}/markitdown-venv"
MANIFEST_PATH="${RUNTIME_ROOT}/runtime-manifest.json"
MARKITDOWN_SPEC="${MARKITDOWN_SPEC:-markitdown[pdf,docx,pptx,xlsx]==0.1.5}"
# Extra packages for HTML and EPUB conversion
EXTRA_PACKAGES="beautifulsoup4 ebooklib"

PYTHON_BIN=""
if [[ -x "${PYTHON_DIR}/bin/python3" ]]; then
  PYTHON_BIN="${PYTHON_DIR}/bin/python3"
elif [[ -x "${PYTHON_DIR}/bin/python" ]]; then
  PYTHON_BIN="${PYTHON_DIR}/bin/python"
else
  echo "[prepare-embedded-markitdown-runtime] Embedded Python not found under ${PYTHON_DIR}"
  exit 1
fi

# Install markitdown directly into the standalone Python's site-packages.
# We don't use venv because python-build-standalone's rpath (@executable_path)
# breaks venv --copies (the copied python binary looks for libpython relative
# to its own location, which is wrong). Since this Python is fully private to
# the app bundle, installing into site-packages directly is the right approach.
echo "[prepare-embedded-markitdown-runtime] Installing ${MARKITDOWN_SPEC} into ${PYTHON_DIR}"
"${PYTHON_BIN}" -m pip install --upgrade pip --quiet
"${PYTHON_BIN}" -m pip install "${MARKITDOWN_SPEC}" --quiet
echo "[prepare-embedded-markitdown-runtime] Installing HTML/EPUB extras: ${EXTRA_PACKAGES}"
"${PYTHON_BIN}" -m pip install ${EXTRA_PACKAGES} --quiet

# Create a thin venv-shaped shim directory so the rest of the build pipeline
# (which copies markitdown-venv/ into .app/Contents/Resources) still works,
# and so the backend's runtime probe can find markitdown at the expected path.
rm -rf "${VENV_DIR}"
mkdir -p "${VENV_DIR}/bin"

# Symlink the standalone Python executables into the venv-shim bin/
ln -sf "${PYTHON_DIR}/bin/python3" "${VENV_DIR}/bin/python3"
ln -sf "${PYTHON_DIR}/bin/python3" "${VENV_DIR}/bin/python"
ln -sf "${PYTHON_DIR}/bin/markitdown" "${VENV_DIR}/bin/markitdown" 2>/dev/null || true

# Also create a thin lib/ pointer so the python binary's @executable_path rpath
# resolves correctly even when invoked from venv-shim/bin/
ln -sf "${PYTHON_DIR}/lib" "${VENV_DIR}/lib"

PYTHON_VERSION="$("${PYTHON_BIN}" -c 'import platform; print(platform.python_version())')"
MARKITDOWN_VERSION="$("${PYTHON_BIN}" -c 'import importlib.metadata as m; print(m.version("markitdown"))')"
PLATFORM_NAME="$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)"

cat > "${MANIFEST_PATH}" <<EOF
{
  "pythonVersion": "${PYTHON_VERSION}",
  "markitdownVersion": "${MARKITDOWN_VERSION}",
  "extras": ["pdf", "docx", "pptx", "xlsx", "html", "epub"],
  "platform": "${PLATFORM_NAME}"
}
EOF

echo "[prepare-embedded-markitdown-runtime] Installed into ${PYTHON_DIR}/lib"
echo "[prepare-embedded-markitdown-runtime] Shim venv at ${VENV_DIR}"
echo "[prepare-embedded-markitdown-runtime] Wrote manifest to ${MANIFEST_PATH}"
