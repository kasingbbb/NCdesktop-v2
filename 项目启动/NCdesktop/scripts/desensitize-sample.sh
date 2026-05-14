#!/usr/bin/env bash
# desensitize-sample.sh
# 对单个真实样本进行 PII 脱敏，并在同目录输出 <filename>.meta.json
# 用法：./desensitize-sample.sh <input_file> [output_file]
# 输出：
#   - <output_file>             脱敏后样本（默认同目录 <stem>.sanitized.<ext>）
#   - <output_file>.meta.json   脱敏元数据（不含 PII：仅 sha256 / 规则版本 / 时间戳）
# 规则版本 v1.0：姓名 / 手机 / 邮箱 / 身份证 / 银行卡 / 公司名 / 地址
# 已知局限：使用宿主机 python3，与 dev-pack embedded python 隔离；二进制格式（pdf/docx/pptx/xlsx/epub）
#           需要预装 pdftotext / python-docx / openpyxl / python-pptx / ebooklib 才能完整覆盖
set -euo pipefail

RULE_VERSION="v1.0"
DESENSITIZER="${DESENSITIZER:-<placeholder-operator>}"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <input_file> [output_file]" >&2
  exit 2
fi

INPUT="$1"
if [[ ! -f "$INPUT" ]]; then
  echo "[ERROR] input file not found: $INPUT" >&2
  exit 2
fi

INPUT_DIR="$(cd "$(dirname "$INPUT")" && pwd)"
INPUT_BASE="$(basename "$INPUT")"
INPUT_STEM="${INPUT_BASE%.*}"
INPUT_EXT="${INPUT_BASE##*.}"

OUTPUT="${2:-${INPUT_DIR}/${INPUT_STEM}.sanitized.${INPUT_EXT}}"
META="${OUTPUT}.meta.json"

# 计算 sha256（与 dev-pack 同口径：macOS shasum -a 256）
sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

ORIGINAL_SHA="$(sha256 "$INPUT")"

# 选择脱敏后端
EXT_LC="$(echo "$INPUT_EXT" | tr '[:upper:]' '[:lower:]')"

# python 脱敏脚本（处理文本流）
PY_SCRIPT="$(mktemp -t desensitize.XXXXXX).py"
trap 'rm -f "$PY_SCRIPT"' EXIT

cat >"$PY_SCRIPT" <<'PYEOF'
import re, sys

text = sys.stdin.read()

# 邮箱
text = re.sub(r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}', '[EMAIL_REDACTED]', text)
# 中国手机号 11 位
text = re.sub(r'(?<!\d)1[3-9]\d{9}(?!\d)', '[PHONE_CN_REDACTED]', text)
# 国际 E.164（+ 国家码 + 后续含数字/空格/横线/括号，总长 7-20 字符）
text = re.sub(r'\+\d{1,3}[\s\-]?(?:\(?\d{1,4}\)?[\s\-]?){2,5}\d{2,4}', '[PHONE_E164_REDACTED]', text)
# 18 位身份证（最后一位可为 X）
text = re.sub(r'(?<!\d)\d{17}[\dXx](?!\d)', '[IDCARD_REDACTED]', text)
# 银行卡 13-19 位
text = re.sub(r'(?<!\d)\d{13,19}(?!\d)', '[BANKCARD_REDACTED]', text)
# 公司名（中文：含"有限公司/科技/集团/股份"后缀）
text = re.sub(r'[一-龥A-Za-z0-9]{2,30}(有限公司|股份有限公司|科技有限公司|集团有限公司|集团|股份公司)', '[COMPANY_CN_REDACTED]', text)
# 公司名（英文：以 Inc/Ltd/Corp/LLC 结尾）
text = re.sub(r'\b[A-Z][A-Za-z0-9&\.\- ]{1,40}\s+(Inc|Ltd|Corp|LLC|Co\.,?\s*Ltd)\b\.?', '[COMPANY_EN_REDACTED]', text)
# 物理地址（中文省市区路号）— 启发式
text = re.sub(r'[一-龥]{2,6}(省|市|自治区)[一-龥]{2,8}(区|县|市)[一-龥A-Za-z0-9]{2,30}(路|街|道|巷|号院|大道)[一-龥0-9A-Za-z\-]{0,20}号?', '[ADDRESS_CN_REDACTED]', text)
# 姓名（中文 2-4 字常见姓 — 保守，避免误伤；用显式姓氏白名单首字）
text = re.sub(r'(?<![一-龥])(王|李|张|刘|陈|杨|赵|黄|周|吴|徐|孙|马|朱|胡|郭|何|高|林|罗|郑|梁|谢|宋|唐|许|韩|冯|邓|曹|彭|曾|肖|田|董|袁|潘|于|蒋|蔡|余|杜|叶|程|苏|魏|吕|丁|任|沈|姚|卢|姜|崔|钟|谭|陆|汪|范|金|石|廖|贾|夏|韦|付|方|白|邹|孟|熊|秦|邱|江|尹|薛|阎|段|雷|侯|龙|史|陶|黎|贺|顾|毛|郝|龚|邵|万|钱|严|赖|覃|洪|武|莫|孔)[一-龥]{1,3}(?![一-龥])', '[NAME_CN_REDACTED]', text)

