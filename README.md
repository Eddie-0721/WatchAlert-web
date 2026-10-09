# WatchAlert Web

React 18 + Ant Design 5 + Vite，逐步引入 TypeScript。生产稳定构建分支为 `eddie`。

## 开发与校验

使用 Node.js 22（Vite 最低要求 22.12）或兼容版本，统一使用 npm 与已提交的 package-lock.json，不再使用 CRA / yarn 构建。

```bash
npm ci --no-audit
npm start
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

开发端口 3000，API 默认代理至 http://localhost:9001。可通过 WATCHALERT_API_URL 环境变量指定开发后端。UI 测试使用 4187 端口和隔离的模拟 API，不访问生产。

`.npmrc` 默认使用国内 npmmirror；legacy-peer-deps 用于兼容遗留 React 组件的 peer 声明，不表示这些组件已全部现代化。生产依赖由 npm ci 固定，不在 Docker 构建时重新解析版本。

Monaco 0.52.2 的高亮取消修复由安装/启动/构建钩子自动应用并校验，不需要手工修改 node_modules。升级 Monaco 前需复查并移除或更新该版本补丁；具体范围与验收见 [编辑器取消修复记录](docs/PERFORMANCE-EDITOR-CANCELLATION-2026-10-10.md)。

## Docker 构建

```bash
git switch eddie
git pull --ff-only origin eddie
docker build -t harbor.guardforceai.cn/other/watchalert-web:YOUR_RELEASE_TAG .
```

默认基础镜像为 node:22-alpine 与 nginx:stable-alpine。如 Docker Hub 不可达，使用企业 Harbor 中实际存在的对应镜像：

```bash
docker build --build-arg NODE_IMAGE=YOUR_INTERNAL_NODE_IMAGE --build-arg NGINX_IMAGE=YOUR_INTERNAL_NGINX_IMAGE --build-arg NPM_REGISTRY=https://registry.npmmirror.com -t harbor.guardforceai.cn/other/watchalert-web:YOUR_RELEASE_TAG .
```

构建产物仍是 build/，容器 /app、80 端口及 /api 到 w8t-service:9001 的代理保持兼容。Dockerfile-nginx 与默认 Dockerfile 使用相同流程；Nginx 配置不依赖 Lua。npm 镜像站不能解决 Docker 基础镜像拉取问题，两者需要分别配置。

本次涉及告警队列汇总和 AI 权限校验，须协调更新后端；若使用 Copilot，Agent 服务也需更新。先在测试环境验收，镜像使用唯一 tag，保留旧镜像及配置用于回滚。

## 设计与实施记录

- [Vercel 设计来源原文](DESIGN.md) / [MIT 授权](DESIGN.LICENSE)
- [WatchAlert 场景适配](WATCHALERT-DESIGN.md)
- [UX / AI 优化方案及批次](docs/UX-AI-OPTIMIZATION-2026-09.md)
- [本次升级与验收说明](docs/RELEASE-2026-09.md)

GitHub 的 eddie / PR 流水线只执行校验，不自动发布到上游 Docker Hub。遗留分支发布流程已改为手动触发；生产 Harbor 发布由你现有流水线管理。
