#!/usr/bin/env bash
# scripts/run-real-sample-matrix.sh
# task_012: 7 格式 × ≥5 真实样本端到端验收矩阵。
#
# 用法（本地）：
#   MARKITDOWN_SAMPLES_KEY=<key> \
#   SAMPLES_PRIVATE_DIR=path/to/samples-private \
#     bash scripts/run-real-sample-matrix.sh
#
# 用法（CI）：见 .github/workflows/real-samples-matrix.yml
#
# 关键约束（input.md / handoff）：
#   - set -euo pipefail
#   - 不修改任何业务代码；本脚本是验收脚本
#   - 严禁把样本明文写入构建产物 / 日志；report.json 仅记录路径、sha256、状态、行数、耗时
#   - 单样本 wall-clock 上限 = MARKITDOWN_TIMEOUT (90s) + 10s = 100s（与 task_007 ETimeout90s 对齐）
#   - 通过率 < 95% 且失败未在 known-fail-list.json → exit≠0
#
# 调用 markitdown 的方式：
#   - 默认：python -m markitdown <file>（与 src-tauri/.../extractors/markitdown.rs 一致）
#   - 可被 $MARKITDOWN_RUN_CMD 覆写（接收 file path 作为最后一个参数，stdout=markdown）
#
# 退出码：
#   0  全部通过 / 通过率 ≥ 95% 且失败均已知
#   2  缺 secret / 参数错误
#   3  解密失败
#   4  通过率不达标或出现未授权失败 / 已知生产失效样本未 pass
#   10 dry-run 自检失败

set -euo pipefail

# --- 配置 ---------------------------------------------------------------------
THIS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$THIS_DIR/.." && pwd)"

# 共用断言库
# shellcheck source=lib/sample-assertions.sh
source "$THIS_DIR/lib/sample-assertions.sh"

DRY_RUN="${DRY_RUN:-0}"
SAMPLES_PRIVATE_DIR="${SAMPLES_PRIVATE_DIR:-${REPO_ROOT}/samples-private}"
KNOWN_FAIL_LIST="${KNOWN_FAIL_LIST:-${THIS_DIR}/known-fail-list.json}"
REPORT_OUT="${REPORT_OUT:-${REPO_ROOT}/real-samples-report.json}"
MARKITDOWN_TIMEOUT_SEC="${MARKITDOWN_TIMEOUT_SEC:-90}"
WALL_CLOCK_BUDGET_SEC=$(( MARKITDOWN_TIMEOUT_SEC + 10 ))
PASS_THRESHOLD="${PASS_THRESHOLD:-95}"  # 整数百分比
PYTHON_BIN="${PYTHON_BIN:-python3}"
# 允许外部覆写 markitdown 调用命令；接收一个 path 参数，stdout=markdown。
MARKITDOWN_RUN_CMD_OVERRIDE="${MARKITDOWN_RUN_CMD:-}"

usage() {
  cat >&2 <<EOF
Usage: MARKITDOWN_SAMPLES_KEY=<key> SAMPLES_PRIVATE_DIR=<path> $0
Env:
  MARKITDOWN_SAMPLES_KEY   (required)  AES-256 key for decrypt-samples.sh
  SAMPLES_PRIVATE_DIR      (required)  path to checked-out samples-private repo (encrypted *.enc files)
  DRY_RUN=1                (optional)  validate plumbing only; do not require key/samples
  KNOWN_FAIL_LIST          (optional)  JSON file listing accepted persistent failures
  REPORT_OUT               (optional)  output path for report.json
  MARKITDOWN_TIMEOUT_SEC   (optional)  default 90; matches src-tauri MARKITDOWN_TIMEOUT
  PASS_THRESHOLD           (optional)  integer % (default 95)
  MARKITDOWN_RUN_CMD       (optional)  override run command (e.g. path to a tauri test binary)
  PYTHON_BIN               (optional)  default python3
EOF
}

log() { echo "[run-real-sample-matrix] $*" >&2; }

