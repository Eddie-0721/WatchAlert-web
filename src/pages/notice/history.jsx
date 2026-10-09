"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
import {
    Table,
    message,
    Tag,
    Button,
    Drawer,
    Divider,
    Input,
    Select,
    Space,
    Typography,
    Descriptions,
    Tooltip,
    Empty,
    Skeleton,
} from "antd"
import { noticeRecordList } from "../../api/notice"
import TextArea from "antd/es/input/TextArea"
import { NotificationTypeIcon } from "./notification-type-icon"
import { SearchIcon, AlertTriangle } from "lucide-react"
import {HandleShowTotal} from "../../utils/lib";
import {ReloadOutlined} from "@ant-design/icons";

const { Search } = Input

// Constants
const SEVERITY_COLORS = {
    P0: '#ff4d4f',
    P1: '#faad14',
    P2: '#b0e1fb'
}

const SEVERITY_LABELS = {
    P0: "P0",
    P1: "P1",
    P2: "P2",
}

const ITEMS_PER_PAGE = 10

export const NoticeRecords = ({ noticeObjectId }) => {
    const [height, setHeight] = useState(window.innerHeight)
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState(false)
    const [list, setList] = useState([])
    const [selectedRecord, setSelectedRecord] = useState(null)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [filters, setFilters] = useState({
        severity: undefined,
        status: undefined,
        query: "",
    })
    const [pagination, setPagination] = useState({
        pageIndex: 1,
        pageSize: ITEMS_PER_PAGE,
        pageTotal: 0,
    })
    const requestSequence = useRef(0)
    const activeRequest = useRef(null)
    const searchTimer = useRef(null)
    const typedQuery = useRef(null)
    const previousQuery = useRef(filters.query)
    const [composing, setComposing] = useState(false)

    // Table columns definition
    const columns = useMemo(
        () => [
            {
                title: "规则名称",
                dataIndex: "ruleName",
                key: "ruleName",
                ellipsis: true,
                width: "130px",
                render: (_, record) => (
                    <Tooltip title={record.ruleName}>
                        <span
                            role="button"
                            tabIndex={0}
                            onClick={() => showDrawer(record)}
                            style={{ cursor: 'pointer', color: 'rgb(22, 119, 255)', textDecoration: 'none', marginTop: '1px' }}
                            >
                                {record.ruleName && record.ruleName.length > 25
                                ? `${record.ruleName.substring(0, 25)}...`
                                : record.ruleName}
                        </span>
                    </Tooltip>
                ),
            },
            {
                title: "告警等级",
                dataIndex: "severity",
                key: "severity",
                width: 120,
                render: (text) => (
                    <Tag
                        color={SEVERITY_COLORS[text]}
                        style={{
                            borderRadius: "12px",
                            padding: "0 10px",
                            fontSize: "12px",
                            fontWeight: "500",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                        }}
                    >
                        {/* <AlertTriangle size={12} /> */}
                        {SEVERITY_LABELS[text] || text}
                    </Tag>
                ),
            },
            {
                title: "通知类型",
                dataIndex: "nType",
                key: "nType",
                width: 120,
                render: (type) => (
                    <div style={{ display: "flex" }}>
                        <NotificationTypeIcon type={type} />
                    </div>
                ),
            },
            {
                title: "状态",
                dataIndex: "status",
                key: "status",
                width: 120,
                render: (status) =>
                    status === 0 ? (
                        <Tag
                            color="success"
                            style={{
                                borderRadius: "12px",
                                padding: "0 10px",
                                fontSize: "12px",
                                fontWeight: "500",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                            }}
                        >
                            发送成功
                        </Tag>
                    ) : (
                        <Tag
                            color="error"
                            style={{
                                borderRadius: "12px",
                                padding: "0 10px",
                                fontSize: "12px",
                                fontWeight: "500",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                            }}
                        >
                            发送失败
                        </Tag>
                    ),
            },
            {
                title: "通知时间",
                dataIndex: "createAt",
                key: "createAt",
                width: 140,
                render: (text) => {
                    const date = new Date(text * 1000)
                    return (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>{date.toLocaleString()}</span>
                        </div>
                    )
                },
            },
        ],
        [],
    )

    useEffect(() => {
        const handleResize = () => {
            setHeight(window.innerHeight)
        }

        window.addEventListener("resize", handleResize)

        return () => {
            window.removeEventListener("resize", handleResize)
        }
    }, [])

    // Fetch notification records
    const fetchRecords = useCallback(async () => {
        const request = ++requestSequence.current
        activeRequest.current?.abort()
        const controller = new AbortController()
        activeRequest.current = controller
        try {
            setLoading(true)
            setLoadError(false)
            const params = {
                index: pagination.pageIndex,
                size: pagination.pageSize,
                severity: filters.severity,
                status: filters.status,
                query: filters.query || undefined,
                uuid: noticeObjectId,
            }

            const res = await noticeRecordList(params, controller.signal)
            if (request !== requestSequence.current || controller.signal.aborted) return
            if (res?.code !== 200) throw new Error('加载通知记录失败')

            setList(res?.data?.list || [])
            setPagination(current => ({ ...current, pageTotal: res?.data?.total || 0 }))
        } catch (error) {
            if (request !== requestSequence.current || controller.signal.aborted) return
            setLoadError(true)
            console.error("Failed to load records:", error)
            message.error("加载通知记录失败，请稍后重试")
        } finally {
            if (request === requestSequence.current) setLoading(false)
        }
    }, [filters, noticeObjectId, pagination.pageIndex, pagination.pageSize])

    // One owner for initial/filter/page reads; resize setup must not fetch again.
    useEffect(() => {
        const deferRead = filters.query !== previousQuery.current && typedQuery.current === filters.query && filters.query !== ''
        previousQuery.current = filters.query
        typedQuery.current = null
        if (composing || deferRead) {
            setLoading(true)
            if (!composing) searchTimer.current = setTimeout(() => { searchTimer.current = null; fetchRecords() }, 300)
        } else {
            fetchRecords()
        }
        return () => {
            clearTimeout(searchTimer.current); searchTimer.current = null
            requestSequence.current++; activeRequest.current?.abort()
        }
    }, [fetchRecords, filters.query, composing])

    // Handle page change
    const handlePageChange = (page) => {
        const newPagination = {
            ...pagination,
            pageIndex: page.current,
            pageSize: page.pageSize,
        }
        setPagination(newPagination)
    }

    // Show drawer with record details
    const showDrawer = (record) => {
        setSelectedRecord(record)
        setDrawerOpen(true)
    }

    // Handle filter changes
    const handleFilterChange = (key, value) => {
        if (key === 'query') typedQuery.current = value
        setFilters((prev) => prev[key] === value ? prev : ({
            ...prev,
            [key]: value,
        }))
        setPagination(current => ({ ...current, pageIndex: 1 }))
    }

    // Handle refresh
    const handleRefresh = () => {
        if (composing) return
        clearTimeout(searchTimer.current); searchTimer.current = null
        fetchRecords()
    }

    const handleSearch = (value, event, info) => {
        // Clearing already updates filters; Antd also emits onSearch for it.
        if (composing || event?.nativeEvent?.isComposing || event?.nativeEvent?.keyCode === 229 || info?.source === 'clear' || value !== filters.query) return
        if (pagination.pageIndex !== 1) setPagination(current => ({ ...current, pageIndex: 1 }))
        else handleRefresh()
    }

    return (
        <div style={{ minHeight: "80vh" }}>
            {/* Filters */}
            <div
                style={{
                    marginTop: '-10px',
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                    marginBottom: "20px",
                }}
            >
                
                <Select
                    placeholder="告警等级"
                    allowClear
                    style={{ width: 140 }}
                    value={filters.severity}
                    onChange={(value) => handleFilterChange("severity", value)}
                    options={[
                        { value: "P0", label: "P0级告警" },
                        { value: "P1", label: "P1级告警" },
                        { value: "P2", label: "P2级告警" },
                    ]}
                    suffixIcon={<AlertTriangle size={14} />}
                />

                <Select
                    placeholder="发送状态"
                    allowClear
                    style={{ width: 140 }}
                    value={filters.status}
                    onChange={(value) => handleFilterChange("status", value)}
                    options={[
                        { value: "0", label: "发送成功" },
                        { value: "1", label: "发送失败" },
                    ]}
                />

                <Search
                    allowClear
                    placeholder="输入搜索关键字"
                    value={filters.query}
                    onChange={(e) => handleFilterChange("query", e.target.value)}
                    onSearch={handleSearch}
                    onCompositionStart={() => setComposing(true)}
                    onCompositionEnd={() => setComposing(false)}
                    style={{ width: 'min(100%, 300px)' }}
                    prefix={<SearchIcon size={14} />}
                />

                <Button type="default" icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
                    刷新
                </Button>
            </div>

            {/* Records Table */}
            <Table
                columns={columns}
                dataSource={loadError ? [] : list}
                loading={loading}
                scroll={{
                    y: height - 250,
                    x: "max-content",
                }}
                pagination={{
                    current: pagination.pageIndex,
                    pageSize: pagination.pageSize,
                    total: loadError ? 0 : pagination.pageTotal,
                    showTotal: HandleShowTotal,
                    showSizeChanger: true,
                    pageSizeOptions: ["10"],
                    style: { marginTop: "16px" },
                }}
                onChange={handlePageChange}
                style={{
                    backgroundColor: "#fff",
                    borderRadius: "8px",
                    overflow: "hidden",
                }}
                rowKey={(record) => record.id}
                locale={{
                    emptyText: <Empty description={loadError ? '通知记录加载失败，请点击刷新重试' : '暂无通知记录'} image={Empty.PRESENTED_IMAGE_SIMPLE} />,
                }}
            />

            {/* Detail Drawer */}
            <Drawer
                title={
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span>通知详情</span>
                    </div>
                }
                width={800}
                onClose={() => setDrawerOpen(false)}
                open={drawerOpen}
                styles={{
                    header: { borderBottom: "1px solid #f0f0f0", padding: "16px 24px" },
                    body: { padding: "24px" },
                }}
                extra={
                    selectedRecord && (
                        <Space>
                            <Tag
                                color={SEVERITY_COLORS[selectedRecord.severity]}
                                style={{
                                    borderRadius: "12px",
                                    padding: "0 10px",
                                    fontSize: "12px",
                                    fontWeight: "500",
                                }}
                            >
                                {selectedRecord.severity}
                            </Tag>
                            {selectedRecord.status === 0 ? (
                                <Tag color="success" style={{ borderRadius: "12px" }}>
                                    发送成功
                                </Tag>
                            ) : (
                                <Tag color="error" style={{ borderRadius: "12px" }}>
                                    发送失败
                                </Tag>
                            )}
                        </Space>
                    )
                }
            >
                {selectedRecord ? (
                    <Descriptions
                            bordered
                            column={1}
                            style={{ marginBottom: '24px' }}
                            labelStyle={{ width: '120px' }}
                            items={[
                                {
                                    label: '规则名称',
                                    children: selectedRecord.ruleName,
                                },
                                {
                                    label: '告警等级',
                                    children: <Tag color={SEVERITY_COLORS[selectedRecord.severity]}>{selectedRecord.severity}</Tag>,
                                },
                                {
                                    label: 'Request',
                                    children: (
                                       <TextArea
                                            value={selectedRecord.alarmMsg}
                                            style={{
                                                height: 250,
                                                resize: "none",
                                            }}
                                            readOnly
                                        />
                                    ),
                                },
                                {
                                    label: 'Response',
                                    children: (
                                       <TextArea
                                            value={selectedRecord.errMsg || "Success"}
                                            style={{
                                                height: 250,
                                                resize: "none",
                                            }}
                                            readOnly
                                        />
                                    ),
                                },
                            ]}
                        />
                ) : (
                    <Skeleton active paragraph={{ rows: 10 }} />
                )}
            </Drawer>
        </div>
    )
}
