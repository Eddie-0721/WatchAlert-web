import { loader } from '@monaco-editor/react';
// Keep the complete editor feature set, but register only languages used by
// WatchAlert. The package root also imports every basic language and web IDE
// services (CSS/HTML/TypeScript) that these forms never use.
import * as monaco from 'monaco-editor/esm/vs/editor/edcore.main.js';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js';
import 'monaco-editor/esm/vs/language/json/monaco.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

// Bundle the editor and workers locally; production must not depend on a CDN.
self.MonacoEnvironment = {
  getWorker(_, label) { return label === 'json' ? new JsonWorker() : new EditorWorker(); },
};
loader.config({ monaco });
