import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Backport the two local Promise handlers used by upstream WordHighlighter.
// https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.ts
// Do not install a global error handler or alter Delayer for unrelated features.
const triggers = [
  'this.runDelayer.trigger(() => { this._onPositionChanged(e); })',
  'this.runDelayer.trigger(() => { this._run(); })',
];

export function patchWordHighlighter(source, version) {
  if (version !== '0.52.2') {
    throw new Error(`Monaco ${version}: revalidate/remove the 0.52.2 WordHighlighter backport before upgrading`);
  }
  const original = triggers.map(call => `${call};`);
  const patched = triggers.map(call => `${call}.catch(onUnexpectedError);`);
  const count = text => source.split(text).length - 1;
  const originalMatches = original.map(count);
  const patchedMatches = patched.map(count);
  const validShape = count('this.runDelayer.trigger(') === 2 &&
    source.includes('import { onUnexpectedError, onUnexpectedExternalError }');
  if (validShape && originalMatches.every(n => n === 0) && patchedMatches.every(n => n === 1)) {
    return source;
  }
  if (!validShape || !originalMatches.every(n => n === 1) || !patchedMatches.every(n => n === 0)) {
    throw new Error('Monaco WordHighlighter source differs from the reviewed patch; refusing a partial/unknown patch');
  }
  return original.reduce((text, statement, index) => text.replace(statement, patched[index]), source);
}

export function applyWordHighlighterPatch() {
  const packageRoot = new URL('../node_modules/monaco-editor/', import.meta.url);
  const { version } = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8'));
  const target = new URL('esm/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.js', packageRoot);
  const source = readFileSync(target, 'utf8');
  const patched = patchWordHighlighter(source, version);
  if (patched !== source) writeFileSync(target, patched);
  console.log(`Monaco ${version}: WordHighlighter cancellation backport ${patched === source ? 'verified' : 'applied'}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    applyWordHighlighterPatch();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
