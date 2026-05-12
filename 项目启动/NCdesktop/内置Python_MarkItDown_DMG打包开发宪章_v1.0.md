# NCdesktop 内置 Python + MarkItDown DMG 打包开发宪章 v1.0

> **文档性质**：这是本项目的执行型打包宪章，用于把 `MarkItDown` 所需运行时内置到 `NoteCapt.app`，并随 `.dmg` 一起分发给终端用户。
>
> **版本**：v1.0 / 2026-04-22
> **适用范围**：macOS Tauri 桌面应用的构建、封装、签名与分发
> **外部依赖基线**：`Python 3.10+`、`markitdown[pdf,docx,pptx,xlsx]==0.1.5`

---

## 一、目标

本次打包改造的目标不是“让开发机能跑”，而是：

1. 用户机器上**不需要预装 Python**
2. 用户机器上**不需要手动安装 markitdown**
3. `NoteCapt.app` 内置完整文档转换运行时
4. 拖出 `.dmg` 后安装到 `Applications` 即可直接转换 PDF / DOCX / PPTX / XLSX

---

## 二、封装原则

### 原则一：运行时必须随 App 分发

`MarkItDown` 不能依赖：

- 用户的 Homebrew Python
- 用户的 pyenv Python
- 用户手工 `pip install`

否则 `.dmg` 分发后不具备可预测性。

### 原则二：只内置当前需要的依赖

本项目当前只把以下格式切到 MarkItDown 主路径：

- PDF
- DOCX
- PPTX
- XLSX

因此只内置：

```text
markitdown[pdf,docx,pptx,xlsx]==0.1.5
```

不在本轮内置：

- OCR 插件
- 音频转写 extras
- Azure Document Intelligence
- Outlook / YouTube 等非当前主线功能

### 原则三：优先命中 App 内置运行时

应用启动后文件转换链路按以下优先级探测 Python：

1. 用户在设置页显式配置的 `markitdownPythonCmd`
2. `.app/Contents/Resources/markitdown-venv/bin/python`
3. `.app/Contents/Resources/python/bin/python3`
4. 系统 `python3`
5. 系统 `python`

`.dmg` 分发场景下，默认应在第 2 步命中。

### 原则四：签名必须在拷贝运行时之后进行

必须先把内置 Python 和 venv 放进 `.app`，再做：

- `codesign`
- `notarize`
- `.dmg` 生成

否则签名会失效。

---

## 三、目标目录结构

最终应用包内应具备以下结构：

```text
NoteCapt.app
└── Contents
    ├── MacOS
    │   └── NoteCapt
    ├── Resources
    │   ├── python/
    │   ├── markitdown-venv/
    │   │   ├── bin/python
    │   │   ├── bin/markitdown
    │   │   └── lib/python3.x/site-packages/
    │   └── runtime-manifest.json
    └── Info.plist
```

---

## 四、构建阶段定义

### Stage A：应用构建前检查

要求：

- `pnpm build` 通过
- `cargo check --manifest-path src-tauri/Cargo.toml` 通过
- Tauri bundle 配置可正常生成 `.app`

### Stage B：准备嵌入式 Python 运行时

输入：

- `PYTHON_STANDALONE_DIR` 或 `PYTHON_STANDALONE_TARBALL`

输出：

- `build/runtime/python/`

说明：

第一版不强制脚本自动联网下载 Python runtime，但打包脚本必须支持使用预下载的 Python standalone 产物。

### Stage C：创建内置 MarkItDown venv

目标：

- 使用嵌入式 Python 创建虚拟环境
- 安装 `markitdown[pdf,docx,pptx,xlsx]==0.1.5`

输出：

- `build/runtime/markitdown-venv/`

### Stage D：向 `.app` 注入运行时

目标：

- 把 `python/` 与 `markitdown-venv/` 拷入 `.app/Contents/Resources`
- 写入 `runtime-manifest.json`

### Stage E：签名、验证、生成 DMG

目标：

- `codesign --deep`
- `spctl --assess`
- 可选 notarization
- 生成 `.dmg`

---

## 五、脚本职责划分

### 1. `scripts/prepare-embedded-python.sh`

职责：

- 接收 `PYTHON_STANDALONE_DIR` 或 `PYTHON_STANDALONE_TARBALL`
- 输出标准化的 `build/runtime/python/`

### 2. `scripts/prepare-embedded-markitdown-runtime.sh`

职责：

- 基于 `build/runtime/python/bin/python3`
- 创建 `build/runtime/markitdown-venv`
- 安装 `markitdown[pdf,docx,pptx,xlsx]==0.1.5`
- 生成 `runtime-manifest.json`

### 3. `scripts/build-macos-dmg.sh`

职责：

- 执行前端和 Tauri 构建
- 调用上述两个准备脚本
- 把运行时拷入 `.app`
- 进行签名和可选 notarization
- 产出 `.dmg`

---

## 六、代码改造要求

### 6.1 后端运行时探测

后端必须默认探测：

```text
Contents/Resources/markitdown-venv/bin/python
Contents/Resources/markitdown-venv/bin/python3
Contents/Resources/python/bin/python3
Contents/Resources/python/bin/python
```

若存在，优先使用，不依赖设置页。

### 6.2 设置页仍保留人工覆盖能力

保留：

- `markitdownEnabled`
- `markitdownPythonCmd`

方便开发环境与诊断。

### 6.3 运行时清单

应用包内必须写入：

```json
{
  "pythonVersion": "...",
  "markitdownVersion": "0.1.5",
  "extras": ["pdf", "docx", "pptx", "xlsx"],
  "platform": "macos-aarch64"
}
```

便于现场排查版本不一致问题。

---

## 七、打包输入约定

打包脚本默认支持以下环境变量：

- `PYTHON_STANDALONE_DIR`
- `PYTHON_STANDALONE_TARBALL`
- `APPLE_SIGN_IDENTITY`
- `APPLE_TEAM_ID`
- `APPLE_ID`
- `APPLE_APP_PASSWORD`
- `APPLE_NOTARY_PROFILE`

其中：

- 没有签名参数时，允许本地开发打包
- 有签名参数时，执行正式签名与 notarization

---

## 八、验收标准

### 功能验收

- 在未安装 Python 的 macOS 机器上，App 可启动
- PDF / DOCX / PPTX / XLSX 转 Markdown 可用
- 设置页不配置 Python 路径时也能转换

### 工程验收

- `.app` 中存在内置运行时目录
- `runtime-manifest.json` 存在
- 打包脚本可重复执行
- 构建日志可明确区分构建失败、运行时注入失败、签名失败

### 分发验收

- `.dmg` 可挂载
- App 可拖拽安装到 `Applications`
- Gatekeeper 校验通过

---

## 九、已知边界

### 边界一：第一版不自动下载 Python runtime

为了保证打包可控，第一版允许脚本消费你预先准备好的 Python standalone 目录或 tarball。

### 边界二：第一版不把 OCR 统一到 MarkItDown

OCR 仍保留项目现有路径，不在这一轮打包里扩展。

### 边界三：前端正式构建必须先通过

若 `pnpm build` 存在 TS 错误，`.dmg` 打包不应继续。

---

## 十、实施顺序

必须按以下顺序推进：

1. 修复前端正式构建阻塞
2. 补后端内置 Python 自动探测
3. 编写运行时准备脚本
4. 编写 DMG 打包脚本
5. 本地开发构建验证
6. 正式签名与 notarization

这个顺序不能反。
