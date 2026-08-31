import { useEffect, useState } from 'react';
import { Button, Layout, Result, Spin } from 'antd';
import { LeftOutlined, LoginOutlined } from '@ant-design/icons';
import './index.css';
import { ComponentSider } from './sider';
import Auth from '../utils/Auth';
import { getTenantList } from '../api/tenant';
import { getUserInfo } from '../api/user';

const { Content } = Layout;

const pageDescriptions = {
    '告警管理 / 告警规则': '定义检测条件、分级和处置上下文。',
    '告警管理 / 添加告警规则': '为关键服务建立可解释、可执行的告警策略。',
    '告警管理 / 编辑告警规则': '调整规则条件、分级与通知策略。',
    '静默规则': '在维护窗口内抑制已知告警，保持告警流清晰。',
    '告警管理 / 规则模版组': '按团队和场景组织可复用的告警模版。',
    '告警管理 / 规则模版': '沉淀标准检测策略，让规则创建更快。',
    '通知管理 / 通知对象': '管理告警的接收人、渠道和投递方式。',
    '通知管理 / 通知模版': '统一不同渠道的告警消息内容。',
    '通知管理 / 通知记录': '查看每次投递的状态与响应线索。',
    '值班中心': '安排轮值、升级路径和当班响应人。',
    '值班中心 / 值班表': '维护团队的轮值时间表。',
    '人员组织 / 用户管理': '管理成员账号与工作区访问。',
    '人员组织 / 角色管理': '通过角色定义功能访问范围。',
    '租户管理': '维护工作区、配额和成员边界。',
    '租户管理 / 租户': '查看并调整当前租户的高级配置。',
    '数据源': '连接指标、日志、链路和云平台数据。',
    '仪表盘': '组织服务视图，让运行状态一目了然。',
    '仪表盘 / 目录': '浏览这个目录中的仪表盘。',
    '仪表盘 / 详情': '查看服务运行指标与趋势。',
    '日志审计': '追踪关键配置与访问行为。',
    '系统设置': '配置认证、通知、AI 与系统能力。',
    '网络分析 / 即时拨测': '快速验证一个目标的网络可达性。',
    '网络分析 / 拨测任务': '持续监测外部与内部网络链路。',
    '网络分析 / 创建拨测规则': '为关键链路建立持续探测。',
    '网络分析 / 编辑拨测规则': '调整拨测目标、频率和阈值。',
    '网络分析 / 拨测详情': '查看拨测结果与可用性趋势。',
    '个人信息': '管理你的账号与个人偏好。',
    '故障中心': '将告警、通知和升级流程组织为可响应的服务单元。',
    '故障中心 / 详情': '配置服务的告警路由和升级策略。',
    '记录规则': '预计算常用指标，缩短查询与告警计算时间。',
    '记录规则 / 规则': '浏览并维护记录规则。',
    '记录规则 / 新建规则': '创建可复用的预计算指标。',
    '记录规则 / 编辑规则': '调整记录规则表达式与标签。',
    '数据分析 / 指标查询': '探索实时指标，验证告警判断。',
    '服务发现': '查看 Prometheus 发现到的目标与标签。',
};

const LegacyPageHeader = ({ name }) => {
    const parts = name.split(' / ');
    const title = parts[parts.length - 1];
    return (
        <header className="legacy-page-header">
            <div className="legacy-page-header__eyebrow">{parts.slice(0, -1).join(' / ') || 'WATCHALERT'}</div>
            <div className="legacy-page-header__content">
                {parts.length > 1 && <Button className="legacy-page-header__back" type="text" icon={<LeftOutlined />} onClick={() => window.history.back()} />}
                <div>
                    <h1>{title}</h1>
                    <p>{pageDescriptions[name] || '集中查看并管理此工作区内容。'}</p>
                </div>
            </div>
        </header>
    );
};

const LoadingScreen = ({ label }) => (
    <div className="app-state-screen">
        <Spin size="large" />
        <span>{label}</span>
    </div>
);

const Components = ({ name, c }) => {
    const [state, setState] = useState({ loading: true, error: false });

    useEffect(() => {
        let mounted = true;

        const resolveTenant = async () => {
            const authorization = localStorage.getItem('Authorization');
            let tenantId = localStorage.getItem('TenantID');

            if (!authorization) {
                if (mounted) setState({ loading: false, error: true });
                return;
            }

            try {
                if (!tenantId) {
                    const user = await getUserInfo();
                    const tenants = await getTenantList({ userId: user?.data?.userid });
                    const firstTenant = tenants?.data?.[0];
                    if (firstTenant) {
                        localStorage.setItem('TenantName', firstTenant.name);
                        localStorage.setItem('TenantID', firstTenant.id);
                        localStorage.setItem('TenantIndex', '0');
                        tenantId = firstTenant.id;
                    }
                }
                if (mounted) setState({ loading: false, error: !tenantId });
            } catch (error) {
                console.error('Unable to initialize workspace:', error);
                if (mounted) setState({ loading: false, error: true });
            }
        };

        resolveTenant();
        return () => { mounted = false; };
    }, []);

    if (state.loading) return <LoadingScreen label="正在准备工作区…" />;

    if (state.error) {
        return (
            <div className="app-state-screen">
                <Result
                    status="warning"
                    title="无法打开工作区"
                    subTitle="请重新登录，或确认当前账号已加入至少一个租户。"
                    extra={<Button type="primary" icon={<LoginOutlined />} onClick={() => { localStorage.clear(); window.location.href = '/login'; }}>返回登录</Button>}
                />
            </div>
        );
    }

    return (
        <Layout className="app-shell">
            <ComponentSider />
            <Layout className="app-main-shell">
                <Content className={`app-content ${name === 'off' ? 'app-content--flush' : ''}`}>
                    {name !== 'off' && <LegacyPageHeader name={name} />}
                    <div className={name === 'off' ? 'app-page-body app-page-body--flush' : 'app-page-body'}>{c}</div>
                </Content>
                <footer className="app-footer">WatchAlert · Operations intelligence for your team</footer>
            </Layout>
        </Layout>
    );
};

export const ComponentsContent = Auth(Components);
