# pipeline: Repo Wiki 生成流水线参考

> 生成流水线各阶段指引，供 agent 执行时参考。

---

## 1. Budget 评估

### 定位

快速判定仓库规模档位，限定整次生成的模块数、深度上限与文章 caps。

### 输入

- scan 输出的统计（文件数、语言分布）
- README 或项目描述
- 根目录与各顶层区域列表
- 独立子系统数量（若不确定时）

### 档位与 caps

| 档位 | 条件 | MaxTotalModules | MaxDepth | max_total_articles | max_top_articles | max_sub_per_parent | max_article_words |
|---|---|---|---|---|---|---|---|
| 扁平单层 | <50 文件，单层结构 | 2 | 1 | 6 | 3 | 3 | 1500 |
| 模块树 | 50-500 文件，多层目录 | 8 | 2 | 30 | 8 | 5 | 2500 |
| 深度限制 | >500 文件或复杂多模块 | 20 | 3 | 60 | 10 | 7 | 3000 |

### 原则

- 是在 sizing 仓库，不是在 mapping 仓库——不需要枚举每个 controller/service
- 跳过 vendor/node_modules/dist/build/target 等目录
- 不要重复调用同一工具同一参数
- 结束标志：纯文本中写档位 JSON（`{"tier":"<档位>","reason":"...","caps":{...}}`）

---

## 2. 模块树规划

### 定位

从根开始递归地把仓库拆成模块树。每次调用处理一个节点，输出 `split`（拆出 children）或 `stop`（成为叶子）。

### split/stop 决策

- **split**：该节点包含多个独立子系统，需进一步拆分
- **stop**：该节点是叶子模块（单一功能集），不再拆分

### 输出格式

```json
{
  "split_decision": "split|stop",
  "children": [
    {
      "slug": "snake_case",
      "title": "显示名（项目文档语言）",
      "dir": "knowledge/ 下的目录名（规范化自 title，空格→-）",
      "scope": ["src/path/**"],
      "needs_further_planning": true,
      "guidance": "下一层拆分轴建议"
    }
  ]
}
```

### 约束

- slug 规则：`^[a-z0-9_-]{1,40}$`（ascii 机器身份，全局唯一）
- title/dir 跟随项目文档语言（中文项目：title=支付模块、dir=支付模块；英文项目：title=Payment、dir=payment）
- 少于 3 个源文件的模块并入兄弟模块
- depth == max_depth 时必须 stop
- RemainingModuleBudget 全局预算递减

### 覆盖率要求

所有源文件至少被一个模块的 scope 覆盖。未覆盖文件在 plan.json 的 `coverage_check.uncovered` 中列出。

---

## 3. 知识合成

### 定位

对每个模块产出结构化知识，直接落为 `knowledge/<dir>/` 下的五维知识卡。叶子模块从源码抽取；父模块从子模块摘要合成"涌现知识"（只有跨子模块才存在的东西）。

### 叶子模块（leaf）

- 读取 1-3 个高信号文件（入口/清单/接口）
- 用 grep 验证编码惯例是否在 ≥2 处出现后才写入
- 连续 3 次空结果 → 产出最小字段并停止

### 父模块（aggregate）

- 只写跨子模块才存在的东西（编排/契约/共享设施）
- 如果子模块摘要已覆盖全部内容，只产出最小字段，不许灌水
- 工具调用应罕见（优先读子模块摘要而非源码）

### 五维知识字段 → 五卡映射

| 字段 | 必填 | 目标卡（dimension） | 说明 |
|---|---|---|---|
| name + 职责边界 | 是 | 概述.md（overview） | 语义化模块名 + 做什么/不做什么（锚文档） |
| architecture_design | 是 | 架构设计.md（architecture） | 内部结构/分层/边界 |
| tech_stack | 否 | 技术栈.md（tech_stack） | 仅非默认且具解释力的技术选型 |
| unique_setup_and_commands | 否 | 特殊配置与命令.md（setup） | 仅非显而易见的步骤/命令 |
| coding_conventions | 否 | 编码规范.md（coding_conventions） | ≤6 条，每条需在 ≥2 处验证过 |

