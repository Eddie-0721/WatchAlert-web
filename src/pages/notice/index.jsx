import React, { useState, useEffect, useCallback } from 'react';
import {Button, Table, Popconfirm, message, Input, Tag, Space, Tooltip, Drawer, Select, Dropdown, Modal} from 'antd';
import { CreateNoticeObjectModal } from './NoticeObjectCreateModal';
import { deleteNotice, getNoticeList, createNotice } from '../../api/notice';
import {getDutyManagerList} from "../../api/duty";
import {CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined, MoreOutlined} from "@ant-design/icons";
import { copyToClipboard } from "../../utils/copyToClipboard";
import {HandleShowTotal} from "../../utils/lib";
import { noticeRecordList } from '../../api/notice';
import { NoticeRecords } from './history';
import { Breadcrumb } from "../../components/Breadcrumb";


export const NoticeObjects = () => {
    const { Search } = Input
    const [selectedRow, setSelectedRow] = useState(null);
    const [updateVisible, setUpdateVisible] = useState(false);
    const [visible, setVisible] = useState(false);
    const [list, setList] = useState([]);
    const [dutyList, setDutyList] = useState([])
    const [height, setHeight] = useState(window.innerHeight);
    const [historyDrawerVisible, setHistoryDrawerVisible] = useState(false);
    const [selectedNoticeObject, setSelectedNoticeObject] = useState(null);
    const [createSelectedRow, setCreateSelectedRow] = useState(null); // 用于存放复制时带入的数据
    const columns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            width: 240,
            render: (text, record) => (
                <div className="wa-resource-name-cell">
                    <Button type="link" className="wa-resource-name" title={text} onClick={() => handleShowHistory(record)}>
                        {text}
                    </Button>
                    <Tooltip title="点击复制 ID">
                        <Button type="link" className="wa-resource-id" aria-label={`复制通知对象 ID ${text}`} title={record.uuid} onClick={() => copyToClipboard(record.uuid)}>
                            <span>{record.uuid}</span><CopyOutlined />
                        </Button>
                    </Tooltip>
                </div>
            ),
        },
        {
            title: '值班表',
            dataIndex: 'dutyId',
            key: 'dutyId',
            width: 240,
            render: (text, record) => (
                <span>
                  {getDutyNameById(record.dutyId)
                      .split(", ")
                      .map((name, index) => (
                          <Tag color="processing" key={index}>
                              {name}
                          </Tag>
                      ))}
                </span>
            ),
        },
        {
            title: "更新时间",
            dataIndex: "updateAt",
            key: "updateAt",
            width: "180px",
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
            fixed: 'right',
            width: 60,
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
                                            title: "确定要删除吗?",
                                            content: `通知对象名称: ${record.name}`,
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

    const handleList = useCallback(async () => {
        handleDutyManagerList()

        try {
            const res = await getNoticeList()
            setList(res?.data);
        } catch (error) {
            message.error(error);
        }
    }, []);

    useEffect(() => {
        handleList();
    }, [handleList]);

    const handleDutyManagerList = async () => {
        try {
            const res = await getDutyManagerList()
            setDutyList(res?.data);
        } catch (error) {
            message.error(error);
        }
    };

    const getDutyNameById = (id) =>{
        const datasource = dutyList.find((d) => d.id === id)
        return datasource ? datasource.name : "-"
    }

    const handleUpdateModalClose = () => {
        setUpdateVisible(false);
    };

    const handleUpdateModalOpen = (record) => {
        setSelectedRow(record);
        setUpdateVisible(true);
    };

    const handleDelete = async (record) => {
        try {
            const params = {
                uuid: record.uuid,
                name: record.name,
            }
            await deleteNotice(params)
            handleList();
        } catch (error) {
            message.error(error);
        }
    };
    
    const handleCopy = (record, e) => {
        // 1. 阻止事件冒泡，防止表格被意外选中或拦截
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        
        // 2. 打印日志用于调试（按 F12 可以在控制台看到这行输出）
        console.log("【调试】点击了复制按钮，当前行数据：", record);

        // 3. 使用深拷贝，彻底切断与原表格数据的引用关联
        const copiedRecord = JSON.parse(JSON.stringify(record));
        copiedRecord.name = `${copiedRecord.name}-复制`;
        
        // 4. 设置状态并打开抽屉
        setCreateSelectedRow(copiedRecord);
        setVisible(true); 
    };

    const handleModalClose = () => {
        setVisible(false);
        setCreateSelectedRow(null); // 关闭弹窗时清空复制产生的数据
    };

    const onSearch = async (value) => {
        try {
            const params = {
                query: value,
            }
            const res = await getNoticeList(params)
            setList(res?.data)
        } catch (error) {
            console.error(error)
        }
    }

    const handleShowHistory = (record) => {
        setSelectedNoticeObject(record);
        setHistoryDrawerVisible(true);
    };

    const handleHistoryDrawerClose = () => {
        setHistoryDrawerVisible(false);
        setSelectedNoticeObject(null);
    };

    return (
        <>
            <Breadcrumb items={['通知管理', '通知对象']} />
            <div className="wa-list-toolbar">
                <div className="wa-list-toolbar__search">
                    <Search allowClear placeholder="输入搜索关键字" onSearch={onSearch} />
                </div>
                <div>
                    <Button
                        type="primary"
                        onClick={() => {
                            setCreateSelectedRow(null); // 确保正常创建时是个空表单
                            setVisible(true)}}
                        icon={<PlusOutlined />}
                    >
                        创建
                    </Button>
                </div>
            </div>

            <CreateNoticeObjectModal 
                visible={visible} 
                onClose={handleModalClose} 
                selectedRow={createSelectedRow} 
                type='create' 
                handleList={handleList} 
            />

            <CreateNoticeObjectModal visible={updateVisible} onClose={handleUpdateModalClose} selectedRow={selectedRow} type='update' handleList={handleList} />

            <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <Table
                    columns={columns}
                    dataSource={list}
                    scroll={{
                        y: height - 250, // 动态设置滚动高度
                        x: 900, // 保证窄屏表头不被压成竖排
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

            {/* 通知历史记录 Drawer */}
            <Drawer
                title={`通知记录 - ${selectedNoticeObject?.name || ''}`}
                open={historyDrawerVisible}
                onClose={handleHistoryDrawerClose}
                width={1000}
                destroyOnClose={true}
            >
                {selectedNoticeObject && (
                    <NoticeRecords noticeObjectId={selectedNoticeObject.uuid} />
                )}
            </Drawer>
        </>
    );
};
