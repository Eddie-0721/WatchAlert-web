"use client"

import React, { useEffect, useState, useContext, useMemo, useRef, useCallback } from "react"
import {Alert, Tabs, Form, Input, Select, Button, Collapse, Table, Tag, Spin, Typography, Space, message} from "antd"
import Marquee from "react-fast-marquee"
import { ProbingOnce } from "../../api/probing"
import {MinusCircleOutlined, PlusOutlined} from "@ant-design/icons";
import { Breadcrumb } from "../../components/Breadcrumb";


const { Panel } = Collapse

const validatePositiveInteger = (_, value) => {
    if (value === undefined || value === null || value === '') return Promise.resolve()
    return Number.isSafeInteger(Number(value)) && Number(value) > 0
        ? Promise.resolve()
        : Promise.reject(new Error('请输入大于 0 的整数'))
}

const isValidPort = (port) => {
    if (!port) {
        return true
    }

    const portNumber = Number(port)
    return Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535
}

// Context for managing nested form item names
const MyFormItemContext = React.createContext([])

// Component to provide a prefix path for nested Form.Items
const MyFormItemGroup = ({ prefix, children }) => {
    const prefixPath = useContext(MyFormItemContext)
    const concatPath = useMemo(() => [...prefixPath, ...(Array.isArray(prefix) ? prefix : [prefix])], [prefixPath, prefix])
    return <MyFormItemContext.Provider value={concatPath}>{children}</MyFormItemContext.Provider>
}

// Custom Form.Item that respects the MyFormItemContext prefix
const MyFormItem = ({ name, ...props }) => {
    const prefixPath = useContext(MyFormItemContext)
    const concatName = name !== undefined ? [...prefixPath, ...(Array.isArray(name) ? name : [name])] : undefined
    return <Form.Item name={concatName} {...props} />
}

