import type {BlockCraftDoc} from '../framework'

const BLOCK_ID_QUERY_PARAM = 'blockId'
const BLOCK_LINK_TARGET_ATTRIBUTE = 'data-bc-block-link-target'
const BLOCK_LINK_HIGHLIGHT_MS = 1_600

interface BlockLinkWindow {
  readonly location: Pick<Location, 'href'>
  addEventListener(
    type: 'popstate',
    listener: EventListenerOrEventListenerObject,
  ): void
  removeEventListener(
    type: 'popstate',
    listener: EventListenerOrEventListenerObject,
  ): void
  setTimeout(handler: TimerHandler, timeout?: number): number
  clearTimeout(id: number | undefined): void
}

/** URL and transient presentation adapter for the bundled editor host. */
export class BlockLinkNavigator {
  private highlightTimer: number | null = null
  private highlightedHost: HTMLElement | null = null
  private navigationVersion = 0
  private started = false
  private destroyed = false

  private readonly onPopState: EventListener = () => {
    void this.navigateFromCurrentUrl()
  }

  constructor(
    private readonly doc: BlockCraftDoc,
    private readonly browserWindow: BlockLinkWindow = window,
  ) {}

  start(): void {
    if (this.started || this.destroyed) return
    this.started = true
    this.browserWindow.addEventListener('popstate', this.onPopState)
    void this.navigateFromCurrentUrl()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.navigationVersion++
    if (this.started) {
      this.browserWindow.removeEventListener('popstate', this.onPopState)
    }
    this.started = false
    this.clearHighlight()
  }

  createBlockLink(blockId: string): string {
    const url = new URL(this.browserWindow.location.href)
    url.searchParams.set(BLOCK_ID_QUERY_PARAM, blockId)
    return url.href
  }

  openBlockLink(link: string): boolean {
    const target = this.parseUrl(link)
    const blockId = target?.searchParams.get(BLOCK_ID_QUERY_PARAM)
    if (!target || !blockId || !this.isSameDocument(target)) return false

    void this.navigateToBlock(blockId)
    return true
  }

  navigateFromCurrentUrl(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false)
    const current = this.parseUrl(this.browserWindow.location.href)
    const blockId = current?.searchParams.get(BLOCK_ID_QUERY_PARAM)
    if (!blockId) {
      this.navigationVersion++
      this.clearHighlight()
      return Promise.resolve(false)
    }
    return this.navigateToBlock(blockId)
  }

  private async navigateToBlock(blockId: string): Promise<boolean> {
    const version = ++this.navigationVersion
    this.clearHighlight()

    let success = false
    try {
      success = await this.doc.navigateToBlock(blockId)
    } catch {
      success = false
    }
    if (!success || this.destroyed || version !== this.navigationVersion) {
      return false
    }

    let host: HTMLElement | null = null
    try {
      host = this.doc.vm.get(blockId)?.instance.hostElement ?? null
      if (!host || !this.doc.root.hostElement.contains(host)) return false
    } catch {
      return false
    }

    host.setAttribute(BLOCK_LINK_TARGET_ATTRIBUTE, 'true')
    this.highlightedHost = host
    this.highlightTimer = this.browserWindow.setTimeout(() => {
      if (this.highlightedHost !== host) return
      host.removeAttribute(BLOCK_LINK_TARGET_ATTRIBUTE)
      this.highlightedHost = null
      this.highlightTimer = null
    }, BLOCK_LINK_HIGHLIGHT_MS)
    return true
  }

  private isSameDocument(target: URL): boolean {
    const current = this.parseUrl(this.browserWindow.location.href)
    return !!current && this.documentKey(current) === this.documentKey(target)
  }

  private documentKey(source: URL): string {
    const url = new URL(source.href)
    url.searchParams.delete(BLOCK_ID_QUERY_PARAM)
    url.searchParams.sort()
    return url.href
  }

  private parseUrl(value: string): URL | null {
    try {
      return new URL(value, this.browserWindow.location.href)
    } catch {
      return null
    }
  }

  private clearHighlight(): void {
    if (this.highlightTimer !== null) {
      this.browserWindow.clearTimeout(this.highlightTimer)
      this.highlightTimer = null
    }
    this.highlightedHost?.removeAttribute(BLOCK_LINK_TARGET_ATTRIBUTE)
    this.highlightedHost = null
  }
}
