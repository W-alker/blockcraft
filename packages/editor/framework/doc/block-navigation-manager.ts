import {
  filter,
  firstValueFrom,
  map,
  merge,
  ReplaySubject,
  take,
} from 'rxjs'
import type {BlockCraftDoc} from './index'

interface BlockNavigationRequest {
  readonly blockId: string
  readonly resolve: (success: boolean) => void
  settled: boolean
}

/** @internal Document-owned coordinator behind BlockCraftDoc.navigateToBlock(). */
export class BlockNavigationManager {
  private readonly destroyed$ = new ReplaySubject<void>(1)
  private activeRequest: BlockNavigationRequest | null = null
  private initializationPromise: Promise<boolean> | null = null
  private destroyed = false

  constructor(private readonly doc: BlockCraftDoc) {}

  navigateToBlock(blockId: string): Promise<boolean> {
    this.finish(this.activeRequest, false)
    if (this.destroyed) return Promise.resolve(false)

    let settle!: (success: boolean) => void
    const result = new Promise<boolean>(resolve => {
      settle = resolve
    })
    const request: BlockNavigationRequest = {
      blockId,
      resolve: settle,
      settled: false,
    }
    this.activeRequest = request
    void this.run(request)
    return result
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.finish(this.activeRequest, false)
    this.destroyed$.next()
    this.destroyed$.complete()
  }

  private async run(request: BlockNavigationRequest): Promise<void> {
    try {
      const initialized = await this.waitForInitialization()
      if (!initialized || !this.isActive(request)) return

      const success = this.doc.virtualization.enabled
        ? await this.doc.virtualization.scrollToBlock(request.blockId)
        : this.scrollMountedBlockIntoView(request.blockId)
      if (!this.isActive(request)) return
      this.finish(request, success)
    } catch (error) {
      if (!this.isActive(request)) return
      this.doc.logger.warn('blockNavigationError: ', error)
      this.finish(request, false)
    }
  }

  private waitForInitialization(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false)
    if (this.doc.isInitialized) return Promise.resolve(true)

    this.initializationPromise ??= firstValueFrom(
      merge(
        this.doc.afterInit$.pipe(
          filter(root => root !== null),
          map(() => true),
        ),
        this.destroyed$.pipe(map(() => false)),
      ).pipe(take(1)),
    )
    return this.initializationPromise
  }

  private scrollMountedBlockIntoView(blockId: string): boolean {
    if (!this.doc.model.exists(blockId)) return false
    const host = this.doc.vm.get(blockId)?.instance.hostElement
    if (!host || !this.doc.root.hostElement.contains(host)) return false
    host.scrollIntoView({
      behavior: 'auto',
      block: 'center',
      inline: 'nearest',
    })
    return true
  }

  private isActive(request: BlockNavigationRequest): boolean {
    return !this.destroyed && !request.settled && this.activeRequest === request
  }

  private finish(
    request: BlockNavigationRequest | null,
    success: boolean,
  ): void {
    if (!request || request.settled) return
    request.settled = true
    if (this.activeRequest === request) this.activeRequest = null
    request.resolve(success)
  }
}
