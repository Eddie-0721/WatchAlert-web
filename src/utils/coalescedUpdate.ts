// Keep stream parsing lossless while bounding expensive view updates.
export function coalescedUpdate<T>(commit: (value: T) => void, interval = 50) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { value: T } | undefined;
  const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; pending = undefined; };
  const flush = () => {
    const value = pending;
    cancel();
    if (value) commit(value.value);
  };
  return {
    push(value: T) { pending = { value }; if (timer === undefined) timer = setTimeout(flush, interval); },
    flush,
    cancel,
  };
}
