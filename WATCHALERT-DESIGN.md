# WatchAlert · Vercel 运维工作台适配

选择日期：2026-09-07。

原始设计：https://getdesign.md/vercel/design-md

原文下载来源：https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/vercel/DESIGN.md

根目录 DESIGN.md 保留来源原文，DESIGN.LICENSE 保留其 MIT 授权。本文件定义项目适配，遇到营销场景与运维场景冲突时，以本文件的产品规则为准。这是独立风格参考，不代表 Vercel 官方背书。

## 应用规范

- 白色内容面、#fafafa 画布、#171717 主文字/主按钮、#4d4d4d 正文、#ebebeb 分隔线。
- 采用 4px 间距体系：4/8/12/16/24/32；桌面页边距 32px，手机 16px；标题 24px/600，正文 14px，辅助文字 12px；中文标题不使用过密负字距。
- 后台输入和按钮 36px 高，圆角 6px；卡片 8px，弹窗 12px；仅弹层使用轻微叠加阴影。
- 字体使用系统可用 Geist / Inter / 系统中文字体，不依赖外部字体 CDN。PromQL、指纹和技术字段使用等宽字体。
- 保留 WatchAlert 品牌和侧栏，选中项轻底色与细线标记；管理子页必须保持所属入口高亮，手机保留全部导航入口。
- 状态语义为项目优先：成功绿、错误红、警告琥珀、信息蓝，AI 紫。原始文档 success=蓝色不应用到告警状态。
- 不使用营销巨幅标题、渐变背景、促销卡片、横向品牌 Logo 带和价格卡。真实运维数据优先。
- 错误/禁用/危险/焦点不能被普通样式覆盖。空数据不是健康，AI 工具成功不是根因已确认。
- 统一页宽和滚动边界；Copilot、日历和编辑器允许任务专用布局，但证据、确认、返回和保存入口在窄屏可达。

实施入口：src/theme.ts、src/components/workspace.css、共享页面容器与导航。

全站评估与路线图：docs/UX-AI-OPTIMIZATION-2026-09.md。
