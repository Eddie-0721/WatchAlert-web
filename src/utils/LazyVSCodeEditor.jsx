import { lazy, Suspense } from 'react';
import { Spin } from 'antd';

const Editor = lazy(() => import('./VSCodeEditor'));
const SQL = lazy(() => import('./sqlEditor'));
const Diff = lazy(() => import('./SafeDiffEditor'));

function EditorBoundary({ children, height }) {
  return <Suspense fallback={<div role="status" aria-label="正在加载编辑器" style={{ minHeight: height || 100, display: 'grid', placeItems: 'center' }}><Spin /></div>}>
    {children}
  </Suspense>;
}

export default function LazyVSCodeEditor(props) {
  return <EditorBoundary height={props.height}><Editor {...props} /></EditorBoundary>;
}
export function SqlEditor(props) {
  return <EditorBoundary height={props.height}><SQL {...props} /></EditorBoundary>;
}
export function SafeDiffEditor(props) {
  return <EditorBoundary height={props.height}><Diff {...props} /></EditorBoundary>;
}
