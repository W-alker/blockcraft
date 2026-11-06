export type ResourcePlaceholderState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'

export interface ResourceIntrinsicSize {
  width: number
  height: number
  ar: number
}

export type ResourcePlaceholderElement =
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLIFrameElement

export interface ResourcePlaceholderAdapter<
  TElement extends ResourcePlaceholderElement = ResourcePlaceholderElement,
> {
  readonly kind: string
  readonly defaultTimeoutMs?: number
  subscribe(
    element: TElement,
    handlers: {
      ready: () => void
      error: () => void
    },
  ): () => void
  isReady(element: TElement): boolean
  readIntrinsicSize(element: TElement): ResourceIntrinsicSize | null
  retry(element: TElement): void
}

export interface ResourcePlaceholderBinding {
  element: ResourcePlaceholderElement
  adapter: ResourcePlaceholderAdapter
  resourceKey: unknown
  timeoutMs?: number
}

export interface ResourcePlaceholderControllerOptions {
  onStateChange?: (state: ResourcePlaceholderState) => void
  onIntrinsicSize?: (size: ResourceIntrinsicSize) => void
}
