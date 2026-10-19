import {fromEvent, Subject, Subscription, takeUntil, type Observable} from 'rxjs'
import {DocPlugin, getPositionWithOffset} from '../../framework'
import {nextTick} from '../../global'
import {isSelectionAlive} from '../../framework/modules/selection/liveness'
import {isObjectToolbarOwnedTarget} from '../object-layout/object-toolbar-interaction'
import {InlineObjectInteractionController} from '../object-layout/inline-object-interaction'
import {InlineObjectToolbarComponent, INLINE_OBJECT_LAYOUT_OPTIONS} from '../object-layout/inline-object-toolbar.component'

/** Layout controls for the selected Sticker Block; movement stays in ObjectDragPlugin. */
export class StickerToolbarPlugin extends DocPlugin {
  override name = 'sticker-toolbar'
  private readonly subscriptions = new Subscription()
  private readonly close$ = new Subject<void>()
  private overlay?: ReturnType<BlockCraft.Doc['overlayService']['createConnectedOverlay']>['overlayRef']
  private active?: BlockCraft.BlockComponent
  private releasePresentation?: () => void
  private inlineObject?: InlineObjectInteractionController

  override init(): void {
    this.inlineObject = new InlineObjectInteractionController(this.doc, 'sticker', this.close)
    this.inlineObject.init()
    this.subscriptions.add(this.doc.selection.selectionChange$.subscribe(selection => {
      const stickerSelection = selection && selection.isInSameBlock
        && selection.anchor.type === 'selected' && selection.head.type === 'selected'
        && this.doc.model.getFlavour(selection.anchor.blockId) === 'sticker'
      const block = stickerSelection && isSelectionAlive(selection as never, this.doc)
        ? selection!.firstBlock : null
      if (!block || !this.isWritable(block)) {
        if (!selection && this.releasePresentation && this.active) return
        this.close()
        return
      }
      if (block !== this.active) this.open(block)
    }))
    this.subscriptions.add(this.doc.subscribeReadonlyChange(readonly => {
      if (readonly) this.close()
    }))
    this.subscriptions.add(this.doc.readonlyManager.stateChange$.subscribe(() => {
      if (this.active && !this.isWritable(this.active)) this.close()
    }))
    const owner = this.doc.root.hostElement.ownerDocument
    this.subscriptions.add(fromEvent<PointerEvent>(owner, 'pointerdown', {capture: true}).subscribe(event => {
      if (!this.active) return
      const target = event.target
      if (target instanceof Element && isObjectToolbarOwnedTarget(this.overlay?.overlayElement, target)) {
        this.releasePresentation ??= this.doc.selection.retainPresentation()
      } else if (!(target instanceof Node) || !this.active?.hostElement.contains(target)) {
        this.close()
      }
    }))
  }

  override destroy(): void {
    this.inlineObject?.destroy()
    this.inlineObject = undefined
    this.subscriptions.unsubscribe()
    this.close()
    this.close$.complete()
  }

  private isWritable(block: BlockCraft.BlockComponent): boolean {
    return !this.doc.isReadonly && this.doc.model.exists(block.id)
      && this.doc.getBlockById(block.id) === block
      && !this.doc.readonlyManager.isReadonly(block)
      && !this.doc.placement.isInObjectGroup(block.id)
  }

  private open(block: BlockCraft.BlockComponent): void {
    this.inlineObject?.close()
    this.close()
    this.active = block
    const {componentRef, overlayRef, updatePosition: reposition} = this.doc.overlayService.createConnectedOverlay<InlineObjectToolbarComponent>({
      target: block,
      origin: block.hostElement.querySelector<HTMLElement>('shape-resizer') ?? block.hostElement,
      positions: [
        getPositionWithOffset('top-center', 0, 8),
        getPositionWithOffset('top-left', 0, 8),
        getPositionWithOffset('top-right', 0, 8),
        getPositionWithOffset('bottom-center', 0, 8),
        getPositionWithOffset('bottom-left', 0, 8),
        getPositionWithOffset('bottom-right', 0, 8),
      ],
      component: InlineObjectToolbarComponent,
    }, this.close$, this.close)
    this.overlay = overlayRef
    const updatePosition = () => {
      void nextTick().then(() => {
        if (this.overlay === overlayRef) reposition()
      })
    }
    const propsChange$: Observable<unknown> = block.onPropsChange
    propsChange$.pipe(takeUntil(this.close$)).subscribe(updatePosition)
    updatePosition()
    componentRef.setInput('layout', this.doc.placement.getObjectLayout(block))
    componentRef.setInput('label', '')
    const options = INLINE_OBJECT_LAYOUT_OPTIONS.filter(({value}) =>
      this.doc.placement.supportsObjectLayout(block, value === 'wrap' ? 'inline' : value))
    componentRef.setInput('layoutOptions', options)
    componentRef.instance.onItemClicked.pipe(takeUntil(this.close$)).subscribe(item => {
      const layout = options.find(option => option.value === item.value)?.value
      if (item.name !== 'object-layout' || !layout) return
      if (!this.isWritable(block)) { this.close(); return }
      if (layout === 'wrap') {
        if (!this.doc.placement.supportsObjectLayout(block, 'inline')) return
        if (this.inlineObject?.convertBlockToInline(block, true)) this.close()
        return
      }
      if (!this.doc.placement.setObjectLayout(block, layout)) return
      if (layout === 'inline') this.close()
      else componentRef.setInput('layout', this.doc.placement.getObjectLayout(block))
    })
  }

  private close = (): void => {
    const overlay = this.overlay
    this.overlay = undefined
    this.active = undefined
    this.releasePresentation?.()
    this.releasePresentation = undefined
    if (overlay) { this.close$.next(); overlay.dispose() }
  }
}
