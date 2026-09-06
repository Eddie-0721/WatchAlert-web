import { lazy } from 'react';
const AlertRuleList = lazy(() => import('../pages/alert/rule').then(module => ({ default: module.AlertRuleList })));
const RuleTemplate = lazy(() => import('../pages/alert/tmpl').then(module => ({ default: module.RuleTemplate })));
const RuleTemplateGroup = lazy(() => import('../pages/alert/tmplGroup').then(module => ({ default: module.RuleTemplateGroup })));
const Datasources = lazy(() => import('../pages/datasources').then(module => ({ default: module.Datasources })));
const DutyManage = lazy(() => import('../pages/duty').then(module => ({ default: module.DutyManage })));
const Home = lazy(() => import('../pages/home').then(module => ({ default: module.Home })));
const UserRole = lazy(() => import('../pages/members/role').then(module => ({ default: module.UserRole })));
const User = lazy(() => import('../pages/members/user').then(module => ({ default: module.User })));
const NoticeObjects = lazy(() => import('../pages/notice').then(module => ({ default: module.NoticeObjects })));
const NoticeTemplate = lazy(() => import('../pages/notice/tmpl').then(module => ({ default: module.NoticeTemplate })));
const Silences = lazy(() => import('../pages/silence').then(module => ({ default: module.Silences })));
const Login = lazy(() => import('../pages/login').then(module => ({ default: module.Login })));
import Error from "../utils/Error"
import { ComponentsContent } from '../components';
const Tenants = lazy(() => import('../pages/tenant').then(module => ({ default: module.Tenants })));
const GrafanaDashboardComponent = lazy(() => import('../pages/dashboards/dashboard/iframe').then(module => ({ default: module.GrafanaDashboardComponent })));
const DashboardFolder = lazy(() => import('../pages/dashboards/folder').then(module => ({ default: module.DashboardFolder })));
const AuditLog = lazy(() => import('../pages/audit').then(module => ({ default: module.AuditLog })));
const SystemSettings = lazy(() => import('../pages/settings').then(module => ({ default: module.SystemSettings })));
const TenantDetail = lazy(() => import('../pages/tenant/detail').then(module => ({ default: module.TenantDetail })));
const AlertRule = lazy(() => import('../pages/alert/rule/create').then(module => ({ default: module.AlertRule })));
const Dashboards = lazy(() => import('../pages/dashboards/dashboard').then(module => ({ default: module.Dashboards })));
const NoticeRecords = lazy(() => import('../pages/notice/history').then(module => ({ default: module.NoticeRecords })));
const CalendarApp = lazy(() => import('../pages/duty/calendar').then(module => ({ default: module.CalendarApp })));
const Probing = lazy(() => import('../pages/probing').then(module => ({ default: module.Probing })));
const CreateProbingRule = lazy(() => import('../pages/probing/create').then(module => ({ default: module.CreateProbingRule })));
const OnceProbing = lazy(() => import('../pages/probing/once').then(module => ({ default: module.OnceProbing })));
const ProbingMetrics = lazy(() => import('../pages/probing/detail').then(module => ({ default: module.ProbingMetrics })));
const Profile = lazy(() => import('../pages/profile'));
const FaultCenter = lazy(() => import('../pages/faultCenter').then(module => ({ default: module.FaultCenter })));
const FaultCenterDetail = lazy(() => import('../pages/faultCenter/detail').then(module => ({ default: module.FaultCenterDetail })));
const RecordingRuleIndex = lazy(() => import('../pages/alert/recordingRule').then(module => ({ default: module.RecordingRuleIndex })));
const RecordingRuleCreatePage = lazy(() => import('../pages/alert/recordingRule/create').then(module => ({ default: module.RecordingRuleCreatePage })));
const DataAnalysis = lazy(() => import('../pages/exploer').then(module => ({ default: module.DataAnalysis })));
const PrometheusServiceDiscovery = lazy(() => import('../pages/promethues/sd').then(module => ({ default: module.PrometheusServiceDiscovery })));
const AlertStream = lazy(() => import('../pages/alerts').then(module => ({ default: module.AlertStream })));
const Copilot = lazy(() => import('../pages/copilot').then(module => ({ default: module.Copilot })));
const Manage = lazy(() => import('../pages/manage').then(module => ({ default: module.Manage })));

