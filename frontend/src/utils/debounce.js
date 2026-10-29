export function debounce(fn, wait) {
  let timer = null
  let lastArgs = null
  const invoke = () => {
    timer = null
    if (!lastArgs) return
    const args = lastArgs
    lastArgs = null
    fn(...args)
  }
  const wrapped = (...args) => {
    lastArgs = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(invoke, wait)
  }
  wrapped.flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    invoke()
  }
  wrapped.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    lastArgs = null
  }
  return wrapped
}
