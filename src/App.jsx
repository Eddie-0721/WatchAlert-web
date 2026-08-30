import React from 'react';
import { ConfigProvider, theme } from 'antd';
import { Helmet } from 'react-helmet';
import routes from './routes';
import { useRoutes } from 'react-router-dom';
import './index.css'
import { AppContextProvider } from './context/RuleContext';
import { ReactFlowProvider } from 'reactflow';

export default function App() {
    const element = useRoutes(routes);
    const title = "WatchAlert";

    return (
        <AppContextProvider>
            <ReactFlowProvider>
                <ConfigProvider
                    theme={{
                        algorithm: theme.defaultAlgorithm,
                        token: {
                            colorPrimary: '#18181b',
                            colorInfo: '#2563eb',
                            colorSuccess: '#16a34a',
                            colorWarning: '#d97706',
                            colorError: '#dc2626',
                            colorBgBase: '#fafafa',
                            colorBgLayout: '#fafafa',
                            colorBgContainer: '#ffffff',
                            colorBorder: '#e4e4e7',
                            colorBorderSecondary: '#eeeeef',
                            colorText: '#18181b',
                            colorTextSecondary: '#71717a',
                            borderRadius: 8,
                            borderRadiusLG: 10,
                            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
                        },
                        components: {
                            Button: { controlHeight: 34, fontWeight: 500 },
                            Card: { paddingLG: 20 },
                            Table: { headerBg: '#fafafa', rowHoverBg: '#fafafa' },
                            Menu: { itemBorderRadius: 7, itemHeight: 36 },
                        },
                    }}
                >
                    <Helmet>
                        <title>{title}</title>
                    </Helmet>
                    {element}
                </ConfigProvider>
            </ReactFlowProvider>
        </AppContextProvider>
    );
}
