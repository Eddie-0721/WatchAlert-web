import React, { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'github-markdown-css/github-markdown.css';
import {Empty} from "antd";

Object.entries({ bash, json, yaml, sql, go, python, javascript, typescript }).forEach(([name, grammar]) => SyntaxHighlighter.registerLanguage(name, grammar));

// 自定义代码块渲染器
const CodeRenderer = memo(function CodeRenderer({ language, value }) {
    return (
        <SyntaxHighlighter
            style={atomDark}
            language={language || 'text'}
            PreTag="div"
            wrapLines={true}
            customStyle={{
                backgroundColor: '#2d2d2d', // 代码块背景颜色
                borderRadius: '6px', // 圆角
                padding: '12px', // 内边距
                fontSize: '14px', // 字体大小
                margin: '1em 0', // 外边距
            }}
        >
            {value}
        </SyntaxHighlighter>
    );
});

// Stable component types keep completed Markdown nodes mounted while streaming.
const markdownComponents = {
    // 自定义标题渲染
    h1: ({ node, ...props }) => (
        <h1
            style={{
                fontSize: '2em',
                borderBottom: '2px solid #eaecef',
                paddingBottom: '0.3em',
                marginTop: '1.5em',
                marginBottom: '0.5em',
                color: '#222', // 标题颜色
            }}
            {...props}
        />
    ),
    h2: ({ node, ...props }) => (
        <h2
            style={{
                fontSize: '1.5em',
                borderBottom: '1px solid #eaecef',
                paddingBottom: '0.3em',
                marginTop: '1em',
                marginBottom: '0.5em',
                color: '#222', // 标题颜色
            }}
            {...props}
        />
    ),
    h3: ({ node, ...props }) => (
        <h3
            style={{
                fontSize: '1.25em',
                marginTop: '1em',
                marginBottom: '0.5em',
                color: '#222', // 标题颜色
            }}
            {...props}
        />
    ),
    h4: ({ node, ...props }) => (
        <h4
            style={{
                fontSize: '1em',
                marginTop: '1em',
                marginBottom: '0.5em',
                color: '#222', // 标题颜色
            }}
            {...props}
        />
    ),
    h5: ({ node, ...props }) => (
        <h5
            style={{
                fontSize: '0.875em',
                marginTop: '1em',
                marginBottom: '0.5em',
                color: '#222', // 标题颜色
            }}
            {...props}
        />
    ),
    h6: ({ node, ...props }) => (
        <h6
            style={{
                fontSize: '0.85em',
                marginTop: '1em',
                marginBottom: '0.5em',
                color: '#222', // 标题颜色
            }}
            {...props}
        />
    ),
    // 自定义段落渲染
    p: ({ node, ...props }) => (
        <p
            style={{
                lineHeight: '1.6',
                marginTop: '1em',
                marginBottom: '1em',
                color: '#333', // 段落颜色
            }}
            {...props}
        />
    ),
    // 自定义代码块渲染
    code: ({ node, inline, className, children, ...props }) => {
        const match = /language-(\w+)/.exec(className || '');
        return !inline && match ? (
            <CodeRenderer language={match[1]} value={String(children).replace(/\n$/, '')} />
        ) : (
            <code
                className={className}
                style={{
                    backgroundColor: '#2d2d2d', // 内联代码背景颜色
                    color: '#f8f8f2', // 内联代码字体颜色
                    padding: '2px 4px', // 内联代码内边距
                    borderRadius: '4px', // 内联代码圆角
                    fontSize: '14px', // 内联代码字体大小
                }}
                {...props}
            >
                {children}
            </code>
        );
    },
};

const MarkdownRenderer = ({ data }) => {
    const markdown = useMemo(() => (data || '')
        .replace(/\\\n/g, ' ')
        .replace(/(\r\n|\r|\n)/g, '\n\n'), [data]);

    if (!data) {
        return <div className="markdown-body" style={{ padding: '20px', backgroundColor: '#f9f9f9', textAlign: 'center' }}>
            <Empty imageStyle={{ height: 80 }} description={<span style={{ color: '#666' }}>暂无分析记录</span>} />
        </div>;
    }

    return <div className="markdown-body" style={{ padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px', color: '#333', lineHeight: '1.6' }}>
        <ReactMarkdown components={markdownComponents}>{markdown}</ReactMarkdown>
    </div>;
};

export default memo(MarkdownRenderer);
