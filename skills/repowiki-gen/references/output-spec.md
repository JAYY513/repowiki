# output-spec: Repo Wiki 输出规格

> 定义 OKF bundle 的目录组织、frontmatter 约定、知识卡与文章原型、命名与链接纪律。

## 1. 目录组织

```
docs/repowiki/                        # OKF bundle 根
├── index.md                          # 路由入口：模块清单 + 文章清单
├── knowledge/                        # 知识族：模块级结构化知识
│   └── <模块名>/                     # 一模块一目录（名字跟随项目语言）
│       ├── 概述.md                   # 锚文档（必填）
│       ├── 架构设计.md
│       ├── 技术栈.md                 # 可选（仅非默认选型）
│       ├── 编码规范.md               # 可选（仅已验证惯例）
│       ├── 特殊配置与命令.md          # 可选（仅非显而易见）
│       └── <语义化标题>.md            # 可选·自定义维度（≤2 张，dimension 自定义值）
├── content/                          # 文章族：叙述性文档（可多级目录）
│   ├── <顶层文章>.md                 # overview / getting_started / developer_guide
│   └── <域目录>/<文章>.md            # domain / deep_dive
├── meta/                             # 预留：行级引用登记（暂不落盘）
└── log.md                            # 生成日志（finalize 写入）
```

- **两族分工**：`knowledge/` 面向"读某个模块的某类知识"（维度级精确命中）；`content/` 面向"读某条叙事"（导览、流程、深入分析）。
- **维度两档**：五维默认卡（自动基线，文件名即维度名）+ 自定义维度卡（语义化文件名，`dimension` 自定义 ascii 值，每模块 ≤2 张）——五维基线 + `<!-- category:x -->` 开放分类扩展。
- 产物为**单语言**，不设 `<lang>` 层；语言默认跟随项目，可由 `.repowiki/config.json` 的 `language` 覆盖。
- `meta/` 为将来行级引用登记预留，当前**不创建空目录**（git 不追踪空目录）。

## 2. Frontmatter 约定

### 2.1 知识卡

```yaml
---
status: stable                    # 必填：stable|draft|deprecated
type: module                      # 必填：知识族固定为 module
dimension: overview               # 必填：卡片维度（值域见 §3.1）
triggers:                         # 必填：维度级任务意图列表（读取命中的命脉）
  - 认证流程
  - 登录
description: 一句话描述（≤30 词）   # 必填
generated: true                   # 机器生成标记
source_commit: <sha>              # 生成时的 HEAD commit
generator: repowiki-gen           # 生成器标识
---
```

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

### 2.3 根 index.md

```yaml
---
okf_version: 1                    # OKF 格式版本
description: 项目整体一句话介绍     # 可选
---
```

根 index.md **仅允许** `okf_version` 与 `description` 两个字段。其他字段计入 validate warnings。

### 2.4 log.md

无 frontmatter（finalize 写入的生成日志），validate 豁免其 frontmatter 检查。

### 2.5 保护标记

```yaml
---
protected: true                   # 可选：显式锁定，永久跳过自动重生成（--force 除外）
---
```

## 3. 知识卡原型

### 3.1 维度值域

**五维默认卡**（自动基线）：

| dimension | 中文项目示例 | 英文项目示例 | 承载内容 |
|---|---|---|---|
| overview | 概述.md | overview.md | 模块定位、职责边界、卡片导航（**锚文档**） |
| architecture | 架构设计.md | architecture.md | 内部结构、分层、关键流程、依赖关系 |
| tech_stack | 技术栈.md | tech-stack.md | 仅非默认且具解释力的技术选型 |
| coding_conventions | 编码规范.md | coding-conventions.md | ≤6 条已在 ≥2 处验证的惯例 |
| setup | 特殊配置与命令.md | setup-and-commands.md | 仅非显而易见的配置/命令 |