sys.stdout.write(text)
PYEOF

desensitize_text_stream() {
  python3 "$PY_SCRIPT"
}

case "$EXT_LC" in
  txt|md|html|htm|csv|xml|json)
    desensitize_text_stream <"$INPUT" >"$OUTPUT"
    ;;
  pdf)
    # 文本型 pdf：抽文字层；扫描型 pdf 走 OCR — 本脚本仅警告
    if command -v pdftotext >/dev/null 2>&1; then
      TMP_TXT="$(mktemp -t pdftxt.XXXXXX).txt"
      pdftotext "$INPUT" "$TMP_TXT" || true
      desensitize_text_stream <"$TMP_TXT" >"${OUTPUT}.txt"
      cp "$INPUT" "$OUTPUT"
      echo "[WARN] PDF binary preserved as-is; sanitized text-layer at ${OUTPUT}.txt" >&2
      echo "[WARN] If scanned PDF (image-only), run OCR + manual review before commit." >&2
      rm -f "$TMP_TXT"
    else
      echo "[WARN] pdftotext not installed; copying as-is. Install poppler-utils for text-layer scrub." >&2
      cp "$INPUT" "$OUTPUT"
    fi
    ;;
  docx|pptx|xlsx|epub)
    echo "[WARN] $EXT_LC binary format — recommend python-docx/openpyxl/python-pptx/ebooklib (ad-hoc system python3)." >&2
    echo "[WARN] Copying file as-is. Manual review required before encrypt+commit." >&2
    cp "$INPUT" "$OUTPUT"
    ;;
  jpg|jpeg|png|tiff|bmp|gif)
    # 清除 EXIF
    if command -v exiftool >/dev/null 2>&1; then
      cp "$INPUT" "$OUTPUT"
      exiftool -overwrite_original -all= "$OUTPUT" >/dev/null
      echo "[INFO] EXIF stripped via exiftool." >&2
    else
      echo "[WARN] exiftool not installed; image EXIF NOT stripped. Install exiftool." >&2
      cp "$INPUT" "$OUTPUT"
    fi
    echo "[WARN] Image content NOT OCR-scanned for PII; manual review required." >&2
    ;;
  *)
    echo "[WARN] Unknown extension '$EXT_LC'; treating as text." >&2
    desensitize_text_stream <"$INPUT" >"$OUTPUT" || cp "$INPUT" "$OUTPUT"
    ;;
esac

SANITIZED_SHA="$(sha256 "$OUTPUT")"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat >"$META" <<JSONEOF
{
  "original_sha256": "${ORIGINAL_SHA}",
  "sanitized_sha256": "${SANITIZED_SHA}",
  "rule_version": "${RULE_VERSION}",
  "desensitized_by": "${DESENSITIZER}",
  "timestamp": "${TIMESTAMP}",
  "source_basename": "${INPUT_BASE}",
  "output_basename": "$(basename "$OUTPUT")"
}
JSONEOF

echo "[OK] sanitized → $OUTPUT"
echo "[OK] meta      → $META"