# --- 0. dry-run 自检：仅校验 plumbing ----------------------------------------
if [[ "$DRY_RUN" == "1" ]]; then
  log "DRY_RUN=1 → validating plumbing only"
  # 断言库自检
  if ! bash "$THIS_DIR/lib/sample-assertions.sh" --self-test; then
    log "ERROR: sample-assertions.sh --self-test failed"
    exit 10
  fi
  # 检查必需脚本
  for f in "$THIS_DIR/decrypt-samples.sh" "$THIS_DIR/lib/sample-assertions.sh"; do
    if [[ ! -f "$f" ]]; then log "ERROR: missing $f"; exit 10; fi
  done
  log "OK: dry-run plumbing check passed"
  exit 0
fi

# --- 1. 必需 env --------------------------------------------------------------
if [[ -z "${MARKITDOWN_SAMPLES_KEY:-}" ]]; then
  log "ERROR: MARKITDOWN_SAMPLES_KEY not set (required to decrypt samples-private)"
  usage
  exit 2
fi

if [[ ! -d "$SAMPLES_PRIVATE_DIR" ]]; then
  log "ERROR: SAMPLES_PRIVATE_DIR=$SAMPLES_PRIVATE_DIR not a directory"
  log "       (task_000 PENDING-OPERATOR: PM must provision samples-private checkout)"
  usage
  exit 2
fi

# --- 2. 解密到临时目录（trap 兜底） ------------------------------------------
WORK_DIR="$(mktemp -d -t real-samples-XXXXXX)"
cleanup() {
  # 即便中途失败也确保明文不残留
  rm -rf "$WORK_DIR" || true
}
trap cleanup EXIT INT TERM

log "Decrypting samples → $WORK_DIR"
cp -R "$SAMPLES_PRIVATE_DIR"/. "$WORK_DIR"/
# decrypt-samples.sh 接收目录会递归找 *.enc 解密。
bash "$THIS_DIR/decrypt-samples.sh" "$WORK_DIR" >&2 || {
  log "ERROR: decrypt-samples.sh failed"
  exit 3
}

# --- 3. 加载 known-fail-list（可选；JSON 数组，元素是 sample 相对路径） -------
declare -a KNOWN_FAIL_REL=()
if [[ -f "$KNOWN_FAIL_LIST" ]]; then
  # 仅用 grep + sed 轻解析，避免引入 jq 依赖
  while IFS= read -r line; do
    KNOWN_FAIL_REL+=("$line")
  done < <(grep -oE '"[^"]+"' "$KNOWN_FAIL_LIST" \
              | sed -E 's/^"//; s/"$//' \
              | grep -vE '^(samples|comment|version)$' || true)
fi

is_authorized_known_fail() {
  local rel="$1"
  for k in "${KNOWN_FAIL_REL[@]:-}"; do
    [[ "$k" == "$rel" ]] && return 0
  done
  return 1
}

# --- 4. 寻找解密后的样本 -----------------------------------------------------
# 排除 .enc / .meta.json / .git / 隐藏文件 / README / 文本元数据
mapfile -t SAMPLES < <(
  find "$WORK_DIR" -type f \
    ! -name '*.enc' \
    ! -name '*.meta.json' \
    ! -name 'README*' \
    ! -path '*/.git/*' \
    ! -path '*/.github/*' \
    ! -name '.gitattributes' \
    ! -name '.gitignore' \
  | sort
)

