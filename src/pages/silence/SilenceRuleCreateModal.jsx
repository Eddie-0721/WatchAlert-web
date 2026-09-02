"use client"

import { Alert, Button, DatePicker, Divider, Drawer, Form, Input, Select, Tag, message } from "antd"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import dayjs from "dayjs"
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons"
import { createSilence, updateSilence } from "../../api/silence"

const { RangePicker } = DatePicker
const emptyMatcher = () => ({ key: "", operator: "==", value: "" })
const matcherText = matcher => `${matcher.key}${matcher.operator || '=='}${matcher.value}`
const defaultRange = () => [dayjs(), dayjs().add(2, 'hour')]
const contextTitle = context => {
    const scope = [context?.scope?.environment, context?.scope?.service].filter(Boolean).join(' / ')
    return `${scope || '当前告警'} · ${context?.alertName || '临时静默'}`
}

export const CreateSilenceModal = ({
    visible,
    onClose,
    selectedRow,
    type = 'create',
    handleList,
    faultCenterId,
    silenceContext,
    faultCenters = [],
}) => {
    const [form] = Form.useForm()
    const [loading, setLoading] = useState(false)
    const [scopeMode, setScopeMode] = useState('service')
    const labels = Form.useWatch('labels', form) || []
    const timeRange = Form.useWatch('timeRange', form)
    const isUpdate = type === 'update'
    const hasContext = Boolean(silenceContext?.matchers)
    const effectiveCenterId = faultCenterId || silenceContext?.faultCenterId
    const effectiveCenterName = silenceContext?.faultCenterName || faultCenters.find(item => item.id === effectiveCenterId)?.name

    const options = useMemo(() => ({
        service: silenceContext?.matchers?.service || [],
        resource: silenceContext?.matchers?.resource || [],
        all: silenceContext?.matchers?.all || [],
    }), [silenceContext])

    const applyScope = useCallback((nextScope) => {
        setScopeMode(nextScope)
        const nextMatchers = options[nextScope] || []
        form.setFieldsValue({ labels: nextMatchers.length ? nextMatchers : [emptyMatcher()] })
    }, [form, options])

    useEffect(() => {
        if (!visible) return
        if (isUpdate && selectedRow) {
            form.setFieldsValue({
                name: selectedRow.name,
                comment: selectedRow.comment,
                faultCenterId: selectedRow.faultCenterId || effectiveCenterId,
                labels: selectedRow.labels?.length ? selectedRow.labels : [emptyMatcher()],
                timeRange: [dayjs.unix(selectedRow.startsAt), dayjs.unix(selectedRow.endsAt)],
            })
            setScopeMode('custom')
            return
        }

        const defaultMatchers = options.service?.length ? options.service : [emptyMatcher()]
        form.setFieldsValue({
            name: hasContext ? contextTitle(silenceContext) : '',
            comment: hasContext ? `来自告警「${silenceContext.alertName}」，请补充本次静默的处置原因。` : '',
            faultCenterId: effectiveCenterId,
            labels: defaultMatchers,
            timeRange: defaultRange(),
        })
        setScopeMode('service')
    }, [effectiveCenterId, form, hasContext, isUpdate, options.service, selectedRow, silenceContext, visible])

    const selectDuration = hours => {
        const start = dayjs()
        form.setFieldValue('timeRange', [start, start.add(hours, 'hour')])
    }

    const handleFormSubmit = async values => {
        const [startsAt, endsAt] = values.timeRange || []
        const normalizedMatchers = (values.labels || []).filter(item => item?.key && item?.operator && item?.value)
        const selectedCenter = effectiveCenterId || values.faultCenterId
        if (!startsAt || !endsAt) return message.error('请选择静默时间范围')
        if (!selectedCenter) return message.error('请选择故障中心')
        if (!normalizedMatchers.length) return message.error('请至少保留一条静默匹配条件')

        setLoading(true)
        try {
            const params = {
                name: values.name.trim(),
                comment: values.comment.trim(),
                labels: normalizedMatchers,
                startsAt: startsAt.unix(),
                endsAt: endsAt.unix(),
                faultCenterId: selectedCenter,
                status: 0,
            }
            if (isUpdate) await updateSilence({ ...params, id: selectedRow.id })
            else await createSilence(params)
            await handleList?.()
            message.success(isUpdate ? '静默规则已更新' : '静默规则已创建')
            onClose()
        } catch (error) {
            console.error('Unable to save silence rule:', error)
            message.error(error?.response?.data?.data || error?.message || '静默规则保存失败，请稍后重试')
        } finally {
            setLoading(false)
        }
    }

    const summary = labels.filter(item => item?.key && item?.value).map(matcherText).join('，')
    const rangeText = timeRange?.[0] && timeRange?.[1]
        ? `${timeRange[0].format('MM-DD HH:mm')} 至 ${timeRange[1].format('MM-DD HH:mm')}`
        : '请设置时间范围'
    const onlyActualResourceAvailable = Boolean(options.resource?.length && options.resource.length > options.service.length)

    return (
        <Drawer
            title={<div className="wa-form-drawer-title"><span>{isUpdate ? '编辑静默规则' : '创建静默规则'}</span><small>{isUpdate ? '调整规则生效范围与时间' : '告警仍会保留，静默只会抑制通知投递'}</small></div>}
            open={visible}
            onClose={onClose}
            className="wa-form-drawer wa-silence-drawer"
            width={680}
            zIndex={1200}
            destroyOnClose
            footer={<div className="wa-form-drawer-footer"><Button onClick={onClose}>取消</Button><Button type="primary" loading={loading} onClick={() => form.submit()}>{isUpdate ? '保存修改' : '创建静默'}</Button></div>}
        >
            <Form form={form} name="silence_form" layout="vertical" onFinish={handleFormSubmit} preserve={false} className="wa-form">
                {hasContext && !isUpdate && <section className="wa-silence-context"><div><span>来自当前告警</span><strong>{silenceContext.alertName}</strong><p>{[silenceContext.scope?.environment, silenceContext.scope?.service, silenceContext.scope?.cluster, silenceContext.scope?.namespace].filter(Boolean).join(' · ') || '事件未提供可识别的范围标签'}</p></div><Tag>已预填范围</Tag></section>}

                <section className="wa-form-section">
                    <div className="wa-form-section-heading"><span>基本信息</span><small>清晰记录意图，便于值班交接和审计。</small></div>
                    <Form.Item name="name" label="静默名称" rules={[{ required: true, whitespace: true, message: '请输入静默名称' }]}><Input placeholder="例如：生产 / payment-api · 发布期间静默" maxLength={120} showCount /></Form.Item>
                    {!effectiveCenterId ? <Form.Item name="faultCenterId" label="故障中心" rules={[{ required: true, message: '请选择故障中心' }]} extra="静默规则只在所属故障中心内生效。"><Select placeholder="请选择故障中心" options={faultCenters.map(item => ({ label: item.name, value: item.id }))} /></Form.Item> : <div className="wa-context-field"><span>故障中心</span><strong>{effectiveCenterName || effectiveCenterId}</strong></div>}
                    <Form.Item name="comment" label="静默原因" rules={[{ required: true, whitespace: true, message: '请说明静默原因' }]} extra="说明变更、维护或已知故障，方便后续追溯。"><Input.TextArea placeholder="例如：支付服务 15:00–16:00 灰度发布，已由 on-call 关注。" rows={3} maxLength={500} showCount /></Form.Item>
                </section>

                <Divider />

                <section className="wa-form-section">
                    <div className="wa-form-section-heading"><span>生效时间</span><small>从开始到结束期间，符合条件的告警不会发送通知。</small></div>
                    <div className="wa-duration-actions"><span>快速设置</span>{[[0.5, '30 分钟'], [1, '1 小时'], [2, '2 小时'], [4, '4 小时'], [8, '本班次']].map(([hours, label]) => <Button key={label} size="small" onClick={() => selectDuration(hours)}>{label}</Button>)}</div>
                    <Form.Item name="timeRange" label="时间范围" rules={[{ required: true, message: '请选择静默时间范围' }]}><RangePicker style={{ width: '100%' }} showTime format="YYYY-MM-DD HH:mm" placeholder={['开始时间', '结束时间']} /></Form.Item>
                </section>

                <Divider />

                <section className="wa-form-section">
                    <div className="wa-form-section-heading"><span>静默范围</span><small>仅使用当前告警真实携带的 Label 预填条件，不会猜测资源标签。</small></div>
                    {hasContext && !isUpdate && <div className="wa-scope-choice" role="radiogroup"><button type="button" className={scopeMode === 'service' ? 'is-active' : ''} onClick={() => applyScope('service')}><strong>当前环境与服务</strong><small>适合发布、维护等服务级操作</small></button><button type="button" disabled={!onlyActualResourceAvailable} className={scopeMode === 'resource' ? 'is-active' : ''} onClick={() => applyScope('resource')}><strong>仅当前资源</strong><small>{onlyActualResourceAvailable ? '额外锁定当前告警实际携带的资源标签' : '当前告警未提供可用的资源标签'}</small></button><button type="button" className={scopeMode === 'all' ? 'is-active' : ''} onClick={() => applyScope('all')}><strong>完整事件标签</strong><small>尽量只匹配同一类告警事件</small></button><button type="button" className={scopeMode === 'custom' ? 'is-active' : ''} onClick={() => { setScopeMode('custom'); form.setFieldsValue({ labels: [emptyMatcher()] }) }}><strong>自定义条件</strong><small>手动定义精确匹配范围</small></button></div>}
                    <Form.List name="labels">{(fields, { add, remove }) => <div className="wa-matcher-list">{fields.map(({ key, name, ...restField }) => <div className="wa-matcher-row" key={key}><Form.Item {...restField} name={[name, 'key']} rules={[{ required: true, whitespace: true, message: '请输入 Label 名称' }]}><Input placeholder="Label" /></Form.Item><Form.Item {...restField} name={[name, 'operator']} rules={[{ required: true, message: '请选择操作符' }]} initialValue="=="><Select options={[{ value: '==', label: '=' }, { value: '=~', label: '=~' }, { value: '!=', label: '!=' }, { value: '!~', label: '!~' }]} /></Form.Item><Form.Item {...restField} name={[name, 'value']} rules={[{ required: true, whitespace: true, message: '请输入匹配值' }]}><Input placeholder="匹配值" /></Form.Item><Button aria-label="删除匹配条件" type="text" icon={<DeleteOutlined />} disabled={fields.length === 1} onClick={() => remove(name)} /></div>)}<Button className="wa-add-matcher" type="dashed" icon={<PlusOutlined />} onClick={() => { setScopeMode('custom'); add(emptyMatcher()) }}>添加匹配条件</Button></div>}</Form.List>
                    <div className="wa-silence-summary"><span>将静默</span><strong>{summary || '请补充匹配条件'}</strong><small>{rangeText}</small></div>
                </section>

                <Alert className="wa-silence-note" showIcon type="info" message="静默不会关闭或恢复告警" description="告警状态仍会正常更新；静默只用于暂时抑制符合条件事件的通知投递。" />
            </Form>
        </Drawer>
    )
}
