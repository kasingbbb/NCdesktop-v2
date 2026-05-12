# NCdesktop 文件格式转化与衍生资产治理迭代规划宪章 v1.0

> **文档性质**：这是面向实现的迭代规划宪章，不是概念讨论稿。它用于指导 NCdesktop 将当前分散的文件提取/转 Markdown 能力，迭代为基于 `microsoft/markitdown` 的统一转换管线，并同步修复“标签只落在原文件、不落在工作区衍生文件”这一架构缺陷。
>
> **版本**：v1.0 / 2026-04-22
> **依赖文档**：`KNOWLEDGE_DESIGN_CHARTER.md`、`notecapt 知识进化功能迭代宪章v1.0.md`
> **外部基线**：`microsoft/markitdown` 官方 GitHub 仓库与 PyPI 发行页

---

## 一、问题定义

当前系统已经具备“上传原文件 -> 异步提取 -> 物化 `.md` 衍生文件”的雏形，但它仍然是一个**拼接式能力集合**，不是一个一致性的转换系统。

当前存在四个核心问题：

### 1.1 标签治理断裂

- 拖拽上传后的 AI 打标逻辑只写回原始 `asset.id`
- 提取完成后物化出的工作区 `.md` 衍生文件有 `source_asset_id`，但没有继承原件标签
- 结果是：用户在工作区里看到的“真正可读、可检索”的 Markdown 文件，没有继承原文件的语义标签

这不是单点 bug，而是**“原件资产”与“衍生资产”缺乏治理规则**导致的系统性缺陷。

### 1.2 格式转换链路割裂

当前抽取器按格式分散实现：

- `pdf_text.rs`
- `pdf_scan.rs`
- `docx.rs`
- `pptx.rs`
- `text.rs`
- `image_ocr.rs`
- `audio_asr.rs`

问题在于：

- 每种格式各自维护，质量标准不统一
- `structured_md` 的结构质量依赖各自实现，风格不一致
- 新格式扩展成本高
- 很难建立统一的质量分级、回退策略和可观测性

### 1.3 衍生文件物化策略过早、过薄

当前只要 `quality_level >= 1` 且 `structured_md` 非空，就直接物化 `.md` 文件。此策略的问题：

- 没有“转换成功但结构质量差”的中间态
- 没有“原件、抽取结果、衍生 Markdown”三者的版本关系
- 没有防重复物化与幂等更新机制
- 没有把衍生资产纳入统一的标签、搜索、预览、再处理生命周期

### 1.4 现有提取实现适合 MVP，不适合长期演进

当前自研提取器适合验证方向，但不适合继续无限扩张。后续如果要支持更稳定的：

- PDF
- DOCX
- PPTX
- XLSX
- 图片 OCR 后转 Markdown
- 邮件 / 网页 / 其他富文档

继续沿用“每种格式一套手工解析器”的方式，维护成本会持续上升。

---

## 二、现状基线

以下现状来自当前代码库：

### 2.1 原件上传与 AI 打标

- 原件拖入后在 `src-tauri/src/commands/dropzone.rs` 中落库
- AI 分类结果通过 `apply_llm_classify_to_asset(...)` 写入 `ai_analyses`
- 标签通过 `db::tag::link_to_asset(&conn, &asset.id, &tag.id)` 只绑定到原始素材

结论：**标签绑定目标当前被硬编码为原始 asset**。

### 2.2 提取后物化 Markdown

- 提取调度在 `src-tauri/src/extraction/scheduler.rs`
- `materialize_md(...)` 会在工作区写出新的 `.md` 文件
- 衍生文件被写成新的 `Asset`
- 该衍生资产会记录 `source_asset_id = Some(source_asset.id.clone())`

结论：**数据模型已经意识到“衍生资产”存在，但没有配套继承规则。**

### 2.3 当前模型具备可扩展前提

`assets.source_asset_id` 已存在，这说明系统已经具备最基本的“原件 -> 衍生件”链路表达能力。真正缺的是：

- 资产家族（asset family）定义
- 标签传播策略
- 重复转换幂等策略
- 转换器抽象层

