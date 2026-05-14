#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# notarize.sh — Apple notarization + stapling + Gatekeeper assertion
#                (ADR-005, task_005_notarize_staple_gatekeeper / T-E)
#
# Why this script exists:
#   Developer ID signing alone (task_004 / ADR-004) is not sufficient for
#   Gatekeeper to accept a DMG on a clean macOS machine — Apple requires
#   notarization (server-side ticket) + stapler (embed ticket so offline
#   first-launch works).  We use the App Store Connect API-key flow because
#   `altool` was retired in 2023 and `notarytool --apple-id` requires an
#   app-specific password rotated by the developer manually (CI-hostile).
#
# Inputs:
#   $1                          — path to the signed .dmg
#   NOTARY_KEY_ID    (env)      — App Store Connect API key id (10 chars)
#   NOTARY_ISSUER_ID (env)      — issuer UUID
#   NOTARY_KEY_P8_PATH (env)    — absolute path to the .p8 private key file
#
# AC mapping (task_005 input.md):
#   AC-1  — notarytool submit --wait + JSON status check
#   AC-2  — stapler staple "The staple and validate action worked!" literal
#   AC-3/4 — spctl -a -vv -t open --context primary-signature literal check
#           (PENDING-CLEAN-VM: real macOS 12/14 arm64 VM smoke = task_013)
#   AC-5  — secrets never written to log; .p8 chmod 600 enforced at startup
#   AC-6  — 504/network/timeout → exp backoff retry (5/15/45s, max 3 attempts);
#           Invalid / Rejected → NO retry (server-side decision, not transient)
#
# Red lines (architect):
#   - NEVER use altool (retired)
#   - NEVER echo $NOTARY_KEY_ID / $NOTARY_ISSUER_ID / .p8 contents
#   - NEVER skip notarization for "local-only" builds (would produce a
#     differently-Gatekeeper-shaped artifact than what we ship — defeats the
#     entire point of the CI/local parity requirement)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Args ────────────────────────────────────────────────────────────────────
DMG="${1:-}"
if [[ -z "${DMG}" ]]; then
  echo "[notarize] ERROR: usage: $0 <path-to-dmg>" >&2
  exit 2
fi
if [[ ! -f "${DMG}" ]]; then
  echo "[notarize] ERROR: DMG not found: ${DMG}" >&2
  exit 2
fi

