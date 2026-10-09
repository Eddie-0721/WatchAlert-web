# 编辑器加载与资源生命周期优化

日期：2026-10-10。前端基线 `e56a7c0`。仅前端运行代码调整，不修改接口、规则提交、权限或数据格式。

## 已确认的问题与处理

1. `sqlEditor.jsx` 每次挂载都向 Monaco 全局注册 SQL 补全，未释放注册对象。对照原实现，在规则创建页 ClickHouse → Prometheus → ClickHouse 后，同一个 SELECT 候选出现两次。现在持有并释放补全注册、内容监听和延迟任务；连续输入只保留一个 100 ms 延迟补全任务，卸载后不再触发它。连续三次打开均只显示一条 SELECT。
2. `VSCodeEditor.jsx` 与 `@monaco-editor/react` 都处置同一个编辑器。现在由包装库统一负责 editor/model 的释放，本组件清空引用并清理自己的任务。同时去掉 ResizeObserver 外层未保存句柄的零延迟任务，保留原有 200 ms 防抖及 RAF。
3. Monaco 根入口引入全部基础语言及 CSS/HTML/TypeScript 服务，而实际调用点只使用 JSON、YAML、SQL。改为完整编辑器核心与这三种语言贡献，不裁剪查找、格式化、Diff 等编辑功能；Worker 仍随构建本地提供，不访问 CDN。现有调用中的 `Json`、`Yaml` 统一为语言注册所需的小写 ID。

没有新增依赖，也没有替换编辑器或引入新的状态管理。

## 可量化收益及边界

同一机器生产构建，字节单位为 B：

| 产物 | 修改前 | 修改后 |
|---|---:|---:|
| 编辑器主 JS | 3,317,537 | 3,294,168 |
| 主 JS gzip | 853,103 | 849,096 |
| 通用 Worker | 231,351 | 231,351 |
| JSON Worker | 362,606 | 362,606 |

主块减少 23,369 B，gzip 减少 4,007 B，收益有限，不能称为明显的首屏加速。原来的动态语言块并非全在首屏加载，不能把删除的全部构建文件体积算作网络收益。页面原有按需加载保持不变，主入口约 881 kB 和编辑器约 3.29 MB 的大块警告仍存在。

资源修复的主要实证是补全注册不再随重复挂载累积；未测量生产 JS 堆、p95 或整体响应时间，不能从注册数量直接推算内存降幅。

## 验证记录

- 31 项前端单元测试通过，类型检查及生产构建通过。
- 8 项编辑器专项连续三轮，共 24 项通过：五个列表入口不提前下载编辑器、JSON 非法/合法诊断及格式化/查找、YAML 高亮、本地 Worker、JSON 历史版本 Diff，以及 SQL 重复挂载。JSON 测试使用粘贴事件模拟配置粘贴，不通过直接修改 Monaco 模型绕过组件。
- 保持最终构建不变，全站浏览器回归 319 项通过、3 项跳过。跳过的是两项按需容量测量及下述已知取消异常复现，不能称为 322 项全部通过。接口均为本地模拟，不代表生产联调。
- 独立 Agent 本次复查 25 项现有单元测试及 Python 编译检查通过；没有修改 Agent，也没有调用真实模型。

## 未完成：Monaco 快速卸载取消异常

在聚焦 JSON 编辑器、打开查找后立即切换导入语言，可触发浏览器 `Canceled` 未处理异常。堆栈和依赖源码指向 Monaco 0.52.2 的 `WordHighlighter`：忽略了 `Delayer.trigger()` 返回的 Promise，卸载时 `Delayer.dispose()` 使它拒绝。

恢复原 Monaco 根入口、保留小写 JSON 语言 ID 时也复现了该异常，因此不是语言入口收缩所独有；但这不是原始 HEAD 所有文件不变的对照，不能宣称它对原来大小写错误的 JSON 导入模式完全无影响。正常语法检查/格式化/Diff 测试通过，不等于快速切换异常已经修复。

没有在生产代码里吞掉全局异常，没有移除词语高亮，也没有修改 node_modules 或升级依赖。独立复现用例保留在 `performance.spec.mjs`，默认跳过，手动启用后当前确实失败：

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:WATCHALERT_EDITOR_CANCELLATION_REPRO = '1'
npx playwright test tests/ui/performance.spec.mjs --grep 'known Monaco cancellation'
Remove-Item Env:WATCHALERT_EDITOR_CANCELLATION_REPRO
```

下一步应单独验证依赖修复或安全的编辑器切换方式，覆盖焦点、撤销、JSON/YAML 内容隔离、卸载和 Diff，不能通过隐藏错误或延长测试等待宣称修复。这是明确的未完成项。

## 发布和整体剩余项

仅需前端镜像，无数据迁移；本批没有部署生产。回滚前端版本即可回退本批代码。

整体性能计划尚未全部验收：真实 MySQL 执行计划/索引、Redis 在途取消、Linux 容器网络与生产容量仍需后续处理。不要把本地模拟回归当成这些项目已经通过。
