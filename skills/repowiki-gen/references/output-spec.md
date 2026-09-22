# output-spec: Repo Wiki 输出规格

> 定义 OKF bundle 的目录组织、frontmatter 约定、模块文件与文章原型、命名与链接纪律。

## 1. 目录组织

```
docs/repowiki/                        # OKF bundle 根
├── index.md                          # 路由入口：模块清单 + 文章清单（含公共 frontmatter 字段归集）
├── knowledge/                        # 知识族：一模块一文件
│   ├── <模块名>.md                   # 模块文件（名字跟随项目语言，如 CLI-工具.md）
│   └── <父模块>/                     # 仅父模块聚合时用目录：放 README.md（涌现知识）+ 子模块文件
│       ├── README.md                 # 父模块聚合（跨子模块才存在的东西）
│       ├── <子模块A>.md
│       └── <子模块B>.md
├── content/                          # 文章族：叙述性文档（可多级目录）+ repo 级收敛卡
│   ├── <顶层文章>.md                 # overview / getting_started / developer_guide
│   ├── <域目录>/<文章>.md            # domain / deep_dive
│   ├── 技术栈.md                     # 可选·repo 级收敛（仅非默认信号，scopes: ["**"]）
│   └── 特殊配置与命令.md              # 可选·repo 级收敛（仅非默认信号，scopes: ["**"]）
├── meta/                             # 预留：行级引用登记（暂不落盘）
└── log.md                            # 生成日志（finalize 写入）
```

- **两族分工**：`knowledge/` 面向"读某个模块"（一模块一文件，段内 category 精确命中）；`content/` 面向"读某条叙事"（导览、流程、深入分析）+ repo 级收敛（全仓技术栈/配置命令）。
- **段内五维（category 基线）**：模块文件内以 `## 标题 <!-- category:x -->` 承载五维——`overview`（必填首段）/ `architecture_design` / `tech_stack` / `coding_conventions` / `unique_setup_and_commands`；缺段省略，不建空段。自定义维度同为段（`## 语义化标题 <!-- category:<ascii> -->`，每模块 ≤2 个）。
- 产物为**单语言**，不设 `<lang>` 层；语言默认跟随项目，可由 `.repowiki/config.json` 的 `language` 覆盖。
- `meta/` 为将来行级引用登记预留，当前**不创建空目录**（git 不追踪空目录）。

## 2. Frontmatter 约定

### 2.1 模块文件（`knowledge/` 一模块一文件）

```yaml
---
description: 一句话描述（≤30 词）   # 必填：本模块一句话
module: cli                        # 必填：模块 slug（ascii，与 plan.json modules[].slug 一致）
source_files: ["bin/**"]           # 必填：模块 scope（数组，与 plan.json 一致，供 status/sources 推导）
updated_at: 2026-09-22            # 可选：等价字段（最后生成日期）
---
```

去重规则：公共字段（`status` / `type` / `triggers` / `generated` / `source_commit` / `generator`）只进 `index.md` 归集，不在每个模块文件重复；模块文件仅保留 `description` + 模块身份（`module` / `source_files` / `updated_at` 等价字段）。validate 对 `knowledge/` 只校验本节字段（`description` + `module` 必填），不再要求 `dimension`。

### 2.2 文章

```yaml
---
status: stable                    # 必填：stable|draft|deprecated
type: domain                      # 必填：overview|getting_started|domain|deep_dive|developer_guide
triggers: [支付流程, 交易处理]       # 必填
description: 一句话描述（≤30 词）   # 必填
generated: true
source_commit: <sha>
generator: repowiki-gen
---
```

### 2.3 根 index.md（含公共字段归集）

```yaml
---
okf_version: 1                    # OKF 格式版本
description: 项目整体一句话介绍     # 可选
status: stable                    # 公共字段归集（全 bundle 默认状态，各页无 frontmatter status 时继承）
type: module                      # 兼容保留（knowledge 族默认值说明）
generated: true                   # 机器生成标记（归集）
source_commit: <sha>              # 生成时的 HEAD commit（归集）
generator: repowiki-gen           # 生成器标识（归集）
---
```

根 index.md 允许以上字段；模块文件不再重复它们（见 §2.1 去重规则）。

### 2.4 log.md

