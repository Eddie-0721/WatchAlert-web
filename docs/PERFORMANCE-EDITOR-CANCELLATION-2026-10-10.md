# 编辑器取消与 Diff 模型释放修复

日期：2026-10-10。前端基线 `52a564d`。承接上一批编辑器资源优化，不改业务表单、权限或接口。

## 两个已复现的问题

1. Monaco 0.52.2 的 WordHighlighter 忽略两个 `Delayer.trigger()` 返回的 Promise，快速卸载会产生未处理的 `Canceled`。上一批手动用例偶有通过，本批改成连续三次真实快速切换；修复前独立运行三轮均失败，分别捕获 2、3、2 次取消异常。没有通过等待任务完成绕开取消。
2. 原 `SafeDiffEditor` 使用 `{ original: null, modified: null }` 调用 `setModel`，并吞掉失败。这不是解除模型关联的有效参数。版本 Diff 关闭、重开、离开页面时仍可能在关联解除前释放模型，本批新增卸载检查复现了 `TextModel got disposed before DiffEditorWidget model got reset`。

## 实现

### 版本锁定的局部依赖修复

通过 agent-reach 指引尝试 GitHub CLI，因当前 CLI 未登录，转为读取官方网页和源码。核实 [上游问题记录](https://github.com/microsoft/monaco-editor/issues/4859) 与 [当前官方实现](https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.ts)；另外在临时目录检查 0.53.0、0.55.1 的发布包，仍未包含这两个 Promise 的错误处理，因此没有仅凭版本号升级依赖。

- 固定当前 `monaco-editor` 为 `0.52.2`，未升级、未新增依赖。
- `scripts/patch-monaco-word-highlighter.mjs` 仅为两个已知高亮任务增加官方实现采用的 `.catch(onUnexpectedError)`。正常取消由 Monaco 自身识别；非取消异常仍上报。没有全局 `unhandledrejection` 过滤，也没有禁用高亮或延迟卸载。
- 安装、开发启动和生产构建前自动应用/校验。脚本幂等，版本、目标调用数量或补丁位置不符时失败，不猜测性修改未知版本，也不接受只应用一半的补丁。
- 两个 Dockerfile 都在 `npm ci` 前复制脚本。补丁会修改本地安装的依赖文件，但原始依赖仍由锁文件完整性校验下载，后续修改由仓库中可审查的脚本重复生成，不依赖一次手工修改 node_modules。
- 后续升级 Monaco 必须复查上游修复并移除或更新该脚本、生命周期钩子与 Docker COPY。若直接绕过 npm 生命周期执行 Vite，应先显式运行该脚本；推荐继续使用 README 中的 npm 命令。

### 明确 Diff 模型所有权与顺序

`SafeDiffEditor` 在 layout cleanup 中先保存模型对、调用 `setModel(null)`，再释放自己拥有的模型，最后由 React 包装库处置编辑器。先保存模型对可避免解除关联后丢失模型引用。显式保留的模型不释放；同一个模型对象最多释放一次。取消原来的静默 catch，不把解除失败伪装成成功清理。

## 验证

- 干净执行 `npm ci --no-audit --prefer-offline` 成功，postinstall 实际应用补丁；后续构建前再次验证补丁成功。
- 38 项前端单元测试、TypeScript 检查及生产构建通过。新增测试覆盖两个且仅两个调用点的修改、幂等、未知版本/缺失/额外/部分补丁拒绝、立即取消不运行任务、普通异常继续上报、Diff 释放顺序/保留策略/失败不提前释放。
- 原快速切换用例取消默认跳过，恢复为常规回归。增加普通编辑器、SQL、Diff 离开页面的清理与 Diff 重开验证。
- 四项最终编辑器专项连续五轮，共 20 项通过，包括快速切换、语法诊断/格式化/查找、SQL 补全、Diff 重开和三类编辑器离开页面。保持该生产构建不变，全站 320 项通过、2 项按需容量测量未启用；取消异常用例不再跳过。

测试采用本机 Chrome 和本地模拟 API，不访问生产或真实模型。浏览器界面和卸载错误检查不等于浏览器堆快照分析；未给出未经测量的内存降幅或响应时间提升。本机没有 Docker/nerdctl，未构建或运行 Linux 镜像；干净 npm 安装不冒充容器构建成功。

## 发布与剩余范围

本批仅需前端新镜像，无数据迁移，后端只同步维护记录，Agent 无改动。没有部署生产。回滚前端版本可回退本批行为；本地切回旧版本后可用该版本的 `npm ci` 恢复对应依赖内容。

编辑器主块仍约 3.29 MB；本批是资源生命周期及错误处理修复，不宣称大块体积已经解决。全系统的真实数据库执行计划、Redis 在途取消、Linux 部署链路和生产容量等验收仍需完成。