if [[ ${#SAMPLES[@]} -eq 0 ]]; then
  log "ERROR: 0 samples found after decrypt (expected ≥35)"
  log "       PENDING-OPERATOR: task_000 AC-4 sample ingestion not complete"
  exit 3
fi

log "Found ${#SAMPLES[@]} decrypted samples"

# --- 5. 调用 markitdown -------------------------------------------------------
# 单样本运行：wall-clock 上限 = MARKITDOWN_TIMEOUT + 10s。
# 输出文件落到 $WORK_DIR/.out/<basename>.md（仍在临时目录，cleanup 时一并销毁）。
mkdir -p "$WORK_DIR/.out"

run_markitdown_one() {
  local sample="$1"
  local out="$2"
  local start_ns end_ns elapsed_ms exit_code=0

  start_ns="$(date +%s%N 2>/dev/null || python3 -c 'import time;print(int(time.time()*1e9))')"

  if [[ -n "$MARKITDOWN_RUN_CMD_OVERRIDE" ]]; then
    # 外部覆写：调用方负责自己的 timeout 与 markdown 输出。
    if command -v timeout >/dev/null 2>&1; then
      timeout "${WALL_CLOCK_BUDGET_SEC}s" \
        bash -c "$MARKITDOWN_RUN_CMD_OVERRIDE \"\$1\" > \"\$2\"" _ "$sample" "$out" \
        || exit_code=$?
    else
      bash -c "$MARKITDOWN_RUN_CMD_OVERRIDE \"\$1\" > \"\$2\"" _ "$sample" "$out" \
        || exit_code=$?
    fi
  else
    if command -v timeout >/dev/null 2>&1; then
      timeout "${WALL_CLOCK_BUDGET_SEC}s" \
        "$PYTHON_BIN" -m markitdown "$sample" > "$out" 2>"$out.stderr" \
        || exit_code=$?
    else
      # macOS 默认无 timeout；尽力 fallback（启动后台 + sleep 杀）
      ( "$PYTHON_BIN" -m markitdown "$sample" > "$out" 2>"$out.stderr" ) &
      local pid=$!
      ( sleep "$WALL_CLOCK_BUDGET_SEC" && kill -9 "$pid" 2>/dev/null ) &
      local watchdog=$!
      wait "$pid" 2>/dev/null || exit_code=$?
      kill -9 "$watchdog" 2>/dev/null || true
    fi
  fi

  end_ns="$(date +%s%N 2>/dev/null || python3 -c 'import time;print(int(time.time()*1e9))')"
  elapsed_ms=$(( (end_ns - start_ns) / 1000000 ))
  echo "$exit_code $elapsed_ms"
}

# 推断 failure_code：与 src-tauri 业务侧规则保持一致（粗粒度，本脚本是验收层）
infer_failure_code() {
  local sample="$1"
  local exit_code="$2"
  local elapsed_ms="$3"
  local fmt
  fmt="$(assertions::infer_format "$sample")"

  if [[ "$exit_code" -eq 0 ]]; then
    echo ""
    return
  fi
  # exit 124 / 137 = timeout
  if [[ "$exit_code" -eq 124 ]] || [[ "$exit_code" -eq 137 ]] || (( elapsed_ms >= MARKITDOWN_TIMEOUT_SEC * 1000 )); then
    echo "E_TIMEOUT_90S"
    return
  fi
  # 扫描 PDF → 路由 guard 期望短路为 E_SCAN_PDF_UNSUPPORTED（task_009）
  if [[ "$fmt" == "pdf-scan" ]]; then
    echo "E_SCAN_PDF_UNSUPPORTED"
    return
  fi
  echo "E_RUNTIME_MISSING"
}

# --- 6. 矩阵执行 + 结果收集 --------------------------------------------------
# per-format 计数
declare -A FORMAT_TOTAL=()
declare -A FORMAT_PASS=()
declare -A FORMAT_FAIL=()
declare -A FORMAT_KNOWN_FAIL=()

# JSON 累积（手拼，避免 jq 依赖）
REPORT_TMP="$(mktemp)"
trap 'rm -f "$REPORT_TMP"; cleanup' EXIT INT TERM
echo "[" > "$REPORT_TMP"

TOTAL=0
PASS=0
KNOWN_FAIL_COUNT=0
FAIL=0
UNAUTHORIZED_FAIL=0
KPF_FAILED=0

first=1
for sample in "${SAMPLES[@]}"; do
  TOTAL=$(( TOTAL + 1 ))
  rel="${sample#$WORK_DIR/}"
  fmt="$(assertions::infer_format "$sample")"
  out_md="$WORK_DIR/.out/${TOTAL}.md"

  # 运行
  run_result="$(run_markitdown_one "$sample" "$out_md")"
  exit_code="${run_result% *}"
  elapsed_ms="${run_result##* }"

  # 推断 failure_code
  failure_code="$(infer_failure_code "$sample" "$exit_code" "$elapsed_ms")"

  # 分类
  status="$(assertions::classify "$sample" "$out_md" "$failure_code")"
  md_lines="$(assertions::markdown_lines "$out_md")"
  sha="$(assertions::sha256 "$sample")"

  # 计数
  FORMAT_TOTAL[$fmt]=$(( ${FORMAT_TOTAL[$fmt]:-0} + 1 ))
  case "$status" in
    pass)
      PASS=$(( PASS + 1 ))
      FORMAT_PASS[$fmt]=$(( ${FORMAT_PASS[$fmt]:-0} + 1 ))
      ;;
    known-fail)
      KNOWN_FAIL_COUNT=$(( KNOWN_FAIL_COUNT + 1 ))
      FORMAT_KNOWN_FAIL[$fmt]=$(( ${FORMAT_KNOWN_FAIL[$fmt]:-0} + 1 ))
      ;;
    fail)
      FAIL=$(( FAIL + 1 ))
      FORMAT_FAIL[$fmt]=$(( ${FORMAT_FAIL[$fmt]:-0} + 1 ))
      if assertions::known_production_failure "$sample"; then
        KPF_FAILED=$(( KPF_FAILED + 1 ))  # AC-6：必须 ESCALATE
      elif is_authorized_known_fail "$rel"; then
        : # 在 known-fail-list 内的失败不算 unauthorized；但仍然算 fail（计入 RCA）
      else
        UNAUTHORIZED_FAIL=$(( UNAUTHORIZED_FAIL + 1 ))
      fi
      ;;
  esac

  # 写一行 JSON（手拼，注意只写元数据：路径、sha、状态、行数、耗时、failure_code）
  [[ $first -eq 1 ]] && first=0 || echo "," >> "$REPORT_TMP"
  cat >> "$REPORT_TMP" <<EOF
  {"sample":"$rel","format":"$fmt","status":"$status","failure_code":"$failure_code","markdown_lines":$md_lines,"elapsed_ms":$elapsed_ms,"sha256":"$sha","exit_code":$exit_code}
