/** Package-internal bridge between group gestures and opted-in auto-fit views. */
const listeners = new WeakMap<object, {pause: (paused: boolean) => void; depth: number}>()

export function registerObjectResizePreview(block: object, pause: (paused: boolean) => void): () => void {
  const state = {pause, depth: 0}
  listeners.set(block, state)
  return () => { if (listeners.get(block) === state) listeners.delete(block) }
}

export function pauseObjectResizePreview(block: object): () => void {
  const state = listeners.get(block)
  if (!state) return () => {}
  if (++state.depth === 1) state.pause(true)
  let active = true
  return () => {
    if (!active) return
    active = false
    if (listeners.get(block) === state && --state.depth === 0) state.pause(false)
  }
}
