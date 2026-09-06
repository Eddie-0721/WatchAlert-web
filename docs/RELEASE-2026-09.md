# UX / AI 第一批升级说明

日期：2026-09-07。前端、后端均使用各自的 eddie 分支。

## 本批交付

- 前端保留 React / Ant Design，CRA 迁移至 Vite；引入渐进式 TypeScript（Agent API、主题及已有 TS 文件检查），不宣称全站已 TypeScript 化。
- 路由级懒加载，Monaco 只在编辑器页面加载，worker 本地打包；移除无用框架和重复依赖，采用 npm ci / package-lock.json。
- 根目录 DESIGN.md 与 DESIGN.LICENSE 保留 Vercel 风格来源，WATCHALERT-DESIGN.md 明确后台适配与状态语义。
- 共享容器、导航归属、移动端完整菜单、表格 loading、危险/禁用/校验错误语义；不以全局黑白样式抹掉告警级别。
- 告警改为服务端分页和队列汇总，摘要不再基于前 100 条；修正长资源名溢出及缺少中间标签时创建静默抛错。
- Manage 使用规则服务端分页/搜索/状态筛选；数据源显示“连通性未检测”，通知配置不冒充投递健康。
- 首页区分无告警、查询失败与系统健康；修复故障中心切换请求竞态。
- Copilot 提供历史会话恢复、逐消息证据、来源/查询/时间/截断提示、显式能力失败/停用状态；不回退旧版 AI。
- Go 网关按当前权限重新验证操作确认；检查目标现状及环境范围。共享 Prometheus 连接按数据源 ID 授权，每个指标选择器另行校验环境条件。

## 升级顺序与兼容性

1. 备份现有配置与数据库，保留前端、后端、Agent 旧镜像 tag。先在测试环境演练。
2. 更新后端 eddie 构建及部署，再更新 Agent 服务（同一后端仓库 agent-service/），最后更新前端。
3. 本批无新增数据库列；沿用既有 Agent 会话、待确认操作和工具审计表。队列汇总是响应的新增可选字段。
4. 不要只更新前端：旧后端不认识队列参数会导致页面队列和总量不一致；旧 Agent 不会返回新证据字段。
5. 外层 Ingress / Nginx 也需要支持 SSE 流式透传。前端镜像内 w8t.conf 已保留关闭代理缓冲的配置。
6. 回滚须协调三组件版本，不能通过关闭权限检查来规避不兼容。

镜像命名继续沿用 harbor.guardforceai.cn/other/watchalert-web；后端可沿用同前缀的 watchalert，Agent 沿用你现有镜像仓库名。使用唯一版本 tag，而不是覆盖 latest。Docker 基础镜像仍需在构建环境可达；npm 国内镜像不能代替 Docker Hub 镜像代理。

## 权限行为变化（管理员需检查）

- 无环境范围、未配置环境 Label，或环境名不能明确归为非生产时，写操作需要显式开启生产写权限。不会因为使用自定义环境名而默认放行。
- 已识别的非生产值：dev/development/test/testing/sit/uat/qa/staging/stage/pre/preprod/preproduction/sandbox/local/开发/测试/预发布。自定义环境名按保守策略处理。
- 环境范围不是数据源名称或展示别名；校验使用配置的原始 Label key / value。
- 如授权 env=prod，表达式的每个向量选择器都必须带 env="prod"；正则、负向条件、仅过滤外层结果都不能替代。跨授权环境查询可组合多个各自精确限定的选择器。
- 静默/认领仍需“申请 → 预览 → 用户确认”；确认时校验最新权限、范围、有效期和内容。已有预览不能绕过权限收紧。
- 这些改进不等于完成系统级安全认证；规则/故障中心配置等工具仍沿用既有租户和工具权限边界，细粒度对象权限、统一字段脱敏和系统安全审计需后续专项完善。

## 验收与已知边界

前端：npm test、npm run build、Playwright 本地隔离 API 回归（桌面/390px、125 条分页、导航、历史证据、权限错误、表单校验、静默入口）。截图保存在本地 test-results/visual/，不提交模拟数据或截图到业务代码。

后端：go build ./cmd/... 通过；go test ./internal/services ./internal/models ./pkg/agenttoken ./pkg/secretbox 通过。Agent 的 Python evidence 单元测试通过。

全量 go test ./... 未通过：既有包存在非恒定日志格式的 vet 错误，并有依赖外部模型凭据的集成测试返回 401。新 CI 使用编译和不依赖生产的专项测试；不将此结果描述为全量测试通过。

当前机器无 Docker，本次未验证镜像实际构建/容器启动；亦未进行生产发布或真实 DeepSeek / Prometheus 端到端联调。Vite 仍提示 Markdown/Monaco 等较大分块，路由懒加载已降低入口负担，进一步拆包留后续实测。

未完成且不计入本批：全站 TS / 查询状态库迁移、全面表单流程重构、规则评估遥测、模型连通性测试、完整 Manage 聚合、标签映射配置、故障记录、Runbook 检索与外部 Connector。见原优化方案 P1/P2，不增加多 Agent 或微服务平台。
