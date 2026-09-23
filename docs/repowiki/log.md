# 生成日志

## 2026-09-11 — 全量生成（首次，两族结构）

- 模式：full（首次生成；本版为首个两族结构产物，替代早期 auth/payment 平面样例）
- 基线提交：a0bc5c86（main）
- 扫描：11 个文件 / 4,079 行（docs/repowiki/ 与 .repowiki/ 强制排除；其余按 .gitignore 排除）
- 模块：CLI 工具（bin/**）、生成技能（skills/**）
- 文章：3 篇（项目总览、快速开始、产物格式）
- 覆盖率：9/11（未覆盖：.gitignore、LICENSE）
- validate：0 错误 / 0 警告（12 个文件；log.md 豁免 frontmatter 检查）

## 2026-09-22 — 形状迁移（一模块一文件，breaking）

- 旧 7 卡合并为 2 模块文件：`knowledge/CLI-工具.md`（5 段）+ `knowledge/生成技能.md`（2 段）；公共 frontmatter 收归 `index.md`。
- 失效 URL（7）：`knowledge/CLI-工具/概述.md`、`knowledge/CLI-工具/架构设计.md`、`knowledge/CLI-工具/技术栈.md`、`knowledge/CLI-工具/编码规范.md`、`knowledge/CLI-工具/特殊配置与命令.md`、`knowledge/生成技能/概述.md`、`knowledge/生成技能/架构设计.md`。
- validate：0 错误 / 0 警告（7 个文件）。

## 2026-09-23 — 形状纠正（对齐 Qoder，breaking）

- 纠正 2026-09-22 单文件迁移：`knowledge/CLI-工具.md`、`knowledge/生成技能.md` 拆回 7 卡（一模块一目录）；恢复 `dimension` 字段校验与目录锚。
- 新增 `_module.yaml`（每模块目录一份，Qoder 兼容）：`CLI-工具`（scope `bin/**`，depends_on skill）+ `生成技能`（scope `skills/**`，depends_on cli）。
- 新增自定义主题机制（Qoder 式顶层独立目录单文件，`kind/name/category/scope/source_files`；本仓暂无自定义主题）。
- 失效 URL（2）：`knowledge/CLI-工具.md`、`knowledge/生成技能.md`；恢复 URL（7）：见 2026-09-22 条目。
- validate：0 错误 / 0 警告（14 个文件，含 2 个 `_module.yaml`）。

## 2026-09-23 — Unicode 路径状态修复（增量）

- 基线提交：`e96f322b458c6d105eeec0732b583b5370e83803`（main）。
- 刷新 8 页：CLI 五维卡与 3 篇文章；模块清单与生成技能卡未受影响，保持不变。
- 更新 `status` 的 git diff 路径处理，避免默认 `core.quotePath` 转义中文路径导致 `affected_pages` 漏报；文章补充状态引注索引与候选用途。
- validate：0 错误 / 0 警告（14 个文件）；71 个源码行号引注均指向有效文件与行范围。
