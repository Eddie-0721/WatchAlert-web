import { useEffect, useMemo, useState } from 'react';
import { Avatar, Dropdown, Spin, message } from 'antd';
import {
    Activity, BellRing, BookOpenText, Bot, CalendarDays, ChartNoAxesCombined,
    ChevronDown, ChevronRight, Database, FileClock, Gauge, GitBranch,
    LayoutDashboard, LifeBuoy, LogOut, Network, RadioTower, ScrollText,
    Settings, ShieldAlert, UsersRound, Workflow,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getUserInfo } from '../../api/user';
import { getTenant, getTenantList } from '../../api/tenant';
import './index.css';

const navigation = [
    {
        label: 'WORKSPACE',
        items: [
            { label: '态势', path: '/', icon: Gauge },
            { label: '告警', path: '/alerts', icon: BellRing, badge: true },
            { label: 'Copilot', path: '/copilot', icon: Bot, accent: true },
            { label: '仪表盘', path: '/folders', icon: LayoutDashboard },
            { label: '故障中心', path: '/faultCenter', icon: ShieldAlert },
        ],
    },
    {
        label: 'MANAGE',
        items: [
            { label: '告警规则', path: '/manage?tab=rules', icon: Workflow },
            { label: '通知与路由', path: '/manage?tab=routes', icon: GitBranch },
            { label: '数据源', path: '/manage?tab=sources', icon: Database },
            { label: '值班中心', path: '/dutyManage', icon: CalendarDays },
        ],
    },
    {
        label: 'EXPLORE',
        items: [
            { label: '数据分析', path: '/dataAnalysis', icon: ChartNoAxesCombined },
            { label: '网络分析', path: '/probing', icon: Network },
            { label: '服务发现', path: '/prometheusTargets', icon: RadioTower },
            { label: '记录规则', path: '/recordingRules', icon: ScrollText },
        ],
    },
];

const adminNavigation = [
    { label: '人员与权限', path: '/user', icon: UsersRound },
    { label: '日志审计', path: '/auditLog', icon: FileClock },
    { label: '系统设置', path: '/settings', icon: Settings },
];

export const ComponentSider = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [user, setUser] = useState(null);
    const [tenants, setTenants] = useState([]);
    const [tenant, setTenant] = useState(null);
    const [expanded, setExpanded] = useState({});

    useEffect(() => {
        let mounted = true;
        const loadWorkspace = async () => {
            try {
                const userRes = await getUserInfo();
                const currentUser = userRes?.data || {};
                const tenantRes = await getTenantList({ userId: currentUser.userid });
                const tenantList = tenantRes?.data || [];
                const activeTenantId = localStorage.getItem('TenantID') || tenantList[0]?.id;
                const tenantResDetail = activeTenantId ? await getTenant({ id: activeTenantId }) : null;
                if (!mounted) return;
                setUser(currentUser);
                setTenants(tenantList);
                setTenant(tenantResDetail?.data || tenantList.find(item => item.id === activeTenantId) || null);
            } catch (error) {
                console.error('Unable to load sidebar workspace:', error);
            }
        };
        loadWorkspace();
        return () => { mounted = false; };
    }, []);

    const tenantItems = useMemo(() => tenants.map(item => ({
        key: item.id,
        label: item.name,
        onClick: () => {
            localStorage.setItem('TenantID', item.id);
            localStorage.setItem('TenantName', item.name);
            window.location.assign('/');
        },
    })), [tenants]);

    const userItems = [
        { key: 'profile', label: '个人信息', icon: <UsersRound size={14} />, onClick: () => navigate('/profile') },
        { key: 'logout', label: '退出登录', icon: <LogOut size={14} />, danger: true, onClick: () => { localStorage.clear(); message.success('已退出登录'); navigate('/login'); } },
    ];

    const isActive = path => {
        const pathname = path.split('?')[0];
        if (pathname === '/') return location.pathname === '/';
        if (pathname === '/manage') return location.pathname === '/manage' && location.search === path.slice(pathname.length);
        return location.pathname.startsWith(pathname);
    };
    const activeAlertCount = 0;

    if (!user) {
        return <aside className="wa-sider wa-sider--loading"><Spin size="small" /></aside>;
    }

    return (
        <aside className="wa-sider">
            <div className="wa-sider-brand" onClick={() => navigate('/')} role="button" tabIndex={0}>
                <span className="wa-sider-mark"><Activity size={15} /></span>
                <span>WatchAlert</span>
            </div>

            <Dropdown menu={{ items: tenantItems }} trigger={['click']} placement="bottomLeft">
                <button className="wa-workspace-switcher">
                    <span className="wa-workspace-avatar">{(tenant?.name || 'O').slice(0, 2).toUpperCase()}</span>
                    <span className="wa-workspace-copy"><strong>{tenant?.name || localStorage.getItem('TenantName') || 'Ops Platform'}</strong><small>当前工作区</small></span>
                    <ChevronDown size={14} />
                </button>
            </Dropdown>

            <nav className="wa-navigation" aria-label="主导航">
                {navigation.map(group => (
                    <div className="wa-nav-group" key={group.label}>
                        <div className="wa-nav-label">{group.label}</div>
                        {group.items.map(item => {
                            const Icon = item.icon;
                            return (
                                <button key={item.path} className={`wa-nav-item ${isActive(item.path) ? 'is-active' : ''} ${item.accent ? 'is-accent' : ''}`} onClick={() => navigate(item.path)}>
                                    <Icon size={16} />
                                    <span>{item.label}</span>
                                    {item.badge && activeAlertCount > 0 ? <b>{activeAlertCount}</b> : null}
                                </button>
                            );
                        })}
                    </div>
                ))}

                {user.role === 'admin' && (
                    <div className="wa-nav-group">
                        <div className="wa-nav-label">SYSTEM</div>
                        {adminNavigation.map(item => {
                            const Icon = item.icon;
                            return <button key={item.path} className={`wa-nav-item ${isActive(item.path) ? 'is-active' : ''}`} onClick={() => navigate(item.path)}><Icon size={16} /><span>{item.label}</span></button>;
                        })}
                    </div>
                )}
            </nav>

            <div className="wa-sider-bottom">
                <button className="wa-nav-item wa-nav-item--help" onClick={() => setExpanded(current => ({ ...current, help: !current.help }))}><LifeBuoy size={16} /><span>帮助与支持</span><ChevronRight size={14} className={expanded.help ? 'wa-rotate' : ''} /></button>
                {expanded.help && <div className="wa-help-popover"><BookOpenText size={14} /> 查阅使用文档或联系管理员</div>}
                <Dropdown menu={{ items: userItems }} trigger={['click']} placement="topLeft">
                    <button className="wa-user-menu"><Avatar size={27}>{(user.username || 'U').slice(0, 1).toUpperCase()}</Avatar><span><strong>{user.username || '当前用户'}</strong><small>{user.role === 'admin' ? '管理员' : '成员'}</small></span><ChevronDown size={14} /></button>
                </Dropdown>
            </div>
        </aside>
    );
};
