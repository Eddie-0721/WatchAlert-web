# 静态资源与 API 代理性能验证

## 本批范围

基线前端 `1845bb6`，开发分支 `codex/static-delivery-performance`，合入 `eddie`。仅修改前端镜像内 Nginx 配置、验证脚本与 CI；后端、Agent 运行代码和接口不变。没有升级 npm 依赖或基础镜像，也不改变上传大小和业务超时。

## 证据与修复

| 项目 | 原配置的本地实测 | 修改后 |
|---|---|---|
| 静态缓存 | HTML/JS 没有明确 Cache-Control | HTML、SPA 路由和未带哈希文件 `no-cache`，允许 ETag/304 校验；成功的带哈希资源一年 immutable |
| 资源缺失 | `/assets/` 使用 SPA 回退路径 | 资源不存在返回 404，不把 HTML 当 JS/worker；错误不带 immutable |
| 静态压缩 | 主脚本无 gzip | gzip level 5、Vary、最小 1024 字节，支持带 Via 的 Ingress 请求 |
| 大请求转发 | 2 MiB 请求上游收到 **0 字节**，小 JSON 正常 | 移除 `proxy_set_body $request_body`，按原始请求转发；大小与 SHA256 一致 |
| 分块上传 | 上游首块在测试 4 秒预算内未到达 | 显式 HTTP/1.1，保留关闭请求缓冲；客户端尚未发送完时上游已收到首块 |
| SSE | 原配置已能流式返回和取消 | 保留该能力；API 明确 gzip off，不继承静态缓存策略 |

缓存通过 HTTP 级 `map` 同时判断状态码和资源路径，只匹配 `/assets/` 下带至少 8 位内容哈希的常见构建资源。200/206/304 可长期缓存，404/其他错误不能；favicon、manifest、HTML 等未版本化文件每次校验。请使用完整 `w8t.conf`，不能只复制 server 部分而遗漏 map。

`/api` 的原有局部 add_header 保留，按 Nginx 继承规则不继承 server 的静态 Cache-Control；后端响应缓存头保持原样。此批没有修改 CORS 策略，也没有宣称关闭了外层 Ingress/CDN 的缓冲或缓存。

## 实测结果

在官方 Nginx Windows **1.30.5 和 1.26.3** 上分别运行真实进程，使用当前生产构建目录作为静态根、本地模拟服务作为上游，只将配置中的监听地址、静态目录和上游地址替换为隔离路径。

- 两个版本的 `nginx -t` 和全部 **7 组契约检查**通过（Node 输出含父测试共 8 项）。覆盖 SPA/304、哈希 JS/CSS/worker、缺失资源、gzip/Via、2 MiB 原样转发、鉴权与租户头、分块上传、SSE 首块先于完成、取消传递、403 与大 JSON API 响应。
- 主脚本 `/assets/index-CoIbinAL.js`：**880,586 → 293,073 字节，减少约 66.7%**。解压后与原始文件逐字节相同。这是单个构建资源的线缆传输量，不是总包体、首屏耗时或生产吞吐结论；gzip CPU 成本未做生产测量。
- 前端 19 项单元测试、类型检查与生产构建通过。没有 UI 源码变化；本批不将 Vite 预览误称为 Nginx 验证。原有大块构建警告仍保留。
- 原配置先运行同一套测试：缓存、压缩、大请求和分块上传失败，SSE 与 API 403 通过；修复后所有检查通过。
- 测试进程结束后自动关闭，临时配置与日志保留在系统临时目录 `watchalert-nginx-*` 供诊断。测试不使用生产凭据或外部业务服务。

## 重跑与 CI

Linux 构建机安装 Nginx 后：

```sh
npm ci --no-audit
npm run build
npm run test:nginx
```

非 PATH 安装通过 `NGINX_BIN` 指定可执行文件；自定义包可通过 `NGINX_MIME_TYPES` 指定 mime.types。缺少二进制时明确失败，不静默跳过。测试绑定随机回环端口，临时 pid/日志/请求体路径隔离，不修改系统 Nginx 配置或操作已有服务。

`.github/workflows/ci.yml` 已增加 Nginx 安装与该检查；Linux 远端 CI 的实际执行结果需要另行查看，不能从本地 Windows 通过推断。

## 发布、验收与回滚

- 本批仅需重新构建前端镜像；两个 Dockerfile 都复制同一 `w8t.conf`。不需要配套更新后端/Agent、配置密钥或数据库。
- 自定义镜像需确认包含标准 gzip/map/proxy 模块，并在目标镜像中执行 `nginx -t`。本机没有容器运行时，尚未构建或验证 Linux 容器镜像。
- 上线后核对 HTML 为 no-cache，实际哈希 JS 请求返回 gzip/Vary/immutable；不同构建必须保留内容哈希命名，不能把不同内容覆盖到同一 immutable URL。
- 验证外层 Ingress/CDN 不将 API 套用公共缓存，不缓存 HTML 为长期不可变，不缓冲 SSE；确认停止生成后上游停止。镜像内的测试不能证明外层代理配置正确。
- 保留旧镜像 tag/digest。回滚前端镜像无需数据库迁移；长期缓存资源由各自内容哈希区分，HTML 再验证获取当前入口。多副本混跑期间旧页面请求已删除 chunk 的风险仍需部署策略/旧产物保留解决，此批未实现跨版本产物托管。

## 官方依据与剩余范围

通过 agent-reach 网页路线核对文档；Jina 无法连接后使用官方站点直接读取。实现依据：[gzip 参数](https://nginx.org/en/docs/http/ngx_http_gzip_module.html)、[响应头继承](https://nginx.org/en/docs/http/ngx_http_headers_module.html)、[请求体与缓冲](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)。

没有生产部署或在线压测，也未验证实际 Kubernetes Ingress。全系统剩余工作包括告警列表/大规模规则负载测量、已提供索引的真实数据库验证、长会话持续渲染和跨版本前端产物验收；本批不宣称整体性能目标完成。
