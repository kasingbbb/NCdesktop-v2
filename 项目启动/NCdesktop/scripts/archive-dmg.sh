#!/usr/bin/env bash
# archive-dmg.sh — N-1/N-2 双层 DMG 归档（task_015 AC-2）
#
# 用途：将 build-macos-dmg.sh 产出的 DMG + 签名链 + manifest + sha256 归档到
#       dist/archive/<version>/，并自动保留最近 N-1 + N-2 两版本、清理 N-3 及更早。
#
# 设计取舍：本脚本设计为**独立后续步骤**，不嵌入 build-macos-dmg.sh，
# 原因是 task_006 已 PASS，避免修改其核心 10 步流程触发回归风险。
# 调用方（人工 / CI）在 build-macos-dmg.sh 成功后显式调用本脚本。
#
# 用法：
#   ./scripts/archive-dmg.sh <DMG 路径>
#   ./scripts/archive-dmg.sh dist/NCdesktop_1.2.3_aarch64.dmg
#
# Dry-run：
#   ARCHIVE_DRY_RUN=1 ARCHIVE_ROOT=/tmp/mock_archive ./scripts/archive-dmg.sh ...
#
# 退出码：0 = 成功；非 0 = 失败（缺文件 / sha256 不一致 / 无权限）。

set -euo pipefail

# ---------- 路径与参数 ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TAURI_CONF="${REPO_ROOT}/src-tauri/tauri.conf.json"
MANIFEST="${REPO_ROOT}/src-tauri/resources/runtime-manifest.json"
ENTITLEMENTS="${SCRIPT_DIR}/entitlements.plist"

# ARCHIVE_ROOT 默认 dist/archive；测试可覆盖到 /tmp。
ARCHIVE_ROOT="${ARCHIVE_ROOT:-${REPO_ROOT}/dist/archive}"
DRY_RUN="${ARCHIVE_DRY_RUN:-0}"

DMG_PATH="${1:-}"
if [[ -z "${DMG_PATH}" ]]; then
  echo "[archive-dmg] usage: $0 <DMG 路径>" >&2
  exit 2
fi

if [[ ! -f "${DMG_PATH}" ]]; then
  echo "[archive-dmg] FAIL: DMG 不存在: ${DMG_PATH}" >&2
  exit 1
fi

# ---------- 读取 version（与 task_006 同方式） ----------
read_tauri_version() {
  local conf="$1"
  python3 -c "
import json
with open('${conf}', 'r') as f:
    print(json.load(f).get('version', ''))
"
}

VERSION="$(read_tauri_version "${TAURI_CONF}")"
if [[ -z "${VERSION}" ]]; then
  echo "[archive-dmg] FAIL: 无法从 ${TAURI_CONF} 读取 version" >&2
  exit 1
fi
echo "[archive-dmg] version: ${VERSION}"

# ---------- 创建归档目录 ----------
DEST="${ARCHIVE_ROOT}/${VERSION}"
mkdir -p "${DEST}"
echo "[archive-dmg] 归档目录: ${DEST}"

# ---------- 复制 DMG ----------
DMG_BASENAME="$(basename "${DMG_PATH}")"
cp "${DMG_PATH}" "${DEST}/${DMG_BASENAME}"

# ---------- 复制 manifest（关键：归档时刻的 schema_version 快照） ----------
if [[ -f "${MANIFEST}" ]]; then
  cp "${MANIFEST}" "${DEST}/runtime-manifest.json"
else
  echo "[archive-dmg] WARN: manifest 不存在 (${MANIFEST})，跳过 manifest 归档" >&2
fi

# ---------- 复制 entitlements 并计算其哈希（签名链关键证据） ----------
ENT_HASH=""
if [[ -f "${ENTITLEMENTS}" ]]; then
  cp "${ENTITLEMENTS}" "${DEST}/entitlements.plist"
  ENT_HASH="$(shasum -a 256 "${ENTITLEMENTS}" | awk '{print $1}')"
fi

# ---------- 计算 DMG sha256（与 dist/<version>.sha256 同格式） ----------
DMG_SHA="$(shasum -a 256 "${DEST}/${DMG_BASENAME}" | awk '{print $1}')"
SHA_FILE="${DEST}/${VERSION}.sha256"
printf '%s  %s\n' "${DMG_SHA}" "${DMG_BASENAME}" > "${SHA_FILE}"
echo "[archive-dmg] sha256: ${DMG_SHA}"

# ---------- 与 build-macos-dmg.sh 产物的 sha256 交叉校验（如存在） ----------
ORIG_SHA_FILE="${REPO_ROOT}/dist/${VERSION}.sha256"
if [[ -f "${ORIG_SHA_FILE}" ]]; then
  ORIG_SHA="$(awk '{print $1}' "${ORIG_SHA_FILE}")"
  if [[ "${ORIG_SHA}" != "${DMG_SHA}" ]]; then
    echo "[archive-dmg] FAIL: 归档 DMG sha256 与原始 dist sha256 不一致" >&2
    echo "  原始: ${ORIG_SHA}" >&2
    echo "  归档: ${DMG_SHA}" >&2
    exit 1
  fi
  echo "[archive-dmg] sha256 与 dist/${VERSION}.sha256 一致"
fi

# ---------- 生成归档报告 ----------
REPORT="${DEST}/archive_report.txt"
GIT_REV="$(cd "${REPO_ROOT}" && git rev-parse HEAD 2>/dev/null || echo 'unknown')"
{
  echo "archive_report"
  echo "==============="
  echo "version:        ${VERSION}"
  echo "timestamp_utc:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "git_rev:        ${GIT_REV}"
  echo "archive_root:   ${ARCHIVE_ROOT}"
  echo ""
  echo "files:"
  (cd "${DEST}" && ls -1)
  echo ""
  echo "dmg_sha256:         ${DMG_SHA}"
  echo "entitlements_sha256: ${ENT_HASH:-<missing>}"
} > "${REPORT}"
echo "[archive-dmg] 报告: ${REPORT}"

# ---------- 保留策略：N-1 + N-2，清理 N-3 及更早 ----------
# 用 python3 解析版本号（macOS 默认 sort 无 -V，避免依赖 GNU coreutils）
# 强制保护刚归档的 ${VERSION}（即使语义版本上排序靠前，例如 hotfix backport）。
prune_old_archives() {
  local root="$1"
  local current="$2"
  local keep_count=3   # 保留 N + N-1 + N-2 = 3 个版本
  python3 - "${root}" "${current}" "${keep_count}" <<'PYEOF'
import os, sys, re, shutil
root, current, keep = sys.argv[1], sys.argv[2], int(sys.argv[3])
if not os.path.isdir(root):
    sys.exit(0)
def parse(v):
    parts = re.split(r'[.\-]', v)
    out = []
    for p in parts:
        try: out.append((0, int(p)))
        except ValueError: out.append((1, p))
    return out
versions = [d for d in os.listdir(root)
            if os.path.isdir(os.path.join(root, d))
            and not d.startswith('.')]
versions.sort(key=parse)
keep_set = set(versions[-keep:]) if len(versions) > keep else set(versions)
# 红线：当前版本必保（无论其语义排序位置）。
keep_set.add(current)
for v in versions:
    if v in keep_set:
        continue
    target = os.path.join(root, v)
    print(f"[archive-dmg] prune: 删除 N-3 及更早归档 {target}")
    shutil.rmtree(target)
PYEOF
}

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "[archive-dmg] DRY_RUN=1，跳过 prune"
else
  prune_old_archives "${ARCHIVE_ROOT}" "${VERSION}"
fi

echo "[archive-dmg] DONE"