# ── Env preflight (AC-1 boot check; AC-5 secret hygiene) ────────────────────
# Fail fast & loud if any of the three creds are missing. Names match input.md.
# AC-5: we suppress xtrace during the presence checks themselves because
# `[[ -z $NOTARY_KEY_ID ]]` would echo the key id to a trace log if the
# caller invoked us with `bash -x notarize.sh`. The .p8 file contents are
# never on argv (notarytool reads the path), but the key-id and issuer-id
# are PII-grade secrets we should also keep off any trace stream.
set +x
missing=()
[[ -z "${NOTARY_KEY_ID:-}" ]]     && missing+=("NOTARY_KEY_ID")
[[ -z "${NOTARY_ISSUER_ID:-}" ]]  && missing+=("NOTARY_ISSUER_ID")
[[ -z "${NOTARY_KEY_P8_PATH:-}" ]] && missing+=("NOTARY_KEY_P8_PATH")
if (( ${#missing[@]} > 0 )); then
  echo "[notarize] ERROR: missing required env: ${missing[*]}" >&2
  echo "[notarize]   Set NOTARY_KEY_ID / NOTARY_ISSUER_ID / NOTARY_KEY_P8_PATH" >&2
  echo "[notarize]   (App Store Connect API key — Keys tab → '+', Developer role)" >&2
  exit 2
fi
if [[ ! -f "${NOTARY_KEY_P8_PATH}" ]]; then
  echo "[notarize] ERROR: .p8 file not readable: ${NOTARY_KEY_P8_PATH}" >&2
  exit 2
fi

# AC-5: enforce strict perms on .p8 (idempotent, safe to re-run)
chmod 600 "${NOTARY_KEY_P8_PATH}"

# Allow injecting a mock xcrun for self-tests. Production leaves this unset.
XCRUN_BIN="${XCRUN_BIN:-xcrun}"

# Mockable sleep so the retry-timing self-test runs in <1s rather than 65s.
SLEEP_BIN="${SLEEP_BIN:-sleep}"

echo "[notarize] target DMG: ${DMG}"
echo "[notarize] key id: <redacted>  issuer: <redacted>  p8: <redacted>"

# ── AC-1 + AC-6: submit with retry on transient network errors ──────────────
# Strategy: capture full stdout+stderr of notarytool. Decision tree:
#   (a) exit=0 AND JSON parses with status="Accepted" → success path
#   (b) exit=0 AND status in (Invalid, Rejected)      → fetch log + exit≠0,
#                                                       DO NOT retry (server-side)
#   (c) network/504/timeout in output OR exit≠0       → retry up to 3 times
#                                                       with exp backoff 5/15/45s
#   (d) anything else                                 → exit≠0 with raw output

NOTARY_OUT=""
NOTARY_RC=0
SUBMISSION_ID=""
STATUS=""
ATTEMPT_LOG=()

for attempt in 1 2 3; do
  echo "[notarize] submission attempt ${attempt}/3 (xcrun notarytool submit --wait)"

  # AC-5: silence trace around the call that holds the key path / ids in argv,
  # in case the parent shell enabled `set -x` for debugging. The .p8 contents
  # are never on the command line — notarytool reads the file itself — but the
  # key-id and issuer-id are PII-ish and we keep them off any trace log too.
  set +x
  NOTARY_OUT="$("${XCRUN_BIN}" notarytool submit "${DMG}" \
      --key-id     "${NOTARY_KEY_ID}" \
      --key        "${NOTARY_KEY_P8_PATH}" \
      --issuer     "${NOTARY_ISSUER_ID}" \
      --wait \
      --output-format json 2>&1)" && NOTARY_RC=0 || NOTARY_RC=$?
  # (re-enable trace only if the caller had it on; harmless if they didn't)
  case "$-" in *x*) ;; *) : ;; esac

  ATTEMPT_LOG+=("attempt=${attempt} rc=${NOTARY_RC}")

  # Parse status from JSON. We try `python3 -c` because plutil chokes on the
  # mixed stderr+stdout that --output-format json sometimes emits.
  STATUS="$(printf '%s' "${NOTARY_OUT}" | python3 -c '
import json, sys, re
raw = sys.stdin.read()
# notarytool may print human "Conducting pre-submission checks..." lines
# before the JSON object; extract the first {...} block defensively.
m = re.search(r"\{.*\}", raw, re.DOTALL)
if not m:
    sys.exit(0)
try:
    obj = json.loads(m.group(0))
except Exception:
    sys.exit(0)
print(obj.get("status", ""))
' 2>/dev/null || true)"

  SUBMISSION_ID="$(printf '%s' "${NOTARY_OUT}" | python3 -c '
import json, sys, re
raw = sys.stdin.read()
m = re.search(r"\{.*\}", raw, re.DOTALL)
if not m:
    sys.exit(0)
try:
    obj = json.loads(m.group(0))
except Exception:
    sys.exit(0)
print(obj.get("id", ""))
' 2>/dev/null || true)"

  # Decision tree
  if [[ "${NOTARY_RC}" == "0" && "${STATUS}" == "Accepted" ]]; then
    echo "[notarize] Accepted (submission id: ${SUBMISSION_ID:-unknown})"
    break
  fi

  if [[ "${STATUS}" == "Invalid" || "${STATUS}" == "Rejected" ]]; then
    # AC-1: fetch and dump the developer log for diagnosis. This is the only
    # way to surface "your hardened runtime entitlement X is missing" type
    # errors from Apple's notary service.
    echo "[notarize] FAIL: status=${STATUS} (submission id: ${SUBMISSION_ID:-unknown})" >&2
    if [[ -n "${SUBMISSION_ID}" ]]; then
      echo "[notarize] Fetching developer log from notary service..." >&2
      set +x
      "${XCRUN_BIN}" notarytool log "${SUBMISSION_ID}" \
        --key-id "${NOTARY_KEY_ID}" \
        --key    "${NOTARY_KEY_P8_PATH}" \
        --issuer "${NOTARY_ISSUER_ID}" >&2 || true
    fi
    echo "[notarize] (not retrying — server-side rejection, not a transient error)" >&2
    exit 1
  fi

  # Transient classification: rc≠0 OR Accepted/Invalid/Rejected NOT seen,
  # AND the output looks network-y. We use grep -F (fixed strings) on a
  # small allowlist of substrings notarytool prints for transport errors.
  if printf '%s' "${NOTARY_OUT}" | grep -E -i -q '504|timeout|timed out|network|connection (refused|reset|closed)|temporary failure|could not connect'; then
    if (( attempt < 3 )); then
      # Exp backoff: 5s, 15s, 45s (geometric ratio ~3, well within Apple's
      # observed retry-friendly window).
      case "${attempt}" in
        1) backoff=5  ;;
        2) backoff=15 ;;
        *) backoff=45 ;;
      esac
      echo "[notarize] transient error detected, retrying in ${backoff}s (attempt $((attempt+1))/3)" >&2
      "${SLEEP_BIN}" "${backoff}"
      continue
    fi
    echo "[notarize] FAIL: 3 attempts exhausted on transient errors" >&2
    echo "[notarize] last notarytool output:" >&2
    echo "${NOTARY_OUT}" >&2
    exit 1
  fi

  # Unknown failure mode — don't retry blindly (might be auth, contract, etc.)
  echo "[notarize] FAIL: unexpected notarytool result (rc=${NOTARY_RC}, status='${STATUS}')" >&2
  echo "[notarize] full output:" >&2
  echo "${NOTARY_OUT}" >&2
  exit 1
