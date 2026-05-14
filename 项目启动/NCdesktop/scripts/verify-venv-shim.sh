#!/usr/bin/env bash
# verify-venv-shim.sh
#
# Cold-boot verification of the symlink venv-shim built by prepare-venv-shim.sh.
#
# AC-3: run with a CLEAN environment (no inherited PYTHONPATH / VIRTUAL_ENV /
# PYTHONHOME / user site config) and import the full extras probe set.
# AC-4: confirm symlinks are RELATIVE.
# Constraint: shim dir contains ONLY the two symlinks.
#
# Imports probe set MUST be byte-identical to ADR-010 / runtime-manifest.json
# (E-2 revision 2026-05-13): ebooklib, bs4, pdfminer, pptx, mammoth, openpyxl, PIL
# Note: `mammoth` (NOT `docx`) — this is the post-E-2 contract.
#
# FIX (Reviewer round 1, MAJOR-1): the cold-boot probe MUST NOT inherit HOME.
# AC-3 contract is literally `env -i PATH=/usr/bin:/bin`. Passing HOME lets
# Python resolve `~/.local/lib/python3.12/site-packages` (the user site dir);
# if the host happens to have e.g. `pip install --user ebooklib` etc, the
# probe would "succeed" via the user site rather than the embedded standalone
# site-packages — a false positive that defeats the very point of AC-3.
# We use `-E -s` for defense-in-depth: `-E` ignores PYTHON* env vars (already
# stripped by `env -i`, but ensures forward-compatibility if anyone re-injects),
# `-s` disables user site-packages so the import resolution is strictly the
# standalone interpreter's own site-packages.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

SHIM_BIN="src-tauri/resources/markitdown-venv/bin"
SHIM_PY="${SHIM_BIN}/python"
SHIM_PY3="${SHIM_BIN}/python3"

# Step 1: structural checks.
if [[ ! -L "${SHIM_PY}" ]]; then
    echo "FAIL: ${SHIM_PY} is missing or not a symlink." >&2
    exit 1
fi
if [[ ! -L "${SHIM_PY3}" ]]; then
    echo "FAIL: ${SHIM_PY3} is missing or not a symlink." >&2
    exit 1
fi

# AC-4: relative symlink check.
py_target="$(readlink "${SHIM_PY}")"
py3_target="$(readlink "${SHIM_PY3}")"
if [[ "${py_target}" == /* ]]; then
    echo "FAIL: ${SHIM_PY} -> ${py_target} is absolute (AC-4)." >&2
    exit 1
fi
if [[ "${py3_target}" == /* ]]; then
    echo "FAIL: ${SHIM_PY3} -> ${py3_target} is absolute (AC-4)." >&2
    exit 1
fi
echo "AC-4 OK: symlinks are relative (${py_target}, ${py3_target})"

# Constraint: shim dir nothing but the two symlinks.
unexpected=()
while IFS= read -r entry; do
    base="$(basename "${entry}")"
    if [[ "${base}" == "python" || "${base}" == "python3" ]] && [[ -L "${entry}" ]]; then
        continue
    fi
    unexpected+=("${entry}")
done < <(find "${SHIM_BIN}" -mindepth 1 -maxdepth 1)
while IFS= read -r entry; do
    base="$(basename "${entry}")"
    if [[ "${base}" == "bin" ]]; then
        continue
    fi
    unexpected+=("${entry}")
done < <(find "src-tauri/resources/markitdown-venv" -mindepth 1 -maxdepth 1)
if [[ ${#unexpected[@]} -gt 0 ]]; then
    echo "FAIL: shim dir contains non-symlink entries (must be pure shim):" >&2
    for u in "${unexpected[@]}"; do
        echo "  - ${u}" >&2
    done
    exit 1
fi
echo "structure OK: shim dir contains only the two symlinks"

# Step 2: clean-shell cold-boot import probe (AC-3).
# env -i strips ALL inherited env. We re-introduce ONLY PATH (system tools).
# HOME is deliberately NOT passed (AC-3 literal: `env -i PATH=/usr/bin:/bin`)
# so Python cannot resolve `~/.local/lib/.../site-packages` and accidentally
# satisfy imports via the user site dir. `-E` ignores PYTHON* env vars,
# `-s` disables user site-packages — double isolation guarantee.
PROBE='import ebooklib, bs4, pdfminer, pptx, mammoth, openpyxl, PIL; print("ok")'

set +e
output="$(env -i PATH=/usr/bin:/bin \
    "${SHIM_PY}" -E -s -c "${PROBE}" 2>&1)"
status=$?
set -e

echo "----- import probe output -----"
echo "${output}"
echo "----- exit=${status} -----"

if [[ ${status} -ne 0 ]]; then
    echo "FAIL: cold-boot import probe exited with ${status}." >&2
    exit 1
fi

if ! grep -q '^ok$' <<<"${output}"; then
    echo "FAIL: probe stdout did not contain 'ok'." >&2
    exit 1
fi

# Step 3: user-site decoy negative test (FIX MAJOR-1).
# Plant a poisonous `ebooklib.py` under the real user's site dir
# (~/.local/lib/python3.12/site-packages/). If our cold-boot probe were
# leaking HOME or honoring user site-packages, this stub would be loaded
# and `raise ImportError("user site stub - should NOT be reached")`,
# failing the probe. With `env -i` (no HOME) + `-E -s`, the standalone
# interpreter must NOT see this file. The stub is created idempotently
# and cleaned up unconditionally (trap) so this test is safe to re-run.
USER_SITE_DIR="${HOME}/.local/lib/python3.12/site-packages"
STUB_FILE="${USER_SITE_DIR}/ebooklib.py"
STUB_CREATED_BY_US=0

cleanup_stub() {
    if [[ "${STUB_CREATED_BY_US}" == "1" && -f "${STUB_FILE}" ]]; then
        rm -f "${STUB_FILE}"
        # rmdir is safe — only succeeds if the dir we made is still empty.
        rmdir "${USER_SITE_DIR}" 2>/dev/null || true
        rmdir "$(dirname "${USER_SITE_DIR}")" 2>/dev/null || true
        rmdir "$(dirname "$(dirname "${USER_SITE_DIR}")")" 2>/dev/null || true
    fi
}
trap cleanup_stub EXIT

if [[ -e "${STUB_FILE}" ]]; then
    echo "skip user-site decoy test: ${STUB_FILE} already exists (not ours, leaving alone)"
else
    mkdir -p "${USER_SITE_DIR}"
    cat > "${STUB_FILE}" <<'PYSTUB'
raise ImportError("user site stub - should NOT be reached (AC-3 isolation broken)")
PYSTUB
    STUB_CREATED_BY_US=1

    set +e
    decoy_output="$(env -i PATH=/usr/bin:/bin \
        "${SHIM_PY}" -E -s -c "${PROBE}" 2>&1)"
    decoy_status=$?
    set -e

    echo "----- decoy probe output -----"
    echo "${decoy_output}"
    echo "----- decoy exit=${decoy_status} -----"

    if [[ ${decoy_status} -ne 0 ]] || ! grep -q '^ok$' <<<"${decoy_output}"; then
        echo "FAIL: user-site decoy was reachable — AC-3 isolation is broken." >&2
        echo "      The probe should have ignored ${STUB_FILE} and resolved" >&2
        echo "      ebooklib from the standalone site-packages." >&2
        exit 1
    fi
    echo "user-site decoy OK: standalone site-packages is authoritative"
fi

echo "verify-venv-shim.sh: OK"