无 frontmatter（finalize 写入的生成日志），validate 豁免其 frontmatter 检查。

### 2.5 保护标记

```yaml
---
protected: true                   # 可选：显式锁定，永久跳过自动重生成（--force 除外）
---
```

## 3. 模块文件原型（一模块一文件）

执行粒度：同模块文件由同一 agent 一次写完（禁按段拆分），细则见 `pipeline.md` §3。

### 3.1 category 值域（段内 `## 标题 <!-- category:x -->`）

| category | 段标题示例（中文/英文） | 承载内容 |
|---|---|---|
| overview | 概述 / Overview（必填首段） | 模块定位、职责边界 |
| architecture_design | 架构设计 / Architecture | 内部结构、分层、关键流程、依赖关系 |
| tech_stack | 技术栈 / Tech Stack | 仅非默认且具解释力的技术选型 |
| coding_conventions | 编码规范 / Coding Conventions | ≤6 条已在 ≥2 处验证的惯例 |
| unique_setup_and_commands | 特殊配置与命令 / Setup & Commands | 仅非显而易见的配置/命令 |

自定义维度同为段：`## 语义化标题 <!-- category:<ascii> -->`（如 `dependency_management`），触发判据与旧自定义卡相同（五维无法承载 + 高命中率主题），每模块 ≤2 个，宁缺毋滥；无真实信号则不建。缺段省略，不建空段。

### 3.2 必备段落

| category | 段内小节 |
|---|---|
| overview | 模块定位（一段）、职责边界（做什么/不做什么） |
| architecture_design | 内部结构、关键流程（可含 Mermaid）、依赖关系 |
| tech_stack | 选型表（技术 / 用途 / 为什么） |
| coding_conventions | 条目列表；每条附验证依据（≥2 处源码引注） |
| unique_setup_and_commands | 环境配置、构建与运行、测试与调试（仅非显而易见者） |

### 3.3 `## 关系`（可选三向）

模块文件末尾可选 `## 关系`段：`依赖`（本模块依赖谁）/ `被依赖`（谁依赖本模块）/ `相关`（弱相关模块，配一句话理由）。只写已验证的关系，不灌水。

### 3.4 模板

```markdown
---
description: 认证模块一句话
module: auth
source_files: ["src/auth/**"]
---

# 认证模块

## 概述 <!-- category:overview -->

<!-- 模块定位一段 + 职责边界（做什么/不做什么） -->

## 架构设计 <!-- category:architecture_design -->

### 内部结构

<!-- 目录组织、核心文件/类型，可带简要目录树 -->

### 关键流程

<!-- 主要数据流/状态机，可带 Mermaid 图（图后附图表来源） -->

### 依赖关系

<!-- 模块间/外部依赖 -->

## 编码规范 <!-- category:coding_conventions -->

<!-- 条目列表；每条附验证依据 -->

## 关系

- 依赖：支付模块（调用其验签接口）
- 被依赖：（无）
- 相关：会话模块（共享 token 语义）
```

## 4. 文章写作契约

执行粒度：文章不单独派生 agent（归属模块 agent 写草稿，主 agent 合成落盘），细则见 `pipeline.md` §4.2。

### 4.1 五类文章与章节模板

| type | 定位 | 章节模板 |
|---|---|---|
| overview | 项目总览 | 引言 / 项目结构 / 核心组件 / 架构总览 / 快速链接 |
| getting_started | 上手引导 | 环境要求 / 安装 / 构建 / 运行 / 典型工作流 |
| domain | 领域叙事（可含子文章） | 领域模型 / 核心概念 / 关键流程 / 模块边界 |
| deep_dive | 单域深入（叶子） | 内部结构 / 关键接口 / 实现细节 / 扩展点 |
| developer_guide | 开发者指南（叶子） | 开发环境 / 编码规范 / 测试 / 调试 / 发布 |

### 4.2 固定骨架