可选卡仅在字段非空时创建（宁缺毋滥）。

### 接地规则

- 拒绝"代码清单式知识"（"本模块有 N 个文件"）
- 拒绝"默认语言/框架约定"（"用了 Go modules"）
- 断言强度校准：必须/永远/只能等措辞仅当权威来源明说或实现强制时才用
- 不许全称量化（all/every/the only）超出已验证范围
- 字段去重：description 出现过的，architecture_design 不重复

---

## 4. 文章大纲与写作

### 4.1 大纲规划

- 输入：模块树（路径 + 描述 + `[N sub-modules]` 提示）、caps 配置、既有大纲（增量时，需保留结构）
- 类型决策：

| 类型 | 何时使用 | 是否可作父 |
|---|---|---|
| overview | 项目级总览（1 篇，覆盖全部模块） | 否 |
| getting_started | 上手引导（1 篇） | 否 |
| domain | 功能域聚合（紧密相关模块合并候选） | 是 |
| deep_dive | 单域深入（子层主力） | 否 |
| developer_guide | 开发工作流 | 否 |

- 过程：
  1. 按功能聚合模块成顶层候选（紧密相关模块合并为一个 domain 候选）
  2. 应用 max_top_articles 收敛：超限按模块文件数排序，溢出合并到兄弟文章
  3. 判定拆父：子树 ≥4 个模块 且 ≥3 个子域 且 预估内容 > max_article_words
  4. 子层规划：子文章 `modules` 必须是父文章 `modules` 的子集；单层输出、逐层递归
- NEVER 清单（禁止的退化）：
  - 一模块一文章；按层命名（"Controllers"、"Repositories"）
  - 跳过任何模块；空 `modules` 数组
  - 文章内嵌文章（单层输出）；子文章越出父范围
  - 超 caps；objective 规定内容结构而非范围；非法 type
  - 叶子类型（getting_started / developer_guide / deep_dive）设 `need_further_planning`
- 覆盖校验：每个模块至少出现在一篇文章的 `modules` 中；文章总数 ≤ max_total_articles
- slug：`^[a-z0-9_-]{1,40}$` 全局唯一；title 1-6 词；`file` = `content/` 下按显示名规范化的相对路径

### 4.2 写作（自底向上）

- 顺序：按 `parent` 拓扑排序，先子后父；每篇产出 `summary` + `key_topics`（供父文合成与续跑）
- 父文章输入：子文章 summary/key_topics + 模块知识（Per-Module Knowledge）+ 模块引用（path→display name）
- 成品骨架：`# 标题` + `<cite>` 引用文件列表 + `## 更新摘要`（增量时）+ `## 目录`（≥3 节时）+ 类型章节模板 + Mermaid（图后附图表来源/章节来源）
- 引注格式：

```markdown
[main.go:15-30](file://main.go#L15-L30)
```

- 交叉引用（bundle 内相对路径）：

```markdown
[子文章标题](../域目录/子文章.md)
```

- 各类型章节模板：

| 类型 | 章节结构 |
|---|---|
| overview | 引言、项目结构、核心组件、架构总览、快速链接 |
| getting_started | 环境要求、安装、构建、运行、典型工作流 |
| domain | 领域模型、核心概念、关键流程、模块边界 |
| deep_dive | 内部结构、关键接口、实现细节、扩展点 |
| developer_guide | 开发环境、编码规范、测试、调试、发布 |

- 输出格式（写作契约）：

```json
{
  "summary": "一句话摘要",
  "key_topics": ["主题1", "主题2"],
  "content": "# 标题\n正文..."
}
```

