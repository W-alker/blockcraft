import {signal} from '@angular/core'
import {LINK_BLOCK_RESOLVER, type LinkBlockTarget, type LinkBlockResolveContext, type LinkBlockResolution} from './link-block-resolver'
import {isFigmaUrl, isJueJinUrl} from '../global'
import {normalizeEmbedUrl} from '../blocks/embed-blocks/embed-block/source'
import {isSelectionAlive} from '../framework/modules/selection/liveness'

/** Builtin fallback for hosts that do not handle a link; never called for a rejected link. */
export function getEmbedViewFlavour(url: string, schemas: {has(flavour: BlockCraft.BlockFlavour): boolean}) {
  if (!normalizeEmbedUrl(url)) return null
  if (schemas.has('embed')) return 'embed' as const
  if (isFigmaUrl(url) && schemas.has('figma-embed')) return 'figma-embed' as const
  if (isJueJinUrl(url) && schemas.has('juejin-embed')) return 'juejin-embed' as const
  return null
}

/** Menu preparation and conversion share one protocol; execution always resolves again. */
export async function resolveLinkBlockTarget(url: string, doc: BlockCraft.Doc, context: LinkBlockResolveContext): Promise<LinkBlockTarget | null> {
  const normalized = normalizeEmbedUrl(url)
  if (!normalized || context.signal.aborted) return null
  const resolver = doc.injector?.get(LINK_BLOCK_RESOLVER, null)
  const result: LinkBlockResolution = resolver
    ? await resolver.resolve(normalized, context) : {kind: 'unhandled'}
  if (context.signal.aborted) return null
  if (result?.kind === 'blocked') return null
  if (result?.kind === 'unhandled') {
    const flavour = getEmbedViewFlavour(normalized, doc.schemas)
    return flavour ? {kind: 'block', label: '嵌入视图', flavour, params: [normalized]} : null
  }
  if (result?.kind !== 'block' || typeof result.flavour !== 'string'
    || typeof result.label !== 'string' || !result.label.trim() || !Array.isArray(result.params)) {
    throw new Error('链接解析器返回了无效的块目标')
  }
  // A handled but unsupported target must never become an unrelated iframe fallback.
  if (!doc.schemas.has(result.flavour) || doc.schemas.get(result.flavour)?.nodeType === 'root') return null
  return {...result, label: result.label.trim()}
}

/** Shared async menu state; late, failed and destroyed requests cannot expose stale actions. */
export class LinkBlockMenuState {
  readonly target = signal<LinkBlockTarget | null>(null)
  readonly loading = signal(false)
  readonly failed = signal(false)
  private controller?: AbortController
  private release?: {unsubscribe(): void}

  load(url: string, doc: BlockCraft.Doc) {
    this.cancel()
    this.target.set(null)
    this.failed.set(false)
    const controller = new AbortController()
    this.controller = controller
    this.loading.set(true)
    this.release = doc.onDestroy$?.subscribe(() => this.cancel())
    void resolveLinkBlockTarget(url, doc, {phase: 'menu', signal: controller.signal}).then(target => {
      if (!controller.signal.aborted) this.target.set(target)
    }, () => {
      if (!controller.signal.aborted) this.failed.set(true)
    }).finally(() => {
      if (this.controller !== controller) return
      this.loading.set(false)
      this.release?.unsubscribe()
      this.release = undefined
    })
  }

  cancel() {
    this.controller?.abort()
    this.controller = undefined
    this.release?.unsubscribe()
    this.release = undefined
    this.loading.set(false)
    this.target.set(null)
  }
}

/** 一次视图转换独立撤销，并在替换源块前保留可恢复的模型选区。 */
export function runLinkViewChange(doc: BlockCraft.Doc, source: BlockCraft.BlockComponent, targetId: string, mutate: () => unknown) {
  const selection = doc.selection.value
  if (!selection || !isSelectionAlive(selection as any, doc) || selection.firstBlock.id !== source.id) {
    doc.selection.selectOrSetCursorAtBlock(source, true, false)
  }
  return doc.chain()
    .task(() => doc.crud.undoManager.captureUndoItem(() => doc.crud.transact(mutate)).result)
    .selectOrSetCursorAtBlock(targetId, false)
    .run()
}
