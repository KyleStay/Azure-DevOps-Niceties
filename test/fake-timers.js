function fakeTimers() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    async advance(duration) {
      const target = now + duration;
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        now = next[1].due;
        timers.delete(next[0]);
        next[1].callback();
        await new Promise((resolve) => setImmediate(resolve));
      }
      now = target;
    },
    count: () => timers.size,
  };
}

module.exports = { fakeTimers };
