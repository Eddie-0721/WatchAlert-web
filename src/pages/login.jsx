'use client'
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './login.css';
import { checkUser, loginUser, registerUser, getOidcInfo } from '../api/user';
import { message } from "antd";
import { UserManager } from 'oidc-client';

export const Login = () => {
    const [showOidcButtons, setShowOidcButtons] = useState(false);
    const [adminExists, setAdminExists] = useState(null); // null: 加载中, false: 不存在, true: 存在
    const navigate = useNavigate();

    // 检查是否已登录
    useEffect(() => {
        const token = localStorage.getItem('Authorization');
        if (token) {
            const redirectPath = localStorage.getItem('redirectPath') || '/';
            localStorage.removeItem('redirectPath');
            navigate(redirectPath);
        }
    }, [navigate]);

    // 检查 admin 用户是否存在
    useEffect(() => {
        const checkAdminUser = async () => {
            try {
                const params = { identifier: 'admin' };
                const res = await checkUser(params);
                console.log(res?.data);
                // 返回 'ok' 表示用户存在
                setAdminExists(res?.data === 'ok');
            } catch (error) {
                console.error(error);
                setAdminExists(false);
            }
        };
        checkAdminUser();
    }, []);

    // 处理普通登录表单提交
    const onFinish = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const params = {
            identifier: formData.get('identifier'),
            password: formData.get('password'),
        };
        try {
            const response = await loginUser(params);
            if (response.data) {
                const info = response.data;
                localStorage.setItem('Authorization', info.token);
                localStorage.setItem('Identifier', info.identifier);
                localStorage.setItem('UserId', info.userId);
                const redirectPath = localStorage.getItem('redirectPath') || '/';
                localStorage.removeItem('redirectPath');
                navigate(redirectPath);
            }
        } catch (error) {
            message.error('用户名或密码错误');
        }
    };

    // 处理密码初始化并自动登录（admin 不存在时）
    const handleInitAndLogin = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const password = formData.get('password');
        const confirmPassword = formData.get('confirm-password');

        if (password !== confirmPassword) {
            message.error('两次输入的密码不一致');
            return;
        }

        try {
            // 1. 注册 admin 用户
            await registerUser({
                userid: 'admin',
                username: 'admin',
                email: 'admin@qq.com',
                phone: '18888888888',
                password: password,
                role: 'admin',
            });
            
            // 2. 自动登录
            const loginResponse = await loginUser({
                identifier: 'admin',
                password: password,
            });
            
            if (loginResponse.data) {
                const info = loginResponse.data;
                localStorage.setItem('Authorization', info.token);
                localStorage.setItem('Identifier', info.identifier);
                localStorage.setItem('UserId', info.userId);
                message.success('初始化成功，已自动登录');
                const redirectPath = localStorage.getItem('redirectPath') || '/';
                localStorage.removeItem('redirectPath');
                navigate(redirectPath);
            }
        } catch (error) {
            console.error(error);
            message.error('初始化失败，请稍后重试');
        }
    };

    const handleOidcLogin = async () => {
        try {
            const res = await getOidcInfo();
            if (res?.data?.authType !== 2) {
                message.error('OIDC 未启用，请联系管理员');
                return;
            }

            const oidcConfig = {
                authority: res?.data?.upperURI,
                client_id: res?.data?.clientID,
                client_secret: res?.data?.clientSecret,
                redirect_uri: res?.data?.redirectURI,
                response_type: 'code',
                scope: 'openid profile email',
            };
            const userManager = new UserManager(oidcConfig);
            userManager.signinRedirect();
        } catch (error) {
            console.error('获取 OIDC 信息失败:', error);
        }
    }

    return (
        <main className="login-screen">
            <section className="login-intro">
                <div className="login-brand"><span className="login-brand__mark">W</span><span>WatchAlert</span></div>
                <div className="login-intro__copy">
                    <span className="login-kicker">OPERATIONS INTELLIGENCE</span>
                    <h1>Keep every response<br />in one clear view.</h1>
                    <p>Connect signals, coordinate ownership, and turn alerts into focused operational work.</p>
                </div>
                <div className="login-intro__status"><i /> System status · Operational</div>
            </section>
            <section className="login-entry">
                <div className="login-card">
                    <span className="login-card__eyebrow">WORKSPACE ACCESS</span>
                    <h2>{adminExists === false ? '初始化工作区' : showOidcButtons ? '单点登录' : '欢迎回来'}</h2>
                    <p className="login-card__desc">{adminExists === false ? '创建管理员密码以完成首次配置。' : showOidcButtons ? '使用已配置的身份提供商继续。' : '登录以进入 WatchAlert 工作区。'}</p>
                    {adminExists === null ? (
                        <div className="login-loading"><span />正在检查工作区状态…</div>
                    ) : !adminExists ? (
                        <form onSubmit={handleInitAndLogin} className="login-form">
                            <label>管理员账号<input type="text" name="identifier" value="admin" readOnly className="login-input login-input--readonly" /></label>
                            <label>设置密码<input type="password" name="password" placeholder="至少 8 个字符" className="login-input" required /></label>
                            <label>确认密码<input type="password" name="confirm-password" placeholder="再次输入密码" className="login-input" required /></label>
                            <button type="submit" className="login-submit">初始化并进入工作区</button>
                        </form>
                    ) : !showOidcButtons ? (
                        <div className="login-form-wrap">
                            <form onSubmit={onFinish} className="login-form">
                                <label>账号<input type="text" name="identifier" placeholder="用户名、邮箱或手机号" className="login-input" required /></label>
                                <label>密码<input type="password" name="password" placeholder="输入密码" className="login-input" required /></label>
                                <button type="submit" className="login-submit">登录</button>
                            </form>
                            <button type="button" className="login-text-button" onClick={() => setShowOidcButtons(true)}>使用 SSO 登录 <span>→</span></button>
                        </div>
                    ) : (
                        <div className="login-form-wrap">
                            <button type="button" onClick={handleOidcLogin} className="login-sso-button">使用 OIDC 单点登录 <span>→</span></button>
                            <button type="button" className="login-text-button" onClick={() => setShowOidcButtons(false)}>使用账号密码登录</button>
                        </div>
                    )}
                </div>
                <p className="login-footer">WatchAlert · A calmer way to run operations</p>
            </section>
        </main>
    );
};
