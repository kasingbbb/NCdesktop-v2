#!/usr/bin/env bash
# scripts/lib/sample-assertions.sh
# task_012: 本地脚本与 CI 共用同一组断言。
#
# 不直接 set -euo pipefail（被 source 时由调用方控制）。
# 提供函数：
#   assertions::infer_format <path>            → echo 出 format 字符串
#   assertions::is_known_out_failure <code>    → return 0 if 已知 Out 类
#   assertions::has_structure <markdown_file>  → return 0 if 至少 1 个标题或段落
#   assertions::nonempty <markdown_file>       → return 0 if 非空非纯空白
#   assertions::known_production_failure <path>→ return 0 if 命名标记
#   assertions::classify <path> <md_file> <failure_code> → echo pass|fail|known-fail
#
# 严禁打印 markdown 内容主体。仅打印 path / sha256 / 行数 / 判定。

# ---- 格式识别（按扩展名 + 名字前缀） ------------------------------------------
assertions::infer_format() {
  local path="$1"
  local lower
  lower="$(printf '%s' "$path" | tr '[:upper:]' '[:lower:]')"
  local base
  base="$(basename "$lower")"
  case "$lower" in
    *.pdf)
      # 命名约定：pdf-scan_* 表示扫描 PDF 样本（task_009 路径）。
      if [[ "$base" == pdf-scan_* ]] || [[ "$base" == *_scan.pdf ]]; then
        echo "pdf-scan"
      else
        echo "pdf-text"
      fi
      ;;
    *.docx) echo "docx" ;;
    *.pptx) echo "pptx" ;;
    *.xlsx) echo "xlsx" ;;
    *.html|*.htm) echo "html" ;;
    *.epub) echo "epub" ;;
    *.png|*.jpg|*.jpeg|*.gif|*.bmp|*.tiff|*.webp) echo "image" ;;
    *) echo "unknown" ;;
  esac
}

# ---- 已知 Out 类（不计入 fail，但要落 report 留痕） --------------------------
# 与 task_008 / 009 / 010 对齐：扫描 PDF 不支持、音频走错路由属于产品已声明的 Out 类。
assertions::is_known_out_failure() {
  local code="${1:-}"
  case "$code" in
    E_SCAN_PDF_UNSUPPORTED|E_AUDIO_WRONG_ROUTE) return 0 ;;
    *) return 1 ;;
  esac
}

# ---- 非空校验 ----------------------------------------------------------------
assertions::nonempty() {
  local md="$1"
  [[ -s "$md" ]] || return 1
  # 不打印内容；只用 grep -c 验证至少有 1 个非空白行。
  local nonblank
  nonblank="$(grep -c -v '^[[:space:]]*$' "$md" 2>/dev/null || true)"
  [[ "${nonblank:-0}" -ge 1 ]]
}

# ---- 结构性校验：至少 1 个 markdown 标题或非空段落 ----------------------------
assertions::has_structure() {
  local md="$1"
  [[ -s "$md" ]] || return 1
  # 标题：以 # 开头
  if grep -q -E '^#{1,6}[[:space:]]+\S' "$md" 2>/dev/null; then
    return 0
  fi
  # 段落：至少 1 个连续 ≥1 行的非空块；与 nonempty 等价但保留语义。
  if grep -q -E '^\S' "$md" 2>/dev/null; then
    return 0
  fi
  return 1
}

# ---- 行数（仅用于 report 元数据，不打印内容） --------------------------------
assertions::markdown_lines() {
  local md="$1"
  if [[ -s "$md" ]]; then
    wc -l < "$md" | tr -d ' '
  else
    echo "0"
  fi
}

# ---- 命名标记：生产已知失效 epub（task_012 AC-6） ---------------------------
assertions::known_production_failure() {
  local path="$1"
  local base
  base="$(basename "$path")"
  [[ "$base" == *_known_production_failure.epub ]]
}

# ---- sha256（仅元数据；不读内容） --------------------------------------------
assertions::sha256() {
  local path="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
  else
    echo "unavailable"
  fi
}