EOF
  # 日志只打元数据：path / sha / status；绝不打印 markdown 内容
  log "[$TOTAL/${#SAMPLES[@]}] fmt=$fmt status=$status sha=${sha:0:12} lines=$md_lines elapsed=${elapsed_ms}ms code=${failure_code:-<null>} rel=$rel"
done
echo "" >> "$REPORT_TMP"
echo "]" >> "$REPORT_TMP"

mv "$REPORT_TMP" "$REPORT_OUT"
log "Report written → $REPORT_OUT"

# --- 7. per-format 报告 + 整体门禁 ------------------------------------------
log "---- Per-format summary ----"
for fmt in "${!FORMAT_TOTAL[@]}"; do
  t="${FORMAT_TOTAL[$fmt]:-0}"
  p="${FORMAT_PASS[$fmt]:-0}"
  f="${FORMAT_FAIL[$fmt]:-0}"
  kf="${FORMAT_KNOWN_FAIL[$fmt]:-0}"
  rate=0
  [[ $t -gt 0 ]] && rate=$(( (p + kf) * 100 / t ))  # known-fail 计入"非 unauthorized"
  log "  $fmt: total=$t pass=$p known-fail=$kf fail=$f rate=${rate}%"
done

# 整体通过率分母 = TOTAL；分子 = PASS + KNOWN_FAIL（已声明的 Out 类不算 fail）
PASS_RATE=0
if [[ $TOTAL -gt 0 ]]; then
  PASS_RATE=$(( (PASS + KNOWN_FAIL_COUNT) * 100 / TOTAL ))
fi
log "Overall: total=$TOTAL pass=$PASS known-fail=$KNOWN_FAIL_COUNT fail=$FAIL (unauthorized=$UNAUTHORIZED_FAIL kpf-failed=$KPF_FAILED) rate=${PASS_RATE}%"

# --- 8. 门禁 -----------------------------------------------------------------
if [[ $KPF_FAILED -gt 0 ]]; then
  log "ESCALATE: $KPF_FAILED known-production-failure epub sample(s) did NOT pass (AC-6)"
  exit 4
fi

if [[ $UNAUTHORIZED_FAIL -gt 0 ]]; then
  log "FAIL: $UNAUTHORIZED_FAIL unauthorized failure(s) (not in $KNOWN_FAIL_LIST)"
  exit 4
fi

if [[ $PASS_RATE -lt $PASS_THRESHOLD ]]; then
  log "FAIL: pass rate ${PASS_RATE}% < threshold ${PASS_THRESHOLD}%"
  exit 4
fi

log "PASS: ${PASS_RATE}% ≥ ${PASS_THRESHOLD}% threshold"
exit 0