export const OnceProbing = () => {
    const [probingType, setProbingType] = useState("HTTP")
    const [methodType, setMethodType] = useState("GET")
    const [responseData, setResponseData] = useState(null)
    const [form] = Form.useForm()
    const [loading, setLoading] = useState(false)
    const [requestError, setRequestError] = useState(null)
    const requestRef = useRef(null)
    const cancelRequest = useCallback(() => {
        const previous = requestRef.current
        requestRef.current = null
        previous?.abort()
    }, [])
    useEffect(() => cancelRequest, [cancelRequest])

    const clearProbeContext = () => {
        cancelRequest()
        setLoading(false)
        setResponseData(null)
        setRequestError(null)
    }

    const tabs = [
        { key: "1", label: "HTTP" },
        { key: "2", label: "ICMP" },
        { key: "3", label: "TCP" },
        { key: "4", label: "SSL" },
    ]

    const [height, setHeight] = useState(window.innerHeight)

    useEffect(() => {
        const handleResize = () => setHeight(window.innerHeight)
        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [])

    const handleChangeProbingType = (key) => {
        clearProbeContext()
        const types = { 1: "HTTP", 2: "ICMP", 3: "TCP", 4: "SSL" }
        setProbingType(types[key])
        // Reset form fields relevant to the previous probing type to avoid stale data
        form.resetFields([
            ['probingEndpointConfig', 'http', 'header'],
            ['probingEndpointConfig', 'http', 'body'],
            ['probingEndpointConfig', 'icmp', 'count'],
            ['probingEndpointConfig', 'icmp', 'interval']
        ]);
        if (types[key] !== "HTTP") {
            setMethodType("GET"); // Reset method type if not HTTP
        }
    }

    const validateInput = (_, value) => {
        // Internal hostnames and IPv6 are valid probe targets too. Syntax checks
        // here do not replace backend access controls or actual DNS resolution.
        const hostPattern = /^(?:[a-zA-Z0-9_.-]+|[a-fA-F0-9:]+(?:%[a-zA-Z0-9_.-]+)?)$/
        const tcpPattern = /^(\[[^\]\s]+\]|[a-zA-Z0-9_.-]+):(\d+)$/
        const validURL = (candidate) => {
            if (/\s/.test(candidate)) return false
            try {
                const parsed = new URL(candidate)
                return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname)
            } catch { return false }
        }

        if (!value) {
            return Promise.reject("请输入端点")
        }

        switch (probingType) {
            case "HTTP":
                return /^https?:\/\//i.test(value) && validURL(value)
                    ? Promise.resolve()
                    : Promise.reject("请输入有效的 http(s)://URL")
            case "ICMP":
                return hostPattern.test(value)
                    ? Promise.resolve()
                    : Promise.reject("请输入有效的 域名或IP")
            case "TCP":
                const tcpMatch = tcpPattern.exec(value)
                return tcpMatch && isValidPort(tcpMatch[2])
                    ? Promise.resolve()
                    : Promise.reject("请输入有效的 IP/域名:port")
            case "SSL":
                return !/[\s/?#@]/.test(value) && validURL(`https://${value}`)
                    ? Promise.resolve()
                    : Promise.reject("请输入有效的 域名或域名:端口")
            default:
                return Promise.resolve()
        }
    }

    const validateJson = (_, value) => {
        if (value && !isValidJson(value)) {
            return Promise.reject("请输入有效的 JSON 格式")
        }
        return Promise.resolve()
    }

    const isValidJson = (str) => {
        try {
            JSON.parse(str)
            return true
        } catch (e) {
            return false
        }
    }

    // Helper function to parse metrics data
    const parseMetricsData = (metricsArray) => {
        if (!Array.isArray(metricsArray)) return null
        
        const result = {}
        const firstMetric = metricsArray[0]
        
        // Get endpoint from labels
        if (firstMetric?.labels?.endpoint) {
            result.endpoint = firstMetric.labels.endpoint
        }
        
        // Parse different metric types
        metricsArray.forEach(metric => {
            switch (metric.name) {
                // HTTP metrics
                case 'probe_http_status_code':
                    result.statusCode = metric.value
                    break
                case 'probe_http_response_time_ms':
                    result.responseTime = metric.value
                    break
                case 'probe_http_success':
                    result.success = metric.value === 1
                    break
                    
                // ICMP metrics
                case 'probe_icmp_packet_loss_percent':
                    result.packetLoss = metric.value
                    break
                case 'probe_icmp_rtt_min_ms':
                    result.minRtt = metric.value
                    break
                case 'probe_icmp_rtt_max_ms':
                    result.maxRtt = metric.value
                    break
                case 'probe_icmp_rtt_avg_ms':
                    result.avgRtt = metric.value
                    break
                    
                // TCP metrics
                case 'probe_tcp_success':
                    result.tcpSuccess = metric.value === 1
                    break
                case 'probe_tcp_response_time_ms':
                    result.tcpResponseTime = metric.value
                    break
                    
                // SSL metrics
                case 'probe_ssl_certificate_expiry_days':
                    result.sslExpiryDays = metric.value
                    break
                case 'probe_ssl_response_time_ms':
                    result.sslResponseTime = metric.value
                    break
                case 'probe_ssl_certificate_valid':
                    result.sslValid = metric.value === 1
                    break
            }
        })
        
        return result
    }

    const handleSubmit = async () => {
        // Guard before async validation as well as while the request is pending.
        if (requestRef.current) return
        const controller = new AbortController()
        requestRef.current = controller
        try {
            const values = await form.validateFields()
            if (requestRef.current !== controller) return
            setLoading(true)
            setResponseData(null)
            setRequestError(null)
            const endpoint = values.probingEndpointConfig?.endpoint

            const params = {
                ruleType: probingType,
                probingEndpointConfig: {
                    endpoint: endpoint,
                    strategy: {
                        timeout: Number(values.probingEndpointConfig?.strategy?.timeout || 5),
                    },
                },
            }

            // Conditionally add HTTP specific configurations
            if (probingType === "HTTP") {
                params.probingEndpointConfig.http = {
                    method: methodType,
                }

                // Process header
                if (values.probingEndpointConfig?.http?.header && Array.isArray(values.probingEndpointConfig.http.header)) {
                    const headerObject = {};
                    values.probingEndpointConfig.http.header.forEach((headerItem) => {
                        if (
                            headerItem &&
                            typeof headerItem.key === 'string' &&
                            headerItem.key.trim() !== '' &&
                            Object.prototype.hasOwnProperty.call(headerItem, 'value')
                        ) {
                            headerObject[headerItem.key.trim()] = headerItem.value || "";
                        }
                    });
                    params.probingEndpointConfig.http.header = headerObject;
                }

                if (methodType === "POST" && values.probingEndpointConfig?.http?.body) {
                    params.probingEndpointConfig.http.body = values.probingEndpointConfig.http.body;
                }
            }

            // Conditionally add ICMP specific configurations
            if (probingType === "ICMP") {
                params.probingEndpointConfig.icmp = {
                    interval: Number(values.probingEndpointConfig?.icmp?.interval || 1),
                    count: Number(values.probingEndpointConfig?.icmp?.count || 10),
                }
            }

            const res = await ProbingOnce(params, { signal: controller.signal })
            if (requestRef.current !== controller || controller.signal.aborted) return
            if (res?.code !== 200) {
                throw new Error(typeof res?.data === 'string' ? res.data : '拨测请求失败，请稍后重试')
            }
            const requiredMetric = { HTTP: 'probe_http_success', ICMP: 'probe_icmp_packet_loss_percent', TCP: 'probe_tcp_success', SSL: 'probe_ssl_certificate_valid' }[probingType]
            if (!Array.isArray(res.data) || !res.data.some(metric => metric?.name === requiredMetric && Number.isFinite(metric.value))) {
                throw new Error('拨测未返回有效结果，请重试')
            }
            setResponseData(parseMetricsData(res.data))
            message.success('拨测完成')
        } catch (errorInfo) {
            if (requestRef.current !== controller || controller.signal.aborted) return
            if (errorInfo?.errorFields || errorInfo?.outOfDate) return
            const detail = errorInfo?.response?.data?.data
            setRequestError(typeof detail === 'string' ? detail : errorInfo?.code === 'ECONNABORTED' ? '拨测请求超时，请重试' : errorInfo?.message || '拨测请求失败，请稍后重试')
        } finally {
            if (requestRef.current === controller) {
                requestRef.current = null
                setLoading(false)
            }
        }
    }

    const HTTPColumns = [
        {
            title: "端点",
            key: "endpoint",
            width: "auto",
            render: () => <div>{responseData?.endpoint || "-"}</div>,
        },
        {
            title: "状态码",
            key: "statusCode",
            width: "auto",
            render: () => {
                const statusCode = responseData?.statusCode
                const isSuccess = statusCode >= 200 && statusCode < 300
                return (
                    <span
                        style={{
                            color: isSuccess ? "green" : "red",
                            fontWeight: "bold",
                        }}
                    >
                        {statusCode || "-"}
                    </span>
                )
            },
        },
        {
            title: "探测状态",
            key: "success",
            width: "auto",
            render: () => {
                const success = responseData?.success
                return (
                    <Tag color={success ? "green" : "red"}>
                        {success ? "成功" : "失败"}
                    </Tag>
                )
            },
        },
        {
            title: "响应延迟",
            key: "responseTime",
            width: "auto",
            render: () => <>{responseData.responseTime}ms</>,
        },
    ]

    const ICMPColumns = [
        {
            title: "端点",
            key: "endpoint",
            width: "auto",
            render: () => <div>{responseData?.endpoint || "-"}</div>,
        },
        {
            title: "丢包率",
            key: "packetLoss",
            width: "auto",
            render: () => {
                const packetLoss = responseData?.packetLoss
                if (packetLoss === undefined || packetLoss === null || packetLoss === "") {
                    return <Tag color="gray">未知</Tag>
                }
                return <Tag color={packetLoss < 80 ? "green" : "red"}>{`${packetLoss}%`}</Tag>
            },
        },
        {
            title: "最短 RTT",
            key: "minRtt",
            width: "auto",
            render: () => <>{responseData?.minRtt ? `${responseData.minRtt}ms` : "-"}</>,
        },
        {
            title: "最长 RTT",
            key: "maxRtt",
            width: "auto",
            render: () => <>{responseData?.maxRtt ? `${responseData.maxRtt}ms` : "-"}</>,
        },
        {
            title: "平均 RTT",
            key: "avgRtt",
            width: "auto",
            render: () => <>{responseData?.avgRtt ? `${responseData.avgRtt}ms` : "-"}</>,
        },
    ]

    const TCPColumns = [
        {
            title: "端点",
            key: "endpoint",
            width: "auto",
            render: () => <div>{responseData?.endpoint || "-"}</div>,
        },
        {
            title: "探测状态",
            key: "tcpSuccess",
            width: "auto",
            render: () => {
                const status = responseData?.tcpSuccess
                return (
                    <Tag color={status ? "green" : "red"}>
                        {status ? "成功" : "失败"}
                    </Tag>
                )
            },
        },
        {
            title: "响应延迟",
            key: "tcpResponseTime",
            width: "auto",
            render: () => <>{responseData?.tcpResponseTime ? `${responseData.tcpResponseTime}ms` : "-"}</>,
        },
    ]

    const SSLColumns = [
        {
            title: "端点",
            key: "endpoint",
            width: "auto",
            render: () => <div>{responseData?.endpoint || "-"}</div>,
        },
        {
            title: "证书状态",
            key: "sslValid",
            width: "auto",
            render: () => {
                const valid = responseData?.sslValid
                return (
                    <Tag color={valid ? "green" : "red"}>
                        {valid ? "有效" : "无效"}
                    </Tag>
                )
            },
        },
        {
            title: "剩余天数",
            key: "sslExpiryDays",
            width: "auto",
            render: () => {
                const expiryDays = responseData?.sslExpiryDays
                if (expiryDays === undefined || expiryDays === null) {
                    return "-"
                }
                const color = expiryDays > 30 ? "green" : expiryDays > 7 ? "orange" : "red"
                return (
                    <Tag color={color}>
                        {expiryDays} 天
                    </Tag>
                )
            },
        },
        {
            title: "响应延迟",
            key: "sslResponseTime",
            width: "auto",
            render: () => <>{responseData?.sslResponseTime ? `${responseData.sslResponseTime}ms` : "-"}</>,
        },
    ]

    const cols = { HTTP: HTTPColumns, ICMP: ICMPColumns, TCP: TCPColumns, SSL: SSLColumns }

    const initialFormValues = {
        probingEndpointConfig: {
            strategy: {
                timeout: 5, // Default timeout to 5 seconds
            },
            icmp: {
                count: 10,
                interval: 1,
            },
        },
    }

    const placeholderMessages = {
        HTTP: "请输入端点，如：https://github.com",
        ICMP: "请输入端点，如：127.0.0.1 / github.com",
        TCP: "请输入端点，如：127.0.0.1:80",
        SSL: "请输入端点，如：github.com 或 github.com:443",
    }

    return (
        <div>
            <Breadcrumb items={['网络分析', '即时拨测']} />
            <div>
                <Alert
                    banner
                    type="info"
                    message={
                        <Marquee pauseOnHover gradient={false}>
                            模拟真实用户从不同网络条件访问在线服务，持续对网络质量、网站性能、文件传输等场景进行可用性监测和性能监测。
                        </Marquee>
                    }
                />
                <Tabs defaultActiveKey="1" items={tabs} onChange={handleChangeProbingType} />
            </div>
            <Spin spinning={loading} tip="拨测中…">
            <div
                style={{
                    textAlign: "left",
                    marginTop: "-15px",
                    maxHeight: height - 300,
                    overflow: "auto",
                    padding: "10px",
                    border: "none",
                    borderRadius: "8px",
                    backgroundColor: "#fff",
                }}
            >
                <Form form={form} layout="vertical" style={{ marginTop: "10px" }} initialValues={initialFormValues} onValuesChange={clearProbeContext}>
                    {/* All form items related to probingEndpointConfig are nested here */}
                    <MyFormItemGroup prefix={["probingEndpointConfig"]}>
                        <MyFormItem
                            name="endpoint"
                            label=""
                            rules={[{ required: true, message: placeholderMessages[probingType] }, { validator: validateInput }]}
                        >
                            <Input
                                addonBefore={
                                    probingType === "HTTP" ? (
                                        <Select
                                            value={methodType}
                                            options={[
                                                { value: "GET", label: "GET" },
                                                { value: "POST", label: "POST" },
                                            ]}
                                            onChange={(value) => { clearProbeContext(); setMethodType(value) }}
                                        />
                                    ) : null
                                }
                                placeholder={placeholderMessages[probingType]}
                                addonAfter={
                                    <Button
                                        type="link"
                                        onClick={handleSubmit}
                                        disabled={loading}
                                        style={{
                                            borderLeft: "none",
                                            borderTopRightRadius: "0px",
                                            borderBottomRightRadius: "0px",
                                            height: "100%",
                                            fontSize: "13px",
                                        }}
                                    >
                                        拨测一下 ➡️
                                    </Button>
                                }
                                style={{
                                    borderTopRightRadius: "0px",
                                    borderBottomRightRadius: "0px",
                                }}
                            />
                        </MyFormItem>

                        <Collapse style={{ marginTop: "10px" }}>
                            <Panel header="高级选项" key="1">
                                {/* Strategy configuration */}
                                <MyFormItemGroup prefix={["strategy"]}>
                                    <MyFormItem name="timeout" label="超时时间 (秒)" rules={[{ validator: validatePositiveInteger }]}>
                                        <Input type="number" placeholder="请输入超时时间" />
                                    </MyFormItem>
                                </MyFormItemGroup>

                                {/* HTTP specific options */}
                                {probingType === "HTTP" && (
                                    <MyFormItemGroup prefix={["http"]}>
                                        <Typography.Text style={{marginBottom: 10, display: "block"}}>
                                            请求头
                                        </Typography.Text>
                                        <div
                                            style={{
                                                border: "1px solid #d9d9d9",
                                                borderRadius: "6px",
                                                padding: "16px",
                                                marginBottom: "24px",
                                            }}
                                        >
                                            <Form.List name={["probingEndpointConfig", "http", "header"]}>
                                                {(fields, {add, remove}) => (
                                                    <>
                                                        {fields.map(({key, name, ...restField}) => (
                                                            <Space key={key} style={{display: "flex", marginBottom: 8}}
                                                                   align="baseline">
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, "key"]}
                                                                    rules={[{required: true, message: "缺少键"}]}
                                                                    style={{flex: 1, width: "300px"}}
                                                                >
                                                                    <Input placeholder="键 (例如: Content-Type)"/>
                                                                </Form.Item>
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, "value"]}
                                                                    rules={[{required: true, message: "缺少值"}]}
                                                                    style={{flex: 1, width: "300px"}}
                                                                >
                                                                    <Input placeholder="值 (例如: application/json)"/>
                                                                </Form.Item>
                                                                <MinusCircleOutlined onClick={() => remove(name)}/>
                                                            </Space>
                                                        ))}
                                                        <Form.Item>
                                                            <Button type="dashed" onClick={() => add()} block
                                                                    icon={<PlusOutlined/>}>
                                                                添加请求头
                                                            </Button>
                                                        </Form.Item>
                                                    </>
                                                )}
                                            </Form.List>
                                        </div>

                                        {methodType === "POST" && (
                                            <MyFormItem name="body" label="请求体" rules={[{ validator: validateJson }]}>
                                                <Input.TextArea placeholder='请输入请求体，格式为 JSON，例如 {"key": "value"}' rows={5} />
                                            </MyFormItem>
                                        )}
                                    </MyFormItemGroup>
                                )}
                                {/* ICMP specific options */}
                                {probingType === "ICMP" && (
                                    <MyFormItemGroup prefix={["icmp"]}>
                                        <MyFormItem name="count" label="请求包数量" rules={[{ validator: validatePositiveInteger }]}>
                                            <Input type="number" min={1} placeholder="请输入请求包数量"/>
                                        </MyFormItem>
                                        <MyFormItem name="interval" label="请求间隔" rules={[{ validator: validatePositiveInteger }]}>
                                            <Input type="number" min={1} placeholder="请输入请求间隔时间"/>
                                        </MyFormItem>
                                    </MyFormItemGroup>
                                )}
                            </Panel>
                        </Collapse>
                    </MyFormItemGroup>

                    {requestError && <Alert type="error" showIcon message={requestError} style={{ marginTop: 16 }} />}
                    {responseData && (
                        <div style={{marginTop: "20px"}}>
                            <Table
                                columns={cols[probingType]}
                                dataSource={[responseData]}
                                pagination={false}
                                bordered
                                showHeader={true}
                                rowKey="key"
                                size="small"
                            />
                        </div>
                    )}
                </Form>
            </div>
            </Spin>
        </div>
    );
};
