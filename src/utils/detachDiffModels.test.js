import { expect, it, vi } from 'vitest';
import { detachDiffModels } from './detachDiffModels';

it('detaches with null before disposing both models', () => {
    const order = [];
    const original = { dispose: () => order.push('original') };
    const modified = { dispose: () => order.push('modified') };
    const editor = { getModel: () => ({ original, modified }), setModel: model => { expect(model).toBeNull(); order.push('detach'); } };
    detachDiffModels(editor);
    expect(order).toEqual(['detach', 'original', 'modified']);
});

it('honors retained models, disposes aliased models once and handles absent models', () => {
    const original = { dispose: vi.fn() };
    const modified = { dispose: vi.fn() };
    detachDiffModels({ getModel: () => ({ original, modified }), setModel: vi.fn() }, { keepCurrentOriginalModel: true });
    expect(original.dispose).not.toHaveBeenCalled();
    expect(modified.dispose).toHaveBeenCalledTimes(1);
    const aliased = { getModel: () => ({ original, modified: original }), setModel: vi.fn() };
    detachDiffModels(aliased, { keepCurrentModifiedModel: true });
    expect(original.dispose).not.toHaveBeenCalled();
    detachDiffModels(aliased);
    expect(original.dispose).toHaveBeenCalledTimes(1);
    expect(() => detachDiffModels(null)).not.toThrow();
    const empty = { getModel: () => null, setModel: vi.fn() };
    detachDiffModels(empty);
    expect(empty.setModel).toHaveBeenCalledWith(null);
});

it('does not hide detachment errors or free models still attached to the widget', () => {
    const original = { dispose: vi.fn() };
    const editor = { getModel: () => ({ original }), setModel: () => { throw new Error('detach failed'); } };
    expect(() => detachDiffModels(editor)).toThrow('detach failed');
    expect(original.dispose).not.toHaveBeenCalled();
});
