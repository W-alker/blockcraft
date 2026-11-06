function resolveElement(target: EventTarget | Node | null): Element | null {
  if (!target || typeof (target as Node).nodeType !== 'number') return null
  const node = target as Node
  return node.nodeType === 1 ? node as Element : node.parentElement
}

export function closetBlockId(node: Node) {
  return resolveElement(node)?.closest('[data-block-id]')?.getAttribute('data-block-id')
}

export function findNativeInputHost(target: EventTarget | Node | null) {
  return resolveElement(target)?.closest('input,textarea,select,[data-bc-native-input]') as HTMLElement | null
}

export function isNativeInputTarget(target: EventTarget | Node | null) {
  return !!findNativeInputHost(target)
}
