import type { ThemeConfig } from 'antd';

// Vercel-inspired surfaces, with WatchAlert's operational status semantics.
export const workspaceTheme: ThemeConfig = {
  token: {
    colorPrimary: '#171717', colorInfo: '#0070f3', colorSuccess: '#16a34a',
    colorWarning: '#d97706', colorError: '#dc2626', colorBgBase: '#fafafa',
    colorBgLayout: '#fafafa', colorBgContainer: '#ffffff', colorText: '#171717',
    colorTextSecondary: '#71717a', colorBorder: '#e4e4e7', colorBorderSecondary: '#ebebeb',
    borderRadius: 6, borderRadiusLG: 8, fontSize: 14, controlHeight: 36,
    fontFamily: 'Geist, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  components: {
    Button: { fontWeight: 500, primaryShadow: 'none' },
    Card: { paddingLG: 20 },
    Table: { headerBg: '#fafafa', rowHoverBg: '#fafafa' },
    Menu: { itemBorderRadius: 6, itemHeight: 36 },
    Modal: { borderRadiusLG: 12 },
  },
};