**自定义维度卡**（开放扩展，`## 标题 <!-- category:x -->` 标记）：

- 触发判据：五维无法承载、且对任务意图有高命中率的知识主题（数据模型、协议契约、错误语义、依赖治理、故障排查等）。
- 文件名 = **语义化标题**（跟随项目文档语言，如 `依赖治理.md`）；`dimension` 用自定义 ascii 值（如 `dependency_management`），语义稳定、同 bundle 内不冲突。
- frontmatter、triggers、引注纪律与五维卡相同；加入 `概述.md` 卡片导航。
- 每模块 ≤2 张，宁缺毋滥；无真实信号则不建。

- **文件名跟随项目文档语言**；`dimension` 是语言无关的机器语义（validate 与读取路由依赖它，值域开放——只校验存在性与目录锚 `overview`）。
- 可选卡（含自定义卡）仅在内容非默认、具解释力时创建（宁缺毋滥）。

### 3.2 必备小节

| 卡 | 小节 |
|---|---|
| 概述 | 模块定位（一段）、职责边界（做什么/不做什么）、卡片导航（链接本模块其他卡） |
| 架构设计 | 内部结构、关键流程（可含 Mermaid）、依赖关系 |
| 技术栈 | 选型表（技术 / 用途 / 为什么） |
| 编码规范 | 条目列表；每条附验证依据（≥2 处源码引注） |
| 特殊配置与命令 | 环境配置、构建与运行、测试与调试（仅非显而易见者） |

### 3.3 模板

```markdown
---
status: stable
type: module
dimension: architecture
triggers: [架构设计, 模块结构, 扩展点]
description: 认证模块的内部分层与关键流程
generated: true
source_commit: <sha>
generator: repowiki-gen
---

# 认证模块 · 架构设计

## 内部结构

<!-- 目录组织、核心文件/类型，可带简要目录树 -->

## 关键流程

<!-- 主要数据流/状态机，可带 Mermaid 图（图后附图表来源） -->

## 依赖关系

<!-- 模块间/外部依赖 -->
```

## 4. 文章写作契约

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
- bundle 内互引用：相对路径——同目录 `[架构设计](架构设计.md)`；跨目录 `[子文章](../域目录/子文章.md)`。
- 重要结论带行号级引注；纯抽象段落可免。

## 6. 页面命名

- 文件名与目录名 = **显示名**，跟随项目文档语言（中文项目：`概述.md`、`支付域/`；英文项目：`overview.md`、`payment/`）。
- 规范化：空格 → `-`；剔除 `\ / : * ? " < > |` 与控制字符；不以 `.` 开头/结尾。
- `slug` 是计划文件中的 ascii 机器身份（`^[a-z0-9_-]{1,40}$`，全局唯一）；**不进入文件名，也不用于链接**。
- `index.md` 与 `log.md` 为保留名，不得用作模块目录名或文章名。

## 7. 交叉链接与可达性

- 每个模块的 `概述.md` 必须含**卡片导航**链接（→ 同目录其他卡）。
- 父文章必须链接其**直接子文章**。
- `index.md` 必须链接：每个模块的概述卡 + 每篇顶层文章。
- **可达性**：除 `index.md` 与 `log.md` 外，所有页面必须能从 `index.md` 经链接到达（validate 兜底检查）；围栏代码块与行内代码中的示例链接不参与检查。

## 8. index.md 清单格式

```markdown
---
okf_version: 1
description: <项目一句话介绍>
---

# <项目名> 知识库

<一段总览：项目定位与技术栈概述>

## 模块知识

- [认证模块](knowledge/认证模块/概述.md) — <一句话>｜卡：概述 · 架构设计 · 编码规范
- [支付模块](knowledge/支付模块/概述.md) — <一句话>

## 文章

- [项目总览](content/项目总览.md)
- [快速开始](content/快速开始.md)
- 支付域
  - [支付流程](content/支付域/支付流程.md)
```
