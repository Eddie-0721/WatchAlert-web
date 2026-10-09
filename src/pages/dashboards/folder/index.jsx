import {Button, Table, Popconfirm, Input, Tooltip, Space, message, Dropdown, Modal} from 'antd'
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    deleteDashboardFolder,
    getFolderList
} from '../../../api/dashboard';
import CreateFolderModal from './create';
import {CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined, MoreOutlined} from "@ant-design/icons";
import { copyToClipboard } from "../../../utils/copyToClipboard";
import {HandleShowTotal} from "../../../utils/lib";
import { Breadcrumb } from "../../../components/Breadcrumb";


export const DashboardFolder = () => {
    const { Search } = Input
    const [list, setList] = useState()
    const [selectedRow, setSelectedRow] = useState(null)
    const [createModalVisible, setCreateModalVisible] = useState(false)
    const [updateModalVisible, setUpdateModalVisible] = useState(false)
    const columns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            render: (text, record) => (
                <div className="wa-resource-name-cell">
                    <Link
                        to={`/folder/${record.id}/list`}
                        className="wa-resource-name"
                        title={text}
                    >
                        {text}
                    </Link>
                    <Tooltip title="点击复制 ID">
                        <Button type="link" className="wa-resource-id" aria-label={`复制仪表盘目录 ID ${text}`} title={record.id} onClick={() => copyToClipboard(record.id)}>
                            <span>{record.id}</span><CopyOutlined />
                        </Button>
                    </Tooltip>
                </div>
            ),
        },
        {
            title: '端点',
            dataIndex: 'grafanaHost',
            key: 'grafanaHost',
        },
        {
            title: '目录ID',
            dataIndex: 'grafanaFolderId',
            key: 'grafanaFolderId',
        },
        {
            title: '版本',
            dataIndex: 'grafanaVersion',
            key: 'grafanaVersion',
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
                                    key: 'delete',
                                    icon: <DeleteOutlined />,
                                    label: '删除',
                                    danger: true,
                                    onClick: () => {
                                        Modal.confirm({
                                            title: "确定要删除吗?",
                                            content: `文件夹名称: ${record.name}`,
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
    ]

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

    useEffect(() => {
        handleList()
    }, [])


    const handleList = async () => {
        try {
            const res = await getFolderList();
            const d = res?.data?.map((item, index) => {
                return {
                    key: index,
                    ...item,
                }
            })
            setList(d);
        } catch (error) {
            console.error(error);
        }
    }

    const handleDelete = async (record) => {
        try {
            const params = {
                id: record.id,
                name: record.name,
            }
            await deleteDashboardFolder(params)
            handleList()
        } catch (error) {
            console.error(error)
        }
    }

    const handleModalClose = () => {
        setCreateModalVisible(false)
    }

    const handleUpdateModalOpen = (record) => {
        setUpdateModalVisible(true)
        setSelectedRow(record)
    }

    const handleUpdateModalClose = () => {
        setUpdateModalVisible(false)
    }

    const onSearch = async (value) => {
        try {
            const params = {
                query: value,
            }
            const res = await getFolderList(params)
            setList(res?.data)
        } catch (error) {
            console.error(error)
        }
        console.log(value)
    }

    return (
        <>
            <Breadcrumb items={['仪表盘']} />
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
                        onClick={() => { setCreateModalVisible(true) }}
                        icon={<PlusOutlined />}
                    >
                        创建
                    </Button>
                </div>
            </div>

            <CreateFolderModal
                visible={createModalVisible}
                onClose={handleModalClose}
                type="create"
                handleList={handleList}
            />

            <CreateFolderModal
                visible={updateModalVisible}
                onClose={handleUpdateModalClose}
                selectedRow={selectedRow}
                type="update"
                handleList={handleList}
            />

            <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <Table
                    columns={columns}
                    dataSource={list}
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
