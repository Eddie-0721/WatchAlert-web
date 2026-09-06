import { ConfigProvider } from 'antd';
import { Suspense } from 'react';
import zhCN from 'antd/locale/zh_CN';
import { Helmet } from 'react-helmet';
import { useRoutes } from 'react-router-dom';
import { ReactFlowProvider } from 'reactflow';
import routes from './routes';
import { AppContextProvider } from './context/RuleContext';
import { workspaceTheme } from './theme';
import './index.css';
import './components/workspace.css';

export default function App() {
  const element = useRoutes(routes);
  return <AppContextProvider><ReactFlowProvider>
    <ConfigProvider locale={zhCN} theme={workspaceTheme}>
      <Helmet><title>WatchAlert</title></Helmet>
      <Suspense fallback={<div className="app-state-screen">正在加载页面…</div>}>{element}</Suspense>
    </ConfigProvider>
  </ReactFlowProvider></AppContextProvider>;
}
