import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { patchWordHighlighter } from '../../scripts/patch-monaco-word-highlighter.mjs';
import { CancellationError, errorHandler, onUnexpectedError } from 'monaco-editor/esm/vs/base/common/errors.js';
import { Delayer } from 'monaco-editor/esm/vs/base/common/async.js';

const source = readFileSync(new URL('../../node_modules/monaco-editor/esm/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.js', import.meta.url), 'utf8');
// Tests work both immediately after npm ci (already patched) and on the
// original package. Always exercise the pristine->patched transition as well.
const original = source.replaceAll(/(this\.runDelayer\.trigger\([^\r\n]+?\))\.catch\(onUnexpectedError\);/g, '$1;');

describe('versioned Monaco cancellation backport', () => {
  it('changes only the two known highlighter trigger statements and is idempotent', () => {
    const patched = patchWordHighlighter(original, '0.52.2');
    const before = original.split('\n');
    const after = patched.split('\n');
    expect(after).toHaveLength(before.length);
    const changed = after.filter((line, i) => line !== before[i]);
    expect(changed).toHaveLength(2);
    expect(changed.every(line => line.includes('this.runDelayer.trigger(') && line.endsWith('.catch(onUnexpectedError);'))).toBe(true);
    expect(patchWordHighlighter(patched, '0.52.2')).toBe(patched);
  });

  it('rejects unknown versions, missing calls, extra calls and partially applied patches', () => {
    expect(() => patchWordHighlighter(original, '0.53.0')).toThrow('revalidate/remove');
    expect(() => patchWordHighlighter('', '0.52.2')).toThrow('refusing');
    expect(() => patchWordHighlighter(original.replace('this._run();', 'this._run(false);'), '0.52.2')).toThrow('refusing');
    expect(() => patchWordHighlighter(original + '\nthis.runDelayer.trigger(() => {});', '0.52.2')).toThrow('refusing');
    expect(() => patchWordHighlighter(original.replace('this._run(); });', 'this._run(); }).catch(onUnexpectedError);'), '0.52.2')).toThrow('refusing');
  });

  it('uses Monaco cancellation handling without suppressing unexpected errors', async () => {
    const handler = vi.spyOn(errorHandler, 'onUnexpectedError').mockImplementation(() => {});
    try {
      await Promise.reject(new CancellationError()).catch(onUnexpectedError);
      expect(handler).not.toHaveBeenCalled();
      const failure = new Error('unexpected highlighter failure');
      await Promise.reject(failure).catch(onUnexpectedError);
      expect(handler).toHaveBeenCalledExactlyOnceWith(failure);
      const similarlyNamedFailure = new Error('Canceled');
      await Promise.reject(similarlyNamedFailure).catch(onUnexpectedError);
      expect(handler).toHaveBeenLastCalledWith(similarlyNamedFailure);
      expect(handler).toHaveBeenCalledTimes(2);
    } finally {
      handler.mockRestore();
    }
  });

  it('settles immediate pending-task disposal without executing the canceled work', async () => {
    const task = vi.fn();
    const delayer = new Delayer(50);
    const result = delayer.trigger(task).catch(onUnexpectedError);
    delayer.dispose();
    await expect(result).resolves.toBeUndefined();
    expect(task).not.toHaveBeenCalled();
  });
});
