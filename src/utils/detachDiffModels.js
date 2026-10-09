// DiffEditor must stop observing its models before either text model is freed.
// The React wrapper disposes the widget later; retain any explicitly shared models.
export function detachDiffModels(editor, options = {}) {
    if (!editor) return;
    const models = editor.getModel();
    editor.setModel(null);
    if (!models) return;
    const retained = new Set([
        options.keepCurrentOriginalModel ? models.original : null,
        options.keepCurrentModifiedModel ? models.modified : null,
    ]);
    for (const model of new Set([models.original, models.modified])) {
        if (model && !retained.has(model)) model.dispose();
    }
}