---

## 三、为什么选择 MarkItDown

`MarkItDown` 的角色，不应被定义为“又一个 PDF 转 Markdown 工具”，而应被定义为：

> **NCdesktop 的统一文档标准化引擎。**

根据官方仓库与 PyPI 描述，`MarkItDown` 是 Microsoft 开源的 Python 包/CLI，用于把多种文件格式转换为 Markdown；PyPI 当前稳定版本为 `0.1.5`，发布日期是 **2026-02-20**，要求 **Python >= 3.10**。

它适合作为本项目迭代基础的原因：

### 3.1 统一输出目标

我们的系统下游真正需要的不是“读懂 DOCX/PDF/PPTX 的内部结构”，而是：

- 稳定文本
- 尽可能保留语义结构
- Markdown 作为统一中间表示

MarkItDown 正好提供这个统一层。

### 3.2 减少格式解析维护面

把大量 Office / PDF 的结构提取工作外包给一个成熟开源组件，可以显著减少 Rust 侧手工解析负担，使本项目聚焦在：

- 资产治理
- 标签传播
- 质量判定
- 搜索与知识下游

### 3.3 更适合作为“转换管线”而不是“单个提取器”

MarkItDown 更适合放在提取体系的中间层：

`原件 -> 标准化转换 -> Markdown -> 质量评估 -> 衍生资产治理 -> 下游知识处理`

而不是只把它塞进 `pdf.rs` 替换现有实现。

---

## 四、总体设计原则

本次迭代必须遵守以下原则：

### 原则一：先修复资产治理，再替换转换器

如果不先定义“原件与衍生件的关系”，直接引入 MarkItDown，只会把当前 bug 扩大到更多格式。

### 原则二：Markdown 是统一中间表示，不是最终真相

原件仍然是法律意义和回溯意义上的 source of truth。Markdown 是为了：

- 阅读
- 检索
- 摘要
- 知识抽取

不能让衍生 Markdown 反过来覆盖原件事实。

### 原则三：标签默认继承，但需要可解释规则

标签传播不能是隐式魔法，必须明确：

- 哪些标签从原件同步到衍生件
- 衍生件新增标签是否反向同步原件
- 用户手动标签与 AI 建议标签是否同权

### 原则四：转换必须幂等

同一原件多次重跑转换，不应无限生成新的 `.md` 资产副本。

### 原则五：保留分级回退

MarkItDown 不是银弹。对 OCR、音频、扫描型 PDF，仍应允许保留现有专长链路作为 fallback 或前置步骤。

---

## 五、目标状态

本轮迭代的目标不是“换库”，而是把系统升级为下面这条稳定链路：

```text
上传原件
  -> 创建原始 Asset
  -> 进入标准化转换管线
  -> 产出 Markdown 结果与质量报告
  -> 幂等写入 / 更新衍生 Markdown Asset
  -> 建立原件与衍生件资产家族关系
  -> 标签自动继承
  -> 搜索 / 预览 / 知识抽取统一基于衍生 Markdown 工作
```

用户侧应感知到的结果只有三点：

1. 文件转 Markdown 更稳定，结构更好。
2. 工作区生成的 `.md` 文件自动带上原文件标签。
3. 重复导入或重复提取不会生成一堆脏副本。

---

## 六、核心架构决策

### 6.1 引入“资产家族”概念

虽然短期可以继续复用 `source_asset_id`，但从规划上必须明确：

```typescript
AssetFamily
- rootAssetId
- memberAssetIds[]
- canonicalTextAssetId
- derivativeKinds[]
```

在第一阶段不强制新建表，但所有实现必须按这个概念设计。

短期落地规则：

- 原始上传文件是 root asset
- 由转换产出的 `.md` 是 derivative asset
- `source_asset_id` 指向 root asset
- 同一个 root asset 只能存在一个“当前有效”的 canonical markdown derivative

### 6.2 标签传播规则

定义三条硬规则：

