import { Form, Input, Button, Select, Drawer, Divider } from 'antd'
import React, { useState, useEffect } from 'react'
import {FaultCenterCreate} from "../../api/faultCenter";
import {getNoticeList} from "../../api/notice";
const MyFormItemContext = React.createContext([])

function toArr(str) {
    return Array.isArray(str) ? str : [str]
}

const MyFormItem = ({ name, ...props }) => {
    const prefixPath = React.useContext(MyFormItemContext)
    const concatName = name !== undefined ? [...prefixPath, ...toArr(name)] : undefined
    return <Form.Item name={concatName} {...props} />
}

export const CreateFaultCenter = ({ visible, onClose, handleList }) => {
    const [form] = Form.useForm()
    const [noticeOptions, setNoticeOptions] = useState([]); // 通知对象列表
    const [submitting, setSubmitting] = useState(false)


    useEffect(() => {
        handleGetNoticeData();

        form.setFieldsValue({
            repeatNoticeInterval: {
                P0: 60,
                P1: 120,
                P2: 360,
            },
            recoverWaitTime: 30,

        })
    }, []);

    // 禁止输入空格
    const [spaceValue, setSpaceValue] = useState('')

    const handleInputChange = (e) => {
        // 移除输入值中的空格
        const newValue = e.target.value.replace(/\s/g, '')
        setSpaceValue(newValue)
    }

    const handleKeyPress = (e) => {
        // 阻止空格键的默认行为
        if (e.key === ' ') {
            e.preventDefault()
        }
    }

    const handleCreate = async (data) => {
        try {
            await FaultCenterCreate(data)
            handleList()
        } catch (error) {
            console.error(error)
        }
    }


    const handleFormSubmit = async (values) => {
        const params = {
            ...values,
            aggregationType: "Rule",
            recoverNotify: true,
            repeatNoticeInterval: Object.entries(values.repeatNoticeInterval || {}).reduce((intervals, [level, value]) => {
                intervals[level] = Number(value)
                return intervals
            }, {}),
            recoverWaitTime: Number(values.recoverWaitTime),
        }

        setSubmitting(true)
        try {
            await handleCreate(params)
            onClose()
        } finally {
            setSubmitting(false)
        }
    }

    // 获取通知对象列表
    const handleGetNoticeData = async () => {
        const res = await getNoticeList();
        const newData = res.data?.map((item) => ({
            label: item.name,
            value: item.uuid,
        }));
        setNoticeOptions(newData);
    };


    return (
        <Drawer
            title={<div className="wa-form-drawer-title"><span>创建故障中心</span><small>为一个业务域定义告警归属、通知策略与处置边界。</small></div>}
            open={visible}
            onClose={onClose}
            className="wa-form-drawer"
            size="large"
            footer={<div className="wa-form-drawer-footer"><Button onClick={onClose}>取消</Button><Button type="primary" loading={submitting} onClick={() => form.submit()}>创建故障中心</Button></div>}
        >
            <Form form={form} name="form_item_path" layout="vertical" onFinish={handleFormSubmit} className="wa-form">
                <div className="wa-form-section-heading"><span>基础配置</span><small>名称用于告警归属和筛选，建议使用业务或服务域名称。</small></div>
                <MyFormItem name="name" label="名称"
                            rules={[
                                {
                                    required: true,
                                },
                            ]}
                >
                    <Input
                        value={spaceValue}
                        onChange={handleInputChange}
                        onKeyPress={handleKeyPress}/>
                </MyFormItem>

                <MyFormItem name="description" label="描述" extra="简要说明这个故障中心覆盖的业务范围和责任边界。">
                    <Input.TextArea rows={3} />
                </MyFormItem>

                <Divider />

                <div className="wa-form-section-heading"><span>通知策略</span><small>设置默认通知对象，以及不同告警等级的重复通知节奏。</small></div>
                <MyFormItem
                    name="noticeIds"
                    label="通知对象"
                    tooltip="默认通知对象"
                    style={{
                        marginRight: '10px',
                        width: '100%',
                    }}
                    rules={[
                        {
                            required: true,
                        },
                    ]}
                >
                    <Select
                        mode={"multiple"}
                        style={{
                            width: '100%',
                        }}
                        allowClear
                        placeholder="选择通知对象"
                        options={noticeOptions}
                    />
                </MyFormItem>

                <div style={{marginBottom: '16px'}}>
                    <div style={{marginBottom: '8px'}}>重复通知间隔</div>
                    <div style={{display: 'flex', gap: '12px', flexWrap: 'wrap'}}>
                        {['P0', 'P1', 'P2'].map((level) => (
                            <div key={level} style={{flex: '1 1 160px', minWidth: '160px'}}>
                                <MyFormItem
                                    name={['repeatNoticeInterval', level]}
                                    noStyle
                                    rules={[
                                        {
                                            required: true,
                                            message: `请输入${level}的重复通知间隔`,
                                        }
                                    ]}
                                >
                                    <Input
                                        type="number"
                                        style={{width: '100%'}}
                                        addonBefore={level}
                                        addonAfter="分钟"
                                        min={1}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            if (value !== '' && !/^\d+$/.test(value)) {
                                                e.target.value = value.replace(/\D/g, ''); // 移除非数字字符
                                            }
                                        }}
                                    />
                                </MyFormItem>
                            </div>
                        ))}
                    </div>
                </div>

                <MyFormItem
                    name="recoverWaitTime"
                    label="恢复等待"
                    tooltip={"告警恢复等待时间间隔（为了防止在告警触发恢复后紧接着再次触发告警条件，单位分钟默认1m）"}
                    style={{ width: '100%' }}
                    rules={[
                        {
                            required: true,
                            message: '请输入恢复等待时间',
                        }
                    ]}
                >
                    <Input
                        type="number"
                        style={{ width: '100%' }}
                        addonAfter="秒"
                        placeholder="30"
                        min={1}
                        onChange={(e) => {
                            const value = e.target.value;
                            if (value !== '' && !/^\d+$/.test(value)) {
                                e.target.value = value.replace(/\D/g, ''); // 移除非数字字符
                            }
                        }}
                    />
                </MyFormItem>

            </Form>
        </Drawer>
    )
}