- 关键原则：
  - summary ≤2 句，key_topics ≤6 个
  - content 使用 Markdown，标题从 H1 开始；无外层围栏、无残留标签
  - 字数软上限 max_article_words（超 10% 必须缩减）
  - Mermaid 严格语法：禁用 style/classDef/linkStyle 等样式指令；节点 ID 用 ASCII；图后附图表来源
  - bundle 内引用必须是可解析的相对路径（validate 兜底检查）

---

## 5. 校验规则

### validate 检查项

| 检查项 | 级别 | 说明 |
|---|---|---|
| docs/repowiki/ 存在 | error | 目录缺失 |
| index.md 存在 | error | 路由入口缺失 |
| frontmatter 必填字段 | error | status/type/triggers/description（知识卡另需 dimension） |
| status 值域 | error | stable/draft/deprecated |
| type 值域按族 | error | knowledge/ → module；content/ → overview/getting_started/domain/deep_dive/developer_guide |
| 根 index.md 字段限制 | warning | 仅 okf_version/description |
| 知识模块目录锚 | warning | knowledge/<dir>/ 需有 dimension: overview 的卡 |
| 目录 index/overview（非两族目录） | warning | 其他子目录应有 index.md 或 overview.md |
| bundle 相对链接 | warning | 目标文件须存在（锚点与百分号编码已归一；代码块与行内示例跳过） |
| 链接可达性 | warning | 除 index.md/log.md 外所有页可从 index.md 到达 |
| plan.json（v2）一致性 | warning | 计划文章文件与模块目录存在 |
| log.md | 豁免 | 不做 frontmatter 检查 |
| Mermaid 语法 | — | P0 不做校验 |

### 退出码

| 退出码 | 含义 |
|---|---|
| 0 | 无错误（可能有 warnings） |
| 1 | 有错误 |

---

## 6. 断点续跑与状态

### run.json 结构

```json
{
  "pid": 12345,
  "phase": "generate",
  "started_at": "ISO 8601",
  "written_pages": ["knowledge/支付模块/概述.md", "content/支付域/支付流程.md"],
  "article_summaries": {
    "payment-flow": { "summary": "……", "key_topics": ["…"] }
  }
}
```

### 续跑逻辑

1. 启动时检查 `.repowiki/run.json`
2. 如果有存活 pid → 并发互斥，拒绝启动
3. 如果 pid 不存活（崩溃遗留）→ 跳过已写页面（及已合成文章 summary），继续处理未完成模块
4. finalize 成功后删除 run.json

### state.json 更新

finalize 阶段写入：

```json
{
  "schema": 1,
  "partition": { "locale": "zh" },
  "generated_at": "ISO 8601",
  "git": { "commit": "<sha>", "branch": "main" },
  "pages": {
    "knowledge/支付模块/概述.md": {
      "sources": ["src/payment/**"],
      "content_hash": "<sha256>"
    },
    "content/支付域/支付流程.md": {
      "sources": ["src/payment/**"],
      "content_hash": "<sha256>"
    }
  },
  "snapshot_digest": "<sha256>",
  "snapshot_file": ".repowiki/snapshot.json",
  "last_run": {
    "status": "success",
    "phase": "finalize",
    "started_at": "...",
    "finished_at": "...",
    "error": ""
  }
}
```

说明：`sources` 由 plan.json（v2）推导——知识卡 = 所属模块 scope；文章 = `articles[].modules` 对应模块 scope 的并集 ∪ 文章显式 `scope`。`status` 的 `affected_pages` 据此计算。

---

## 7. 语言控制

### 结构字段（永远不翻译）

- slug、scope、type、dimension、split_decision
- JSON key、标识符、仓库源码路径
- 模块 slug（ascii）

### 自由文本与显示名（使用项目的自然语言）

- description、architecture_design
- 文章正文、注释、error message
- reasoning（JSON 中的推理字段）
- bundle 内的文件名/目录名与 title 一律用项目文档语言（中文项目：概述.md、支付域/；英文项目：overview.md、payment/；空格→`-`）

### 语言配置

默认跟随项目实际语言。可通过 `.repowiki/config.json` 覆盖：

```json
{
  "language": "en"
}
```
