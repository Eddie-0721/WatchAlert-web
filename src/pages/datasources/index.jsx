import React, { useState, useEffect } from 'react';
import {Button, Input, Table, Tag, Popconfirm, Tooltip, Space, message, Dropdown, Modal} from 'antd';
import { CreateDatasourceModal } from './DatasourceCreateModal';
import { deleteDatasource, getDatasourceList } from '../../api/datasource';
import PrometheusImg from "../alert/rule/img/Prometheus.svg?react"
import AlicloudImg from "../alert/rule/img/alicloud.svg?react"
import JaegerImg from "../alert/rule/img/jaeger.svg?react"
import AwsImg from "../alert/rule/img/AWSlogo.svg?react"
import LokiImg from "../alert/rule/img/L.svg?react"

import K8sImg from "../alert/rule/img/Kubernetes.svg?react"
import ESImg from "../alert/rule/img/ElasticSearch.svg?react"
import VLogImg from "../alert/rule/img/victorialogs.svg?react"
import CkImg from "../alert/rule/img/clickhouse.svg?react"
import './index.css'
import {CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined, MoreOutlined} from "@ant-design/icons";
import { copyToClipboard } from "../../utils/copyToClipboard";
import {HandleShowTotal} from "../../utils/lib";
import { Breadcrumb } from "../../components/Breadcrumb";

export const Datasources = () => {
    const { Search } = Input
    const [selectedRow, setSelectedRow] = useState(null);
    const [updateVisible, setUpdateVisible] = useState(false);
    const [visible, setVisible] = useState(false);
    const [list, setList] = useState([]);
    const [height, setHeight] = useState(window.innerHeight);
    const [columns] = useState([
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            render: (text, record) => (
                <div className="wa-resource-name-cell">
                    <span className="wa-resource-name" title={text}>{text}</span>
                    <Tooltip title="点击复制 ID">
                        <Button
                            type="link"
                            className="wa-resource-id"
                            aria-label={`复制数据源 ID ${text}`}
                            title={record.id}
                            onClick={() => copyToClipboard(record.id)}
                        >
                            <span>{record.id}</span>
                            <CopyOutlined />
                        </Button>
                    </Tooltip>
                </div>
            ),
        },
        {
            title: '数据源类型',
            dataIndex: 'type',
            key: 'type',
            render: (text, record) => {
                return (
                    <div style={{display: 'flex'}}>
                        {text === "Prometheus" && (
                            <PrometheusImg style={{height: "25px", width: "25px"}}/>
                        )}
                        {text === "CloudWatch" && (
                            <AwsImg style={{height: "25px", width: "25px"}}/>
                        )}
                        {text === "Loki" && (
                            <LokiImg style={{height: "25px", width: "25px"}}/>
                        )}
                        {text === "Jaeger" && (
                            <JaegerImg style={{height: "25px", width: "25px"}}/>
                        )}
                        {text === "AliCloudSLS" && (
                            <AlicloudImg style={{height: "25px", width: "25px"}}/>
                        )}

                        {text === "Kubernetes" && (
                            <K8sImg style={{height: "25px", width: "25px"}}/>
                        )}
                        {text === "ElasticSearch" && (
                            <ESImg style={{height: "25px", width: "25px"}}/>
                        )}
                        {text === "VictoriaLogs" && (
                            <VLogImg style={{height: "25px", width: "25px"}}/>
                        )}
                        {text === "ClickHouse" && (
                            <CkImg style={{height: "25px", width: "25px"}}/>
                        )}
                        <div style={{marginLeft: "5px", marginTop: '3px', fontSize: '12px'}}>{text}</div>
                    </div>
                )
            }
        },
        {
            title: '描述',
            dataIndex: 'description',
            key: 'description',
            render: (text, record, index) => {
                if (!text) {
                    return '没有留下任何描述~';
                }
                return <span className="wa-resource-description" title={text}>{text}</span>;
            },
        },
        {
            title: "更新时间",
            dataIndex: "updateAt",
            key: "updateAt",
            width: "auto",
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
            width: "auto",
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
            title: '状态',
            dataIndex: 'enabled',
            key: 'enabled',
            render: enabled => (
                <div className="status-container">
                    <div
                        className={`status-dot ${enabled ? 'status-enabled' : 'status-disabled'}`}
                    />
                    <span>{enabled ? '启用' : '禁用'}</span>
                </div>
            ),
        },
        {
            title: '操作',
            dataIndex: 'operation',
            fixed: 'right',
            width: 60,
            render: (_, record) => (
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
                                key: 'delete',
                                icon: <DeleteOutlined />,
                                label: '删除',
                                danger: true,
                                onClick: () => {
                                    Modal.confirm({
                                        title: "确定要删除吗?",
                                        content: `数据源名称: ${record.name}`,
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
            ),
        },
    ]);

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

    useEffect(() => {
        try {
            handleList();
        } catch (error) {
            console.error(error)
        }
    }, []);

    const handleList = async () => {
        try {
            const res = await getDatasourceList()
            setList(res?.data)
        } catch (error) {
            console.error(error)
        }
    }

    const handleDelete = async (record) => {
        try {
            const params = {
                id: record.id,
                name: record.name,
            }
            await deleteDatasource(params)
            handleList()
        } catch (error) {
            console.error(error)
        }
    };

    const handleModalClose = () => {
        setVisible(false)
    };

    const handleUpdateModalClose = () => {
        setUpdateVisible(false)
    }

    const handleUpdateModalOpen = (record) => {
        setSelectedRow(record)
        setUpdateVisible(true)
    };

    const onSearch = async (value) => {
        try {
            const params = {
                query: value,
            }
            const res = await getDatasourceList(params)
            setList(res?.data)
        } catch (error) {
            console.error(error)
        }
        console.log(value)
    }

    return (
        <>
            <Breadcrumb items={['数据源']} />
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
                        onClick={() => setVisible(true)}
                        icon={<PlusOutlined />}
                    >
                        创建
                    </Button>
                </div>
            </div>

            <CreateDatasourceModal visible={visible} onClose={handleModalClose} type='create' handleList={handleList} />

            <CreateDatasourceModal visible={updateVisible} onClose={handleUpdateModalClose} selectedRow={selectedRow} type="update" handleList={handleList} />

            <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <Table
                    dataSource={list}
                    columns={columns}
                    scroll={{
                        y: height - 250, // 动态设置滚动高度
                        x: 'max-content', // 水平滚动
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