1. 原件已有标签，在创建衍生 `.md` 时必须自动复制到衍生资产。
2. 原件新增标签后，默认同步到 canonical `.md` 衍生件。
3. 衍生件上新增的人工标签，默认不反向写回原件，除非后续单独设计“双向同步”。

这样做的理由：

- 原件到衍生件是“语义继承”
- 衍生件到原件不一定成立，因为衍生件可能承载后续加工语义

### 6.3 转换器抽象升级

将当前 `Extractor` 概念升级为两层：

```text
Detector / Preprocessor
  -> Converter
  -> QualityEvaluator
  -> Materializer
```

建议职责：

- `Detector`：识别文件类型、是否扫描件、是否需要 OCR
- `Preprocessor`：如图片 OCR、扫描 PDF OCR、音频转写
- `Converter`：统一输出 Markdown，MarkItDown 是主实现
- `QualityEvaluator`：判断结构质量、空内容、表格/列表保真度
- `Materializer`：幂等写入衍生文件与资产关系

### 6.4 MarkItDown 的接入方式

建议采用 **Python 子进程 / CLI 适配层**，而不是把 Python 逻辑硬嵌进 Rust 进程内。

原因：

- 与官方使用方式一致
- 易于独立升级
- 出错边界清晰
- 便于本地诊断

推荐形态：

```text
Rust scheduler
  -> invoke converter adapter
  -> adapter 调用 python -m markitdown / markitdown CLI
  -> stdout 返回 markdown
  -> stderr 与 exit code 回收为结构化错误
```

### 6.5 转换结果必须带元数据

每次转换除了 Markdown 文本，还应记录：

- converter_name
- converter_version
- source_mime
- source_hash
- conversion_started_at
- conversion_completed_at
- quality_level
- fallback_used
- error_class

这决定后续能否追踪“哪类文件转换质量差”。

---

## 七、分阶段迭代计划

### Phase 0：先止血，修复标签继承缺陷

**目标**：不等 MarkItDown 接入，先修复当前最明显的用户感知 bug。

范围：

- 在 `materialize_md(...)` 创建衍生资产后，复制原件标签到衍生资产
- 为原件新增标签时，补同步到其 canonical `.md`
- 为前端工作区视图补验证，确保过滤标签时原件和衍生件都可见

交付标准：

- 上传 PDF 后生成的 `.md` 在 Inspector 和 TagTree 中可见标签
- 通过标签筛选时，衍生 `.md` 不再掉队

这一步必须先做，因为它是后续所有格式统一之前的架构前提。

### Phase 1：抽象统一转换管线

**目标**：把现有“提取器 + 物化”流程重构成可接入外部转换器的统一管线。

范围：

- 从 `Extractor` 拆出 `ConverterResult`
- 新增转换任务结果模型
- 在 DB 中补充转换元数据字段或新表
- 明确幂等规则：同一 root asset 的 canonical markdown derivative 唯一

此阶段先不接 MarkItDown，只重构骨架。

验收标准：

- 现有 PDF / DOCX / PPTX / text 仍能跑通
- 重跑提取不会重复生成多个 markdown 衍生资产

### Phase 2：接入 MarkItDown 作为主转换器

**目标**：让 PDF / DOCX / PPTX / XLSX / 常见富文档优先走 MarkItDown。

范围：

- 新增 `markitdown_adapter`
- 接入 Python runtime 检测
- 接入版本探测与健康检查
- 为支持格式建立 capability matrix
- 将现有 `pdf_text.rs / docx.rs / pptx.rs` 调整为 fallback 或逐步退役

推荐策略：

- `text/markdown`、`text/plain` 继续走本地轻量路径
- `pdf/docx/pptx/xlsx` 优先走 MarkItDown
- 扫描 PDF 先 OCR，再决定是否交给 MarkItDown 或保留 OCR Markdown
- 音频继续保留现有 ASR 路径，不强行塞给 MarkItDown

验收标准：

- 相同测试样本下，MarkItDown 产出的 Markdown 质量不低于当前实现
- 转换失败时能回退，不阻塞整个提取任务

