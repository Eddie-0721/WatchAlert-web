import React, { createContext, useContext } from 'react';
import { Alert, Form, Select } from 'antd';

export const CredentialContext = createContext({});
export function useCredentialRules(path, rules) {
    const configured = useContext(CredentialContext);
    return configured[path.join('.')] ? rules?.map(rule => ({ ...rule, required: false })) : rules;
}

const labels = {
    'auth.pass': '数据源认证密码',
    'http.url': '含凭据的 HTTP 地址',
    'write.url': '含凭据的写入地址',
    'http.headers': '全部 HTTP 请求头',
    'dsAliCloudConfig.alicloudAk': '阿里云 AccessKeyId',
    'dsAliCloudConfig.alicloudSk': '阿里云 AccessKeySecret',
    'awsCloudwatch.accessKey': 'AWS AccessKey',
    'awsCloudwatch.secretKey': 'AWS SecretKey',
    kubeConfig: 'Kubernetes 认证配置',
    'communicationConfig.email.token': '邮件授权码',
    'communicationConfig.phone.aliyun.AccessKeyId': '语音·阿里云 AccessKeyId',
    'communicationConfig.phone.aliyun.AccessKeySecret': '语音·阿里云 AccessKeySecret',
    'communicationConfig.phone.tencent.SecretID': '语音·腾讯云 SecretID',
    'communicationConfig.phone.tencent.SecretKey': '语音·腾讯云 SecretKey',
    'communicationConfig.sms.aliyun.AccessKeyId': '短信·阿里云 AccessKeyId',
    'communicationConfig.sms.aliyun.AccessKeySecret': '短信·阿里云 AccessKeySecret',
    'communicationConfig.sms.tencent.AppKey': '短信·腾讯云 AppKey',
    'aiConfig.appKey': '旧版 AI API Key',
    'agentConfig.model.apiKey': 'Agent 模型 API Key',
    'ldapConfig.adminPass': 'LDAP 管理员密码',
    'oidcConfig.clientSecret': 'OIDC 客户端密钥',
};

export default function CredentialEditor({ configured = {} }) {
    const options = Object.keys(configured).filter(key => configured[key] && labels[key])
        .map(value => ({ value, label: labels[value] }));
    if (!options.length) return null;
    return <>
        <Alert type="info" showIcon message="已保存的凭据不会回显"
            description={`已配置：${options.map(option => option.label).join('、')}。留空保留原值，填写新值替换。清除后相关连接可能不可用，保存前请核对。`} />
        <Form.Item name="clearCredentials" label="本次明确清除的凭据（可选）"
            extra="仅选择需要删除的凭据；不要同时填写该凭据的新值。">
            <Select mode="multiple" allowClear options={options} placeholder="不清除任何凭据" />
        </Form.Item>
    </>;
}
