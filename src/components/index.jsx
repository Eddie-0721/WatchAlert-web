import { useEffect, useState } from 'react';
import { Button, Layout, Result, Spin } from 'antd';
import { LoginOutlined } from '@ant-design/icons';
import './index.css';
import { ComponentSider } from './sider';
import Auth from '../utils/Auth';
import { getTenantList } from '../api/tenant';
import { getUserInfo } from '../api/user';

const { Content } = Layout;

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
                    {c}
                </Content>
                <footer className="app-footer">WatchAlert · Operations intelligence for your team</footer>
            </Layout>
        </Layout>
    );
};

export const ComponentsContent = Auth(Components);