### Phase 3：质量评估与可观测性

**目标**：让系统知道“转出来了”和“转得好不好”不是一回事。

范围：

- 建立 Markdown 质量评分规则
- 记录结构信号：标题数、列表数、表格数、空行比例、文本长度
- 前端展示转换器类型、质量等级、失败原因
- 给用户一个“重新转换 / 使用备用转换器”的入口

验收标准：

- 用户能分辨“已转换但质量一般”和“转换失败”
- 开发侧能按格式统计失败率与回退率

### Phase 4：资产家族与知识下游彻底对齐

**目标**：让知识抽取、搜索、预览全部基于 canonical markdown derivative 工作。

范围：

- 搜索默认命中 canonical Markdown 内容
- Inspector 显示“原件 / 衍生 Markdown / 来源关系”
- 知识抽取优先消费 canonical Markdown
- 后续允许增加“重新生成 Markdown”而不影响原件 ID

验收标准：

- 下游知识功能不再依赖各格式自定义 raw_text 细节
- 文件格式新增不需要逐个打通知识模块

---

## 八、技术方案细化

### 8.1 数据模型建议

短期可在现有 `assets` 基础上补充以下语义字段或通过新表表达：

```typescript
AssetDerivativeMeta {
  assetId: string;
  rootAssetId: string;
  derivativeKind: 'canonical_markdown' | 'preview_markdown' | 'ocr_text' | 'transcript';
  generator: 'markitdown' | 'pdf_text' | 'pdf_scan_ocr' | 'audio_asr' | 'manual';
  generatorVersion: string;
  sourceHash: string;
  isCanonical: boolean;
  supersedesAssetId: string | null;
}
```

第一版若不愿立即迁表，至少要保证：

- 同一 `source_asset_id + derivativeKind = canonical_markdown` 唯一
- 重跑时更新旧衍生件，而不是盲目插入新 asset

### 8.2 幂等物化策略

当前 `materialize_md(...)` 是“永远创建新 UUID 新文件”。这必须改。

目标策略：

1. 计算原件 `source_hash`
2. 查询该 root asset 是否已有 canonical markdown derivative
3. 若存在且 hash 未变，直接跳过物化
4. 若存在但内容需更新，则覆盖文件并更新同一衍生 asset
5. 若不存在，首次创建

### 8.3 标签继承实现建议

新增统一能力：

```text
propagate_tags_to_derivative(root_asset_id, derived_asset_id)
sync_root_tags_to_canonical_derivatives(root_asset_id)
```

不要把标签复制逻辑散落在：

- dropzone
- extraction scheduler
- inspector 手动打标

标签传播必须抽成公共函数，否则后续必然再次漏链路。

### 8.4 Python / MarkItDown 运行时策略

建议明确三档策略：

1. `bundled`：应用内随包携带 Python 运行时与依赖
2. `managed local env`：首次启动自动创建本地虚拟环境
3. `external python`：开发环境或高级用户手工指定 Python 路径

对于当前桌面产品阶段，建议先做：

- 开发期：`external python`
- 内测期：`managed local env`
- 正式版：再评估 `bundled`

### 8.5 回退链路

建议默认回退如下：

```text
PDF -> MarkItDown -> 如果空/失败 -> pdf_text -> 如果空 -> pdf_scan_ocr
DOCX/PPTX/XLSX -> MarkItDown -> 如果失败 -> 旧实现（若保留）
TXT/MD -> text extractor
Image -> OCR -> Markdown
Audio -> ASR transcript -> Markdown
```

核心原则：**MarkItDown 是主路径，不是唯一路径。**

---

## 九、里程碑与交付节奏

### M1：标签治理修复

- 修复衍生 `.md` 标签继承
- 修复标签筛选覆盖衍生资产
- 建立基础回归测试

### M2：管线抽象完成

- 完成转换器抽象重构
- 物化改为幂等
- 为 MarkItDown 适配预留接口

### M3：MarkItDown 接入完成

- PDF / DOCX / PPTX 主路径切换完成
- 本地健康检查与错误处理完成
- 旧转换器降级为 fallback