// eslint-disable-next-line import/no-anonymous-default-export
export default [
    {
        path: '/',
        element: <ComponentsContent name="off" c={<Home />} />,
    },
    {
        path: '/alerts',
        element: <ComponentsContent name="off" c={<AlertStream />} />,
    },
    {
        path: '/copilot',
        element: <ComponentsContent name="off" c={<Copilot />} />,
    },
    {
        path: '/manage',
        element: <ComponentsContent name="off" c={<Manage />} />,
    },
    {
        path: '/login',
        element: <Login />
    },
    {
        path: '/ruleGroup',
        element: <ComponentsContent name="告警管理 / 告警规则" c={<AlertRuleList />} />
    },
    {
        path: '/ruleGroup/:id/rule/list',
        element: <ComponentsContent name="告警管理 / 告警规则" c={<AlertRuleList />} />
    },
    {
        path: '/ruleGroup/:id/rule/add',
        element: <ComponentsContent name="告警管理 / 添加告警规则" c={<AlertRule type="add"/>} />
    },
    {
        path: '/ruleGroup/:id/rule/:ruleId/edit',
        element: <ComponentsContent name="告警管理 / 编辑告警规则" c={<AlertRule type="edit"/>} />
    },
    {
        path: '/silenceRules',
        element: <ComponentsContent name="静默规则" c={<Silences />} />
    },
    {
        path: '/tmplType/:tmplType/group',
        element: <ComponentsContent name="告警管理 / 规则模版组" c={<RuleTemplateGroup />} />,
    },
    {
        path: '/tmplType/:tmplType/:ruleGroupName/templates',
        element: <ComponentsContent name="告警管理 / 规则模版" c={<RuleTemplate />} />
    },
    {
        path: '/noticeObjects',
        element: <ComponentsContent name="通知管理 / 通知对象" c={<NoticeObjects />} />
    },
    {
        path: '/noticeTemplate',
        element: <ComponentsContent name="通知管理 / 通知模版" c={<NoticeTemplate />} />
    },
    {
        path: '/noticeRecords',
        element: <ComponentsContent name="通知管理 / 通知记录" c={<NoticeRecords />} />
    },
    {
        path: '/dutyManage',
        element: <ComponentsContent name="值班中心" c={<DutyManage />} />
    },
    {
        path: '/dutyManage/:id/calendar',
        element: <ComponentsContent name="值班中心 / 值班表" c={<CalendarApp />} />
    },
    {
        path: '/user',
        element: <ComponentsContent name="人员组织 / 用户管理" c={<User />} />
    },
    {
        path: '/userRole',
        element: <ComponentsContent name="人员组织 / 角色管理" c={<UserRole />} />
    },
    {
        path: '/tenants',
        element: <ComponentsContent name="租户管理" c={<Tenants />} />
    },
    {
        path: '/tenants/detail/:id',
        element: <ComponentsContent name="租户管理 / 租户" c={<TenantDetail/>} />
    },
    {
        path: '/datasource',
        element: <ComponentsContent name="数据源" c={<Datasources />} />
    },
    {
        path: '/folders',
        element: <ComponentsContent name="仪表盘" c={<DashboardFolder />} />
    },
    {
        path: '/folder/:id/list',
        element: <ComponentsContent name="仪表盘 / 目录" c={<Dashboards />} />
    },
    {
        path: 'dashboard/f/:fid/g/:did/info',
        element: <ComponentsContent name="仪表盘 / 详情" c={<GrafanaDashboardComponent />} />
    },
    {
        path: '/auditLog',
        element: <ComponentsContent name="日志审计" c={<AuditLog />} />
    },
    {
        path: '/settings',
        element: <ComponentsContent name="系统设置" c={<SystemSettings/>}/>
    },
    {
        path: '/onceProbing',
        element: <ComponentsContent name="网络分析 / 即时拨测" c={<OnceProbing/>} />
    },
    {
        path: '/probing',
        element: <ComponentsContent name="网络分析 / 拨测任务" c={<Probing/>} />
    },
    {
        path: '/probing/create',
        element: <ComponentsContent name="网络分析 / 创建拨测规则" c={<CreateProbingRule type="add"/>} />
    },
    {
        path: '/probing/:id/edit',
        element: <ComponentsContent name="网络分析 / 编辑拨测规则" c={<CreateProbingRule type="edit"/>} />
    },
    {
        path: '/probing/:id/detail',
        element: <ComponentsContent name="网络分析 / 拨测详情" c={<ProbingMetrics />} />
    },
    {
        path: '/profile',
        element: <ComponentsContent name="个人信息" c={<Profile />} />
    },
    {
        path: '/faultCenter',
        element: <ComponentsContent name="故障中心" c={<FaultCenter />} />
    },
    {
        path: '/faultCenter/detail/:id',
        element: <ComponentsContent name="故障中心 / 详情" c={<FaultCenterDetail />} />
    },
    {
        path: 'recordingRules',
        element: <ComponentsContent name="记录规则" c={<RecordingRuleIndex />} />
    },
    {
        path: '/recordingRules/:id/list',
        element: <ComponentsContent name="记录规则 / 规则" c={<RecordingRuleIndex />} />
    },
    {
        path: '/recordingRules/:id/create',
        element: <ComponentsContent name="记录规则 / 新建规则" c={<RecordingRuleCreatePage type="add" />} />
    },
    {
        path: '/recordingRules/:id/rule/:ruleId/edit',
        element: <ComponentsContent name="记录规则 / 编辑规则" c={<RecordingRuleCreatePage type="edit" />} />
    },
    {
        path: '/dataAnalysis',
        element: <ComponentsContent name="数据分析 / 指标查询" c={<DataAnalysis />} />
    },
    {
        path: 'prometheusTargets',
        element: <ComponentsContent name="服务发现" c={<PrometheusServiceDiscovery />} />
    },
    {
        path: '/prometheusTargets/:id/list',
        element: <ComponentsContent name="服务发现" c={<PrometheusServiceDiscovery />} />
    },
    {
        path: '/*',
        element: <Error />
    }
]
