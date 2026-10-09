import React, { useRef, useLayoutEffect } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import '../monacoSetup';
import { Spin } from 'antd'
import { detachDiffModels } from './detachDiffModels'

/**
 * 封装 Monaco DiffEditor，解决卸载时
 * "TextModel got disposed before DiffEditorWidget model got reset" 问题：
 * 在包装库的 passive cleanup 前解除关联并释放本组件拥有的模型，
 * 再让包装库处置编辑器。显式保留的外部模型不释放。
 */
const SafeDiffEditor = (props) => {
    const editorRef = useRef(null)
    const ownershipRef = useRef(props)
    ownershipRef.current = props

    const handleMount = (editor) => {
        editorRef.current = editor
    }

    // setModel(null) is the detach API; { original: null, modified: null }
    // is an invalid model. Save the model pair first so detaching cannot leak it.
    useLayoutEffect(() => {
        return () => {
            const editor = editorRef.current
            editorRef.current = null
            detachDiffModels(editor, ownershipRef.current)
        }
    }, [])

    return (
        <DiffEditor
            {...props}
            onMount={handleMount}
            loading={
                props.loading ?? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                        <Spin tip="加载 Diff 编辑器..." />
                    </div>
                )
            }
        />
    )
}

export default SafeDiffEditor