### M4：质量与观测面完成

- UI 展示转换来源、质量、错误
- 数据库具备转换元数据
- 能按格式分析失败率

### M5：知识下游切换完成

- 知识提取统一读取 canonical markdown derivative
- 搜索/预览链路一致化

---

## 十、验收标准

### 功能验收

- 上传 PDF / DOCX / PPTX 后，工作区始终能看到对应 `.md`
- 该 `.md` 自动继承原文件标签
- 标签筛选时，原件与 `.md` 都能被命中
- 重复提取同一文件不会不断新增新的 `.md` 副本
- 转换失败时有明确状态与原因，不是假成功

### 质量验收

- 章节标题、列表、表格等结构信息保留优于当前平均水平
- 扫描型 PDF 的空白 Markdown 明显下降
- 低质量转换结果能被识别并提示

### 工程验收

- 转换器接入不把 Python 异常直接泄漏到 UI
- 所有标签传播逻辑只保留一套公共实现
- 转换链路具备单测与最小集成测试

---

## 十一、测试样本集要求

正式切换前必须建立固定样本集，至少覆盖：

- 文字型 PDF
- 扫描型 PDF
- 混合型 PDF（部分可选中文本 + 部分扫描页）
- 结构化 DOCX
- 带层级标题与图片说明的 PPTX
- 包含表格的 XLSX
- 简单 TXT / Markdown
- 中文文件名、空格文件名、超长文件名

每类样本都要评估：

- Markdown 产出是否存在
- 内容长度是否合理
- 标题/列表/表格是否保留
- 标签继承是否正确
- 重跑是否幂等

---

## 十二、风险与边界

### 12.1 不要在第一版追求“所有格式一口气全切”

优先级应该是：

1. PDF
2. DOCX
3. PPTX
4. XLSX

其他格式后置。

### 12.2 不要把“标签继承”做成脆弱事件监听

如果只是依赖前端刷新或某个事件补丁，会再次失效。必须在后端资产治理层做。

### 12.3 不要让 MarkItDown 直接替代 OCR / ASR 专长链路

OCR、音频转写是另一类能力，不应强耦合替换。

### 12.4 不要先做 UI 再补底层

当前问题本质在资产生命周期，不在界面。

---

## 十三、实施顺序建议

建议严格按以下顺序推进：

1. 修复衍生资产标签继承 bug
2. 抽象衍生资产物化与幂等更新
3. 抽出统一标签传播服务
4. 接入 MarkItDown 适配层
5. 对 PDF / DOCX / PPTX 切主路径
6. 补质量评估与失败回退
7. 最后再做 UI 可视化增强

这个顺序不能反。否则你会得到一个“转换器更先进，但资产关系仍然混乱”的系统。

---

## 十四、本宪章对应的首批开发任务

### Task A：修复当前 bug

- 为 `materialize_md(...)` 增加原件标签复制
- 为原件加标签操作增加衍生件同步
- 为标签筛选视图补回归测试

### Task B：重构物化策略

- 查询已存在 canonical markdown derivative
- 改为更新而不是无脑插入
- 衍生资产增加生成来源元数据

### Task C：创建 MarkItDown 适配层

- 新增运行时检测
- 新增调用封装
- 新增标准化错误模型

### Task D：建立样本集

- 固定一组真实测试文档
- 对比当前实现与 MarkItDown 结果
- 输出格式质量对比基线

---

## 十五、最终判断标准

本次迭代何时算成功，不看“是否用了 MarkItDown”，而看三件事：

1. 用户上传任意主流学习文档后，都能稳定得到一个可读的 Markdown 衍生件。
2. 这个衍生件在系统里不是孤儿，而是原件资产家族的一部分，并自动继承标签。
3. 下游知识功能消费的是统一的 canonical Markdown，而不是继续被不同格式解析细节拖着走。

只要这三件事成立，这次迭代就是正确的；如果只是把转换器换成 MarkItDown，但资产治理和标签传播仍然混乱，这次迭代就不算完成。
