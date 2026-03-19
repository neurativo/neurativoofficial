// Resilience 7: Web Worker timer for 12-second recording chunks.
// Web Workers are NOT throttled by Chrome/Firefox when the tab is backgrounded,
// so students who alt-tab during a lecture still get properly timed chunks.
// The main thread setTimeout is throttled to ~1 tick/second in background tabs.

let interval = null;

self.onmessage = (e) => {
    if (e.data === 'start') {
        clearInterval(interval); // guard against double-start
        interval = setInterval(() => self.postMessage('tick'), 12000);
    }
    if (e.data === 'stop') {
        clearInterval(interval);
        interval = null;
    }
};