```markdown
# 文章标题                        <!-- H1 与文件名一致 -->

<cite>
**本文引用的文件**
- [src/foo/bar.ts](file://src/foo/bar.ts)
</cite>

## 更新摘要                        <!-- 仅增量更新既有文章时保留/更新；首次生成省略 -->
**变更内容**
- 基于 xxx 更新了 yyy

## 目录                            <!-- 二级章节 ≥3 时写 -->
1. [引言](#引言)

## 引言

<!-- 正文分节（按类型模板展开） -->

（每个 Mermaid 图后）
图表来源
- [src/foo/bar.ts:13-33](file://src/foo/bar.ts#L13-L33)

（引用具体源码段落的节末，可选）
章节来源
- [src/foo/bar.ts:45-60](file://src/foo/bar.ts#L45-L60)
```

- 增量更新时，可在被修改的节内以 `**更新** <一句话>` 标注局部变更。

### 4.3 引注与图表

- 源码引注严格格式：展示 `[src/foo/bar.ts:15-30]`，链接 `file://src/foo/bar.ts#L15-L30`（**仓库相对路径**）。
- Mermaid 严格语法：禁用 `style` / `classDef` / `linkStyle` 等样式指令；节点 ID 用 ASCII 短标识；含特殊字符的节点标签加引号。
- 有图必须带**图表来源**；引用具体源码段落处带**章节来源**；纯抽象段落不带。

### 4.4 写作纪律

- **自底向上**：先生成子文章；父文章写作时读取直接子文章的 `summary` / `key_topics` 做综述合成与交叉引用。
- **字数软上限**：plan 中的 `max_article_words`，超出 10% 必须缩减。
- **严禁退化清单（NEVER）**：
  - 一模块一文章；按层命名（"Controllers"、"Repositories"）。
  - 跳过任何模块（每个模块必须至少出现在一篇文章的 `modules` 中）。
  - 空 `modules` 数组；文章内嵌文章；子文章越出父文章范围。
  - 超出 caps；objective 规定内容结构而非范围；非法 type。
  - 对叶子类型（`getting_started` / `developer_guide` / `deep_dive`）设 `need_further_planning`。
- **自检**：H1 与文件名一致、无外层代码围栏、无残留标签、正文语言与项目一致、引注格式合规。

## 5. 源码回溯纪律

- bundle 外源码：`[src/foo/bar.ts:15-30](file://src/foo/bar.ts#L15-L30)`（file:// 链接不参与 bundle 链接校验）。
- bundle 内互引用：相对路径——同族 `[支付模块](支付模块.md)`；跨族 `[子文章](../content/域目录/子文章.md)`；段锚 `[架构设计](认证模块.md#架构设计)`。
- 重要结论带行号级引注；纯抽象段落可免。

## 6. 页面命名

- 文件名与目录名 = **显示名**，跟随项目文档语言（中文项目：`CLI-工具.md`、`支付域/`；英文项目：`payment.md`、`payment/`）。
- 规范化：空格 → `-`；剔除 `\ / : * ? " < > |` 与控制字符；不以 `.` 开头/结尾。
- `slug` 是计划文件中的 ascii 机器身份（`^[a-z0-9_-]{1,40}$`，全局唯一）；**不进入文件名，也不用于链接**。模块文件名规范化自 `modules[].dir`（一模块一文件：`knowledge/<dir>.md`）。
- `index.md` 与 `log.md` 为保留名，不得用作模块文件名或文章名。

## 7. 交叉链接与可达性

- 模块文件无需卡片导航（各 category 同文件段内直达）；跨模块引用链到对方模块文件（可带段锚）。
- 父文章必须链接其**直接子文章**。
- `index.md` 必须链接：每个模块文件 + 每篇顶层文章。
- **可达性**：除 `index.md` 与 `log.md` 外，所有页面必须能从 `index.md` 经链接到达（validate 兜底检查）；围栏代码块与行内代码中的示例链接不参与检查。

## 8. index.md 清单格式

```markdown
---
okf_version: 1
description: <项目一句话介绍>
status: stable
generated: true
source_commit: <sha>
generator: repowiki-gen
---

# <项目名> 知识库

<一段总览：项目定位与技术栈概述>

## 模块知识

- [认证模块](knowledge/认证模块.md) — <一句话>｜段：概述 · 架构设计 · 编码规范
- [支付模块](knowledge/支付模块.md) — <一句话>

## 文章

- [项目总览](content/项目总览.md)
- [快速开始](content/快速开始.md)
- 支付域
  - [支付流程](content/支付域/支付流程.md)
```