# ---- 主分类器 ---------------------------------------------------------------
# 入参：
#   $1 sample_path
#   $2 markdown_output_file（可能不存在）
#   $3 failure_code（可能为空字符串=NULL）
# 输出（stdout）：pass | fail | known-fail
#
# 规则：
#   - 若 sample 是 _known_production_failure.epub：必须 pass；否则 fail（AC-6 ESCALATE）
#   - failure_code 在已知 Out 类清单 → known-fail
#   - markdown 非空 + 有结构 + failure_code 为 NULL → pass
#   - 其它 → fail
assertions::classify() {
  local sample="$1"
  local md="$2"
  local code="${3:-}"

  # AC-6：生产已知失效样本必须 PASS，不允许标 known-fail。
  if assertions::known_production_failure "$sample"; then
    if [[ -z "$code" ]] && assertions::nonempty "$md" && assertions::has_structure "$md"; then
      echo "pass"
    else
      echo "fail"
    fi
    return 0
  fi

  if [[ -n "$code" ]]; then
    if assertions::is_known_out_failure "$code"; then
      echo "known-fail"
    else
      echo "fail"
    fi
    return 0
  fi

  if assertions::nonempty "$md" && assertions::has_structure "$md"; then
    echo "pass"
  else
    echo "fail"
  fi
}

# ---- 自检模式（无 args 时不做事；本文件可被 source 也可独立 bash 调） --------
# 用 `bash sample-assertions.sh --self-test` 跑内置自检（构造 fixture 字符串）。
if [[ "${1:-}" == "--self-test" ]]; then
  set -euo pipefail
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  # 1. has_structure pass (heading)
  printf '# Title\n\nbody\n' > "$tmp/h.md"
  assertions::has_structure "$tmp/h.md" || { echo "FAIL: has_structure heading"; exit 1; }

  # 2. has_structure pass (paragraph only)
  printf 'plain paragraph\nline2\n' > "$tmp/p.md"
  assertions::has_structure "$tmp/p.md" || { echo "FAIL: has_structure paragraph"; exit 1; }

  # 3. empty fails nonempty
  : > "$tmp/empty.md"
  if assertions::nonempty "$tmp/empty.md"; then echo "FAIL: empty should be empty"; exit 1; fi

  # 4. whitespace-only fails nonempty
  printf '   \n\t\n  \n' > "$tmp/ws.md"
  if assertions::nonempty "$tmp/ws.md"; then echo "FAIL: ws should be empty"; exit 1; fi

  # 5. classify pass
  out="$(assertions::classify "/tmp/foo.docx" "$tmp/h.md" "")"
  [[ "$out" == "pass" ]] || { echo "FAIL: classify pass got $out"; exit 1; }

  # 6. classify known-fail (scan pdf)
  out="$(assertions::classify "/tmp/pdf-scan_001.pdf" "$tmp/empty.md" "E_SCAN_PDF_UNSUPPORTED")"
  [[ "$out" == "known-fail" ]] || { echo "FAIL: classify known-fail got $out"; exit 1; }

  # 7. classify fail (unknown failure code)
  out="$(assertions::classify "/tmp/foo.docx" "$tmp/empty.md" "E_RUNTIME_MISSING")"
  [[ "$out" == "fail" ]] || { echo "FAIL: classify fail got $out"; exit 1; }

  # 8. infer_format
  [[ "$(assertions::infer_format /tmp/a.docx)" == "docx" ]] || { echo "FAIL: docx infer"; exit 1; }
  [[ "$(assertions::infer_format /tmp/pdf-scan_x.pdf)" == "pdf-scan" ]] || { echo "FAIL: scan pdf"; exit 1; }
  [[ "$(assertions::infer_format /tmp/regular.pdf)" == "pdf-text" ]] || { echo "FAIL: text pdf"; exit 1; }
  [[ "$(assertions::infer_format /tmp/x.HTML)" == "html" ]] || { echo "FAIL: html"; exit 1; }
  [[ "$(assertions::infer_format /tmp/x.png)" == "image" ]] || { echo "FAIL: image"; exit 1; }

  # 9. known_production_failure
  assertions::known_production_failure "/tmp/old_known_production_failure.epub" \
    || { echo "FAIL: kpf positive"; exit 1; }
  if assertions::known_production_failure "/tmp/regular.epub"; then
    echo "FAIL: kpf false positive"; exit 1
  fi

  # 10. AC-6: known_production_failure 样本即便 failure_code 是已知 Out 也必须判 fail
  out="$(assertions::classify "/tmp/x_known_production_failure.epub" "$tmp/empty.md" "")"
  [[ "$out" == "fail" ]] || { echo "FAIL: kpf must-pass got $out"; exit 1; }

  echo "OK: all assertions self-test passed"
  exit 0
fi