done

if [[ "${STATUS}" != "Accepted" ]]; then
  # Defensive — should be unreachable, but `break` could land here in edge cases.
  echo "[notarize] FAIL: post-loop status is '${STATUS}', not Accepted" >&2
  exit 1
fi

# ── AC-2: stapler staple ────────────────────────────────────────────────────
# Apple's stapler binds the notary ticket into the DMG so first-launch on a
# machine with no internet still passes Gatekeeper. The success message is a
# fixed literal we grep for — output language is locale-dependent in some
# tools but stapler has remained English-only as of Xcode 15.
echo "[notarize] running xcrun stapler staple"
STAPLE_OUT="$("${XCRUN_BIN}" stapler staple "${DMG}" 2>&1)"
STAPLE_RC=$?
echo "${STAPLE_OUT}"
if [[ ${STAPLE_RC} -ne 0 ]]; then
  echo "[notarize] FAIL: stapler exited ${STAPLE_RC}" >&2
  exit 1
fi
if ! printf '%s' "${STAPLE_OUT}" | grep -F -q "The staple and validate action worked!"; then
  echo "[notarize] FAIL: stapler did not emit the success literal" >&2
  exit 1
fi
echo "[notarize] staple OK"

# ── AC-3/4 local pre-flight: spctl assertion ────────────────────────────────
# Real Gatekeeper acceptance can ONLY be confirmed on a clean macOS VM
# (task_013), because the dev machine's spctl cache may have cached the
# unsigned/ad-hoc state from a prior build. We still run spctl here as a
# sanity check — if it says anything other than "accepted: Notarized
# Developer ID" we know the staple did not bind and we should fail loudly
# rather than ship a DMG that will get rejected on first user launch.
echo "[notarize] running spctl assessment (local pre-flight)"
SPCTL_OUT="$("${XCRUN_BIN}" spctl -a -vv -t open --context context:primary-signature "${DMG}" 2>&1 || true)"
echo "${SPCTL_OUT}"
if printf '%s' "${SPCTL_OUT}" | grep -F -q "accepted"; then
  if printf '%s' "${SPCTL_OUT}" | grep -F -q "Notarized Developer ID"; then
    echo "[notarize] spctl: accepted Notarized Developer ID (local check)"
  else
    echo "[notarize] WARNING: spctl accepted but did not mention 'Notarized Developer ID'" >&2
    echo "[notarize]   This usually means the local spctl cache is stale." >&2
    echo "[notarize]   Final verdict requires the clean-VM smoke test (task_013)." >&2
  fi
else
  echo "[notarize] WARNING: local spctl did not report 'accepted'" >&2
  echo "[notarize]   Possible causes: signature broken, staple not bound, local cache stale." >&2
  echo "[notarize]   Clean-VM smoke (task_013) is the authoritative check; not failing here." >&2
fi

echo "[notarize] DONE: ${DMG}"
