#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="${APP_NAME:-NoteCapt}"
APP_BUNDLE_PATH="${ROOT_DIR}/src-tauri/target/release/bundle/macos/${APP_NAME}.app"
RESOURCES_DIR="${APP_BUNDLE_PATH}/Contents/Resources"
DMG_DIR="${ROOT_DIR}/src-tauri/target/release/bundle/dmg"
DMG_PATH="${DMG_DIR}/${APP_NAME}-embedded-runtime.dmg"

cd "${ROOT_DIR}"

echo "[build-macos-dmg] Running frontend build"
pnpm build

echo "[build-macos-dmg] Running tauri build (app bundle only, DMG handled by this script)"
pnpm tauri build --bundles app

echo "[build-macos-dmg] Preparing embedded Python"
bash "${ROOT_DIR}/scripts/prepare-embedded-python.sh"

echo "[build-macos-dmg] Preparing embedded MarkItDown runtime"
bash "${ROOT_DIR}/scripts/prepare-embedded-markitdown-runtime.sh"

if [[ ! -d "${APP_BUNDLE_PATH}" ]]; then
  echo "[build-macos-dmg] App bundle not found at ${APP_BUNDLE_PATH}"
  exit 1
fi

echo "[build-macos-dmg] Injecting runtime into .app"
mkdir -p "${RESOURCES_DIR}"
rm -rf "${RESOURCES_DIR}/python" "${RESOURCES_DIR}/markitdown-venv" "${RESOURCES_DIR}/runtime-manifest.json"

# Copy the full standalone Python
cp -R "${ROOT_DIR}/build/runtime/python" "${RESOURCES_DIR}/python"
cp "${ROOT_DIR}/build/runtime/runtime-manifest.json" "${RESOURCES_DIR}/runtime-manifest.json"

# Rebuild the venv-shim with symlinks that are correct *inside* the .app
# (the build/runtime symlinks point to absolute build paths and would break)
mkdir -p "${RESOURCES_DIR}/markitdown-venv/bin"
# bin/ is one level deep, so ../../python resolves to Resources/python
ln -sf "../../python/bin/python3"    "${RESOURCES_DIR}/markitdown-venv/bin/python3"
ln -sf "../../python/bin/python3"    "${RESOURCES_DIR}/markitdown-venv/bin/python"
ln -sf "../../python/bin/markitdown" "${RESOURCES_DIR}/markitdown-venv/bin/markitdown" 2>/dev/null || true
# lib is directly in markitdown-venv/, so ../python/lib is correct
ln -sf "../python/lib"               "${RESOURCES_DIR}/markitdown-venv/lib"

# ── 签名 ────────────────────────────────────────────────────────────────────
if [[ -n "${APPLE_SIGN_IDENTITY:-}" ]]; then
  echo "[build-macos-dmg] Signing with identity: ${APPLE_SIGN_IDENTITY}"
  # Sign all binaries inside the embedded runtime first, then the .app
  find "${RESOURCES_DIR}/python" "${RESOURCES_DIR}/markitdown-venv" \
    -type f \( -perm +0111 -o -name "*.dylib" -o -name "*.so" \) | while read -r f; do
    codesign --force --options runtime --sign "${APPLE_SIGN_IDENTITY}" "${f}" 2>/dev/null || true
  done
  codesign --force --deep --options runtime --sign "${APPLE_SIGN_IDENTITY}" "${APP_BUNDLE_PATH}"
else
  echo "[build-macos-dmg] No APPLE_SIGN_IDENTITY — applying ad-hoc signature"
  # Ad-hoc: sign inner binaries then the bundle so Gatekeeper sees a consistent signature tree
  find "${RESOURCES_DIR}/python" "${RESOURCES_DIR}/markitdown-venv" \
    -type f \( -perm +0111 -o -name "*.dylib" -o -name "*.so" \) | while read -r f; do
    codesign --force --sign - "${f}" 2>/dev/null || true
  done
  codesign --force --deep --sign - "${APP_BUNDLE_PATH}"
fi

# ── Notarization（可选）─────────────────────────────────────────────────────
if [[ -n "${APPLE_NOTARY_PROFILE:-}" ]]; then
  echo "[build-macos-dmg] Submitting for notarization (profile: ${APPLE_NOTARY_PROFILE})"
  xcrun notarytool submit "${APP_BUNDLE_PATH}" --keychain-profile "${APPLE_NOTARY_PROFILE}" --wait
  xcrun stapler staple "${APP_BUNDLE_PATH}"
fi

# ── DMG ─────────────────────────────────────────────────────────────────────
echo "[build-macos-dmg] Building DMG"
mkdir -p "${DMG_DIR}"
STAGING_DIR="$(mktemp -d)"

cp -R "${APP_BUNDLE_PATH}" "${STAGING_DIR}/${APP_NAME}.app"
ln -s /Applications "${STAGING_DIR}/Applications"

# Install note for ad-hoc recipients
cat > "${STAGING_DIR}/首次安装说明.txt" <<'NOTEBODY'
安装说明 (NoteCapt 内测版)
──────────────────────────────

1. 把 NoteCapt.app 拖入右侧 Applications 文件夹

2. 首次打开时若 macOS 提示"无法验证开发者"：
   方法一（推荐）：在 Finder 中右键点击 NoteCapt.app → 打开 → 再点"打开"
   方法二（一次性解除）：在终端执行
       xattr -cr /Applications/NoteCapt.app

3. 文件转换功能（PDF / DOCX / PPTX / XLSX / HTML / EPUB → Markdown）已内置，
   无需安装 Python 或任何额外依赖。
NOTEBODY

rm -f "${DMG_PATH}"
hdiutil create \
  -volname "${APP_NAME}" \
  -srcfolder "${STAGING_DIR}" \
  -ov \
  -format UDZO \
  "${DMG_PATH}"
rm -rf "${STAGING_DIR}"

echo ""
echo "════════════════════════════════════════════"
echo "  DMG ready: ${DMG_PATH}"
echo "  Runtime:   ${RESOURCES_DIR}/runtime-manifest.json"
echo "════════════════════════════════════════════"
