import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

// Bundle the editor and workers locally; production must not depend on a CDN.
self.MonacoEnvironment = {
  getWorker(_, label) { return label === 'json' ? new JsonWorker() : new EditorWorker(); },
};
loader.config({ monaco });
