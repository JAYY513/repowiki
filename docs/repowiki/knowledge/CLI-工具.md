---
description: repowiki CLI 的定位与职责边界：init / scan / state / status / validate 五个子命令。
module: cli
source_files: ["bin/**"]
updated_at: 2026-09-22
---

# CLI 工具

## 概述 <!-- category:overview -->

`bin/repowiki.mjs` 是 repowiki 的全部机器侧实现：扫描仓库、校验知识库、维护新鲜度基线。写入侧与读取侧的一切自动动作都由它执行。

**做什么**

- `init`：向 `AGENTS.md` 注入管理块与读取纪律（重跑幂等）；`scan`：生成 `.repowiki/snapshot.json`（路径、SHA-256、语言）；`state`：读写 `.repowiki/state.json` 基线；`status`：比对基线与 HEAD；`validate`：校验 `docs/repowiki/` 下的 OKF bundle。
- 安全扫描：跳过密钥类文件与超过 1 MB 的大文件，强制排除 `docs/repowiki/` 与 `.repowiki/`（[bin/repowiki.mjs:313-334](file://bin/repowiki.mjs#L313-L334)）。

**不做什么**

- 不生成 wiki 内容——模块规划与页面写作由 `repowiki-gen` 技能驱动 agent 完成。
- 不做网络访问；除 `AGENTS.md`、`.repowiki/` 与 `docs/repowiki/` 外不改动仓库。

## 架构设计 <!-- category:architecture_design -->

### 内部结构

单文件（约 1400 行）按注释分区组织，自顶向下：

| 区域 | 位置 | 内容 |
|---|---|---|
| 常量区 | [bin/repowiki.mjs:12-70](file://bin/repowiki.mjs#L12-L70) | `EXCLUDED_DIRS`、`KEY_FILE_PATTERNS`、`LANG_MAP`、AGENTS 标记与源声明行 |
| 工具函数 | [bin/repowiki.mjs:86-397](file://bin/repowiki.mjs#L86-L397) | `writeJson` / `readJson` / `sha256OfFile`、`walkDir`（BFS 遍历 + 排除）、`parseFrontmatter`（迷你 YAML 解析） |
| 子命令 | [bin/repowiki.mjs:399-1219](file://bin/repowiki.mjs#L399-L1219) | `cmdScan` / `cmdState` / `cmdStatus` / `cmdValidate` / `cmdInit` |
| 帮助与入口 | [bin/repowiki.mjs:1366-1430](file://bin/repowiki.mjs#L1366-L1430) | `printUsage` 与 `main()` 的 switch 分发 |

### 关键流程

- **scan**：合并 `.repowikiignore` / `.gitignore` / `.git/info/exclude` 与子目录 `.gitignore` 的排除规则 → BFS 遍历 → 写 `.repowiki/snapshot.json`。
- **state --update**（finalize）：`buildPagesMap` 遍历 bundle 全部 Markdown，按 `plan.json` 的模块 `scope` 与文章 `modules` 生成页面→源映射，连同 `content_hash`、git 基线、`snapshot_digest` 写入 `state.json`（[bin/repowiki.mjs:696-769](file://bin/repowiki.mjs#L696-L769)）。
- **status**：对基线提交与 HEAD 做 `git diff`，把变更文件与页面 `sources` 做 glob 匹配，产出 `affected_pages` 供增量重生成（[bin/repowiki.mjs:904-931](file://bin/repowiki.mjs#L904-L931)）。
- **validate**：遍历 bundle 校验 frontmatter、目录约定、链接可达性与 plan 一致性（[bin/repowiki.mjs:952-1219](file://bin/repowiki.mjs#L952-L1219)）。

### 依赖关系

- 文件系统：读写 `.repowiki/`（snapshot / state / plan / run）与 `docs/repowiki/`，注入 `AGENTS.md`。
- git CLI：经 `execSync` 调用 `rev-parse` / `diff` / `rev-list`；所有调用包在 try/catch 中，失败时降级为空基线而不是崩溃。
- 无第三方运行时依赖、无网络访问；被 `repowiki-gen` 技能按步骤调用。

## 技术栈 <!-- category:tech_stack -->

只记录非默认、且对理解实现有解释力的选型。

| 选型 | 用途 | 为什么 |
|---|---|---|
| Node.js ≥ 18（ESM） | 运行环境 | 原生 ESM 与 `node:` 前缀导入无需转译；单文件带 shebang 可直接执行（[bin/repowiki.mjs:1-10](file://bin/repowiki.mjs#L1-L10)）；版本下限见 [package.json:17-19](file://package.json#L17-L19) |
| 零第三方依赖 | 依赖策略 | 仅用 fs / path / crypto / child_process 四个内置模块；安装面与供应链风险为零（[bin/repowiki.mjs:3-10](file://bin/repowiki.mjs#L3-L10)） |
| 原生 JSON 文件 | 状态协议 | snapshot / state / plan / run 全部为 JSON，统一经 `writeJson` 落盘，便于 git 追踪与人工检查（[bin/repowiki.mjs:96-99](file://bin/repowiki.mjs#L96-L99)） |
| git CLI（而非 git 库） | 新鲜度基线 | 直接复用用户环境里的 git 做 `rev-parse` / `diff` / `rev-list`，避免引入重量级依赖（[bin/repowiki.mjs:567-577](file://bin/repowiki.mjs#L567-L577)） |
| Markdown + YAML frontmatter | 知识载体 | 人机双读；手写迷你解析器覆盖所需子集，换取零依赖（[bin/repowiki.mjs:343-397](file://bin/repowiki.mjs#L343-L397)） |

## 编码规范 <!-- category:coding_conventions -->

每条惯例均在源码中至少两处验证过；改动 `bin/repowiki.mjs` 时保持。

1. **只用 `node:` 内置模块，保持零依赖。** 依据：[bin/repowiki.mjs:7-10](file://bin/repowiki.mjs#L7-L10) 的四个 import；[package.json:1-39](file://package.json#L1-L39) 全文无 `dependencies` 字段。
2. **JSON 落盘统一走 `writeJson`**（2 空格缩进、末尾换行、自动建目录）。依据：定义于 [bin/repowiki.mjs:96-99](file://bin/repowiki.mjs#L96-L99)；调用见于 snapshot（[bin/repowiki.mjs:505](file://bin/repowiki.mjs#L505)）与 state（[bin/repowiki.mjs:741](file://bin/repowiki.mjs#L741)）。
3. **退出码语义固定**：`0` 成功、`1` 错误、`10` 过期、`11` 缺失。依据：usage 声明 [bin/repowiki.mjs:1382-1386](file://bin/repowiki.mjs#L1382-L1386)；实现 `return 10`（[bin/repowiki.mjs:947](file://bin/repowiki.mjs#L947)）与 `return 11`（[bin/repowiki.mjs:816](file://bin/repowiki.mjs#L816)）。
4. **git 调用静默降级**：`execSync` 一律包 try/catch 且忽略 stderr，失败返回空值而非抛错。依据：[bin/repowiki.mjs:527-532](file://bin/repowiki.mjs#L527-L532)（createStateFile）与 [bin/repowiki.mjs:834-843](file://bin/repowiki.mjs#L834-L843)（cmdStatus）。
5. **bundle 内路径统一 posix 风格**：收集文件时把 `\` 换成 `/`；解析链接用 `path.posix` 归一化。依据：[bin/repowiki.mjs:308](file://bin/repowiki.mjs#L308) 与 [bin/repowiki.mjs:1123-1128](file://bin/repowiki.mjs#L1123-L1128)。

## 特殊配置与命令 <!-- category:unique_setup_and_commands -->

### 运行方式

- 免安装：`node bin/repowiki.mjs <cmd>`（[README.md:80-85](file://README.md#L80-L85)）。
- 全局别名：`npm link` 后直接 `repowiki <cmd>`——`bin` 映射见 [package.json:6-8](file://package.json#L6-L8)。

### 命令清单

| 命令 | 作用 | 关键参数 |
|---|---|---|
| `repowiki init` | AGENTS.md 接线 + state 基线（幂等） | `--json` `--quiet` |
| `repowiki scan` | 扫描仓库 → `.repowiki/snapshot.json` | `--json` `--quiet` |
| `repowiki state` | 读/写 `.repowiki/state.json`（`--init` 建基线 / `--update` finalize） | `--json` |
| `repowiki status` | 新鲜度检查 | `--json` `--quiet` |
| `repowiki validate` | 校验 `docs/repowiki/` bundle | `--json` |

### 退出码

| 码 | 含义 |
|---|---|
| 0 | OK / fresh |
| 1 | 错误 |
| 10 | 过期（stale） |
| 11 | 缺失（wiki 未生成） |

CI / hook 中建议用 `repowiki status --quiet`：stdout 只输出 `fresh` / `stale` / `missing` 单词（[bin/repowiki.mjs:861-870](file://bin/repowiki.mjs#L861-L870)）。

### 非显而易见项

- `scan` 排除规则可扩展：仓库根放 `.repowikiignore`（gitignore 语法），与 `.gitignore`、`.git/info/exclude` 及各子目录 `.gitignore` 合并生效（[bin/repowiki.mjs:406-429](file://bin/repowiki.mjs#L406-L429)）。
- `init` 重跑幂等：管理块原位更新；若检测到手写 `## repowiki` 分区，只补声明行、不改其余内容（[bin/repowiki.mjs:1310-1347](file://bin/repowiki.mjs#L1310-1347)）。
- `validate` 只报告不修改（P0）：修正由 agent 按报告执行。

## 关系

- 依赖：生成技能（被技能按步骤调用；双副本 `scripts/repowiki.mjs` 须逐字节一致）
- 被依赖：（无）
- 相关：（无）
