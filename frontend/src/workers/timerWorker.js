let interval = null
self.onmessage = (e) => {
    if (e.data === 'start') {
        interval = setInterval(() => self.postMessage('tick'), 12000)
    }
    if (e.data === 'stop') {
        clearInterval(interval)
        interval = null
    }
}
