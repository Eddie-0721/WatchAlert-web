import {Button, Input, Table, Popconfirm, Space, Tooltip, Tag, Dropdown, Modal} from 'antd';
import React, { useState, useEffect } from 'react';
import NoticeTemplateCreateModal from './NoticeTemplateCreateModal';
import { getNoticeTmplList, deleteNoticeTmpl } from '../../../api/noticeTmpl';
import FeiShuIcon from '../img/feishu.svg?react';
import DingdingIcon from '../img/dingding.svg?react';
import EmailIcon from '../img/Email.svg?react';
import WeChatIcon from '../img/qywechat.svg?react'
import SlackIcon from '../img/slack.svg?react'
import { DeleteOutlined, EditOutlined, PlusOutlined, CopyOutlined, MoreOutlined } from "@ant-design/icons";
import {copyToClipboard} from "../../../utils/copyToClipboard";
import {HandleShowTotal} from "../../../utils/lib";
import {Breadcrumb} from "../../../components/Breadcrumb";


const { Search } = Input;

export const NoticeTemplate = () => {
    const [selectedRow, setSelectedRow] = useState(null);
    const [updateVisible, setUpdateVisible] = useState(false);
    const [visible, setVisible] = useState(false);
    const [createSelectedRow, setCreateSelectedRow] = useState(null);
    const [list, setList] = useState([]);

    // 表头
    const columns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            width: 240,
            render: (text, record) => (
                <div className="wa-resource-name-cell">
                    <span className="wa-resource-name" title={text}>{text}</span>
                    <Tooltip title="点击复制 ID">
                        <Button type="link" className="wa-resource-id" aria-label={`复制通知模板 ID ${text}`} title={record.id} onClick={() => copyToClipboard(record.id)}>
                            <span>{record.id}</span><CopyOutlined />
                        </Button>
                    </Tooltip>
                </div>
            ),
        },
        {
            title: '模版类型',
            dataIndex: 'noticeType',
            key: 'noticeType',
            width: 120,
            render: (text, record) => {
                if (record.noticeType === 'FeiShu') {
                    return (
                        <div style={{ display: 'flex' }}>
                            <FeiShuIcon style={{ height: '25px', width: '25px' }} />
                            <div style={{ marginLeft: '5px', marginTop: '5px', fontSize: '12px' }}>飞书</div>
                        </div>
                    );
                } else if (record.noticeType === 'DingDing') {
                    return (
                        <div style={{ display: 'flex' }}>
                            <DingdingIcon style={{ height: '25px', width: '25px' }} />
                            <div style={{ marginLeft: '5px', marginTop: '5px', fontSize: '12px' }}>钉钉</div>
                        </div>
                    );
                } else if (record.noticeType === 'Email') {
                    return (
                        <div style={{ display: 'flex' }}>
                            <EmailIcon style={{ height: '25px', width: '25px' }} />
                            <div style={{ marginLeft: '5px', marginTop: '5px', fontSize: '12px' }}>邮件</div>
                        </div>
                    );
                }  else if (record.noticeType === 'WeChat') {
                    return (
                        <div style={{ display: 'flex' }}>
                            <WeChatIcon style={{ height: '25px', width: '25px' }} />
                            <div style={{ marginLeft: '5px', marginTop: '5px', fontSize: '12px' }}>企业微信</div>
                        </div>
                    );
                }  else if (record.noticeType === 'Slack') {
                    return (
                        <div style={{ display: 'flex' }}>
                            <SlackIcon style={{ height: '25px', width: '25px' }} />
                            <div style={{ marginLeft: '5px', marginTop: '5px', fontSize: '12px' }}>Slack</div>
                        </div>
                    );
                }
                return '-';
            },
        },
        {
            title: '描述',
            dataIndex: 'description',
            key: 'description',
            width: 240,
            render: (text) => (!text ? '-' : <span className="wa-resource-description" title={text}>{text}</span>),
        },
        {
            title: "更新时间",
            dataIndex: "updateAt",
            key: "updateAt",
            width: 180,
            render: (text) => {
                const date = new Date(text * 1000)
                    return (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>{date.toLocaleString()}</span>
                        </div>
                    )
            },
        },
        {
            title: "操作人",
            dataIndex: "updateBy",
            key: "updateBy",
            width: 140,
            render: (text) => {
                return <Tag style={{
                                borderRadius: "12px",
                                padding: "0 10px",
                                fontSize: "12px",
                                fontWeight: "500",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                            }}
                        >
                            {text || "未知用户"}
                        </Tag>
            },
        },
        {
            title: '操作',
            dataIndex: 'operation',
            width: 60,
            fixed: 'right',
            render: (_, record) =>
                list.length >= 1 ? (
                    <Dropdown
                        menu={{
                            items: [
                                {
                                    key: 'edit',
                                    icon: <EditOutlined />,
                                    label: '更新',
                                    onClick: () => handleUpdateModalOpen(record)
                                },
                                {
                                    key: 'copy',
                                    icon: <CopyOutlined />,
                                    label: '复制',
                                    onClick: (e) => handleCopy(record, e)
                                },
                                {
                                    key: 'delete',
                                    icon: <DeleteOutlined />,
                                    label: '删除',
                                    danger: true,
                                    onClick: () => {
                                        Modal.confirm({
                                            title: "确定要删除此模版吗?",
                                            content: `模版名称: ${record.name}`,
                                            okText: "确定",
                                            cancelText: "取消",
                                            okType: 'danger',
                                            onOk: () => handleDelete(record)
                                        })
                                    }
                                }
                            ]
                        }}
                        trigger={['click']}
                        placement="bottomRight"
                    >
                        <Button
                            type="text"
                            aria-label={`更多操作：${record.name}`}
                            icon={<MoreOutlined />}
                            style={{ color: "#666" }}
                        />
                    </Dropdown>
                ) : null,
        },
    ];

    const [height, setHeight] = useState(window.innerHeight);

    useEffect(() => {
        // 定义一个处理窗口大小变化的函数
        const handleResize = () => {
            setHeight(window.innerHeight);
        };

        // 监听窗口的resize事件
        window.addEventListener('resize', handleResize);

        // 在组件卸载时移除监听器
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    const handleList = async () => {
        const res = await getNoticeTmplList();
        setList(res?.data);
    };

    const handleDelete = async (record) => {
        const params = {
            id: record.id,
            name: record.name,
        };
        await deleteNoticeTmpl(params);
        handleList();
    };

    const handleModalClose = () => {
        setCreateSelectedRow(null); // 关闭弹窗时清空数据
        setVisible(false);
    };

    const handleUpdateModalClose = () => {
        setUpdateVisible(false);
    };

    const handleUpdateModalOpen = (record) => {
        setSelectedRow(record);
        setUpdateVisible(true);
    };

    useEffect(() => {
        handleList();
    }, []);

    const onSearch = async (value) => {
        try {
            const params = {
                query: value,
            };
            const res = await getNoticeTmplList(params);
            setList(res?.data);
        } catch (error) {
            console.error(error);
        }
    };
    // 新增：处理复制逻辑
    const handleCopy = (record, e) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        
        // 深拷贝切断引用
        const copiedRecord = JSON.parse(JSON.stringify(record));
        copiedRecord.name = `${copiedRecord.name}-复制`;
        
        // 设置状态并打开抽屉
        setCreateSelectedRow(copiedRecord);
        setVisible(true); 
    };

    return (
        <>
            <Breadcrumb items={['通知管理', '通知模版']} />
            <div className="wa-list-toolbar">
                <div className="wa-list-toolbar__search">
                    <Search
                        allowClear
                        placeholder="输入搜索关键字"
                        onSearch={onSearch}
                    />
                </div>
                <div>
                    <Button
                        type="primary"
                        onClick={() => {
                            setCreateSelectedRow(null); // 确保正常创建时清空状态
                            setVisible(true)
                        }}
                        icon={<PlusOutlined />}
                    >
                        创建
                    </Button>
                </div>
            </div>

            <NoticeTemplateCreateModal 
                visible={visible} 
                onClose={handleModalClose} 
                selectedRow={createSelectedRow} 
                type='create' 
                handleList={handleList} 
            />

            <NoticeTemplateCreateModal
                visible={updateVisible}
                onClose={handleUpdateModalClose}
                selectedRow={selectedRow}
                type="update"
                handleList={handleList}
            />

            <div style={{ overflowX: 'auto', marginTop: 10}}>
                <Table
                    columns={columns}
                    dataSource={list}
                    scroll={{
                        y: height - 250, // 动态设置滚动高度
                        x: 980, // 窄屏时保持表头可读，表格内部滚动
                    }}
                    style={{
                        backgroundColor: "#fff",
                        borderRadius: "8px",
                        overflow: "hidden",
                    }}
                    pagination={{
                        showTotal: HandleShowTotal,
                        pageSizeOptions: ['10'],
                    }}
                    rowKey={(record) => record.id} // 设置行唯一键
                />
            </div>
        </>
    );
};
