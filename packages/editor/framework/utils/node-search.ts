export function closetBlockId(node: Node) {
  return (node instanceof HTMLElement ? node : node.parentElement)?.closest('[data-block-id]')?.getAttribute('data-block-id')
}

export function findNativeInputHost(target: EventTarget | Node | null) {
  const element = target instanceof HTMLElement
    ? target
    : target instanceof Node
      ? target.parentElement
      : null
  return element?.closest('input,textarea,select,[data-bc-native-input]') as HTMLElement | null
}

export function isNativeInputTarget(target: EventTarget | Node | null) {
  return !!findNativeInputHost(target)
}
