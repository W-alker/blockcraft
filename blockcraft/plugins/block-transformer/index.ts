import {filter, fromEvent, merge, skip, Subject, Subscription, take, takeUntil} from "rxjs";
import {Overlay, OverlayRef} from "@angular/cdk/overlay";
import {
  BindHotKey,
  DocPlugin,
  EditableBlockComponent,
  EventListen, getPositionWithOffset, ORIGIN_SKIP_SYNC,
} from "../../framework";
import {UIEventStateContext} from "../../framework";
import {nextTick, sliceDelta} from "../../global";
import {ComponentPortal} from "@angular/cdk/portal";
import {BlockTransformContextMenu} from "./widget/contextmenu";
import {blockTransforms, headingTransforms, IBlockTransformConfig,} from "./const";

const ALLOWED_HEADING_FLAVOURS: BlockCraft.BlockFlavour[] = ['paragraph', 'ordered']

export class BlockTransformerPlugin extends DocPlugin {
  override name = 'block-transformer';
  override version = 1.0;

  private mdTransformList: { regex: RegExp, flavour: string }[] = []

  constructor(
    readonly transformList: IBlockTransformConfig[] = blockTransforms
  ) {
    super()
  }

  private sub = new Subscription()

  static transformEditableBlock = (doc: BlockCraft.Doc, from: EditableBlockComponent<any>, to: BlockCraft.BlockFlavour) => {
    const deltas = from.textDeltas()
    const newBlock = doc.schemas.createSnapshot(to, [deltas, from.props])
    doc.crud.replaceWithSnapshots(from.id, [newBlock]).then(() => {
      doc.selection.selectOrSetCursorAtBlock(newBlock.id, true)
    })
  }

  init() {
    this.transformList.forEach((item) => {
      const schema = this.doc.schemas.get(item.flavour, false)
      if (!schema) return
      schema.metadata.description = item.description

      // register hotkey
      item.hotkey && this.doc.event.bindHotkey(item.hotkey, (evt) => {
        const state = evt.get('keyboardState')
        const selection = state.selection
        if (!selection.isInSameBlock || selection.from.type !== 'text' || selection.from.block.flavour === item.flavour) return
        evt.preventDefault()
        BlockTransformerPlugin.transformEditableBlock(this.doc, selection.from.block, item.flavour as any)
        return true
      })

      if (item.markdown) {
        this.mdTransformList.push({
          regex: item.markdown,
          flavour: item.flavour
        })
      }
    })

    headingTransforms.forEach(item => {
      this.mdTransformList.push({
        regex: item.markdown!,
        flavour: item.flavour
      })
    })
  }

  @BindHotKey({key: ['1', '2', '3', '4'], shortKey: true})
  formatHeading(evt: UIEventStateContext) {
    const state = evt.get('keyboardState')
    const selection = state.selection
    if (!selection.isInSameBlock || selection.from.type !== 'text' || !ALLOWED_HEADING_FLAVOURS.includes(selection.from.block.flavour)) return
    selection.from.block.updateProps({
      heading: parseInt(state.raw.key, 10)
    })
    return true
  }

  @EventListen('beforeInput')
  onBeforeInput(evt: UIEventStateContext) {
    const e = evt.getDefaultEvent() as InputEvent
    if (e.data === ' ') {
      nextTick().then(() => {
        this._mdTransform()
      })
      return
    }
    if (e.data === '\/' || e.data === '、') {
      const selection = this.doc.selection.value
      if (!selection || !selection.collapsed || selection.from.type !== 'text' || selection.from.block.flavour !== 'paragraph') return
      const block = selection.from.block
      if (block.textContent() !== e.data) return
      const schema = this.doc.schemas.get(block.flavour)!
      if (schema.metadata.isLeaf) return
      this.openContextMenu(block)
    }
  }

  private _mdTransform = () => {
    const selection = this.doc.selection.value!
    if (!selection.collapsed || selection.from.type !== 'text') return false
    const block = selection.from.block
    if (!block || block.flavour !== 'paragraph') return
    const text = block.textContent().slice(0, selection.from.index + 1)
    const matched = this.mdTransformList.find((item) => item.regex.test(text))
    if (!matched) return false

    // 设置heading
    if (matched.flavour.startsWith('heading-')) {
      const heading = headingTransforms.findIndex(item => item.flavour === matched.flavour)
      if (heading < 0) return false
      const selIdx = selection.from.index
      this.doc.crud.transact(() => {
        block.deleteText(0, selIdx + 1)
        block.updateProps({
          heading: heading + 1
        })
      })
      return true
    }

    const config = this.transformList.find((item) => item.flavour === matched.flavour)!

    if (config.onConvert) {
      config.onConvert!(this.doc, block, text)
      return
    }

    const newBlock = this.doc.schemas.createSnapshot(matched.flavour as any, [sliceDelta(block.textDeltas(), text.length), {
      ...block.props, heading: undefined
    }])

    if (!this.doc.schemas.isValidChildren(newBlock.flavour, block.parentBlock!.flavour)) {
      return
    }

    const appendBlocks = [newBlock]
    if (newBlock.nodeType === 'void') {
      appendBlocks.push(this.doc.schemas.createSnapshot('paragraph', [[], block.props]))
    }
    this.doc.crud.replaceWithSnapshots(block.id, appendBlocks).then(() => {
      this.doc.selection.setCursorAtBlock(appendBlocks[0].id, true)
    })
    return true
  }

  private closeMenu$ = new Subject()

  openContextMenu(block: EditableBlockComponent) {
    const {componentRef: cpr} = this.doc.overlayService.createConnectedOverlay<BlockTransformContextMenu>({
      target: block.containerElement,
      positions: [
        getPositionWithOffset('top-left'),
        getPositionWithOffset('bottom-left'),
      ],
      component: BlockTransformContextMenu
    }, this.closeMenu$, () => {

    })
    cpr.setInput('activeBlock', block)
    cpr.setInput('doc', this.doc)

    merge(
      cpr.instance.close$,
      this.doc.selection.selectionChange$.pipe(skip(1), filter(v => !v || !!v.to || !v.collapsed || (v.firstBlock.id !== block.id))),
      block.onDestroy$).pipe(takeUntil(this.closeMenu$)).subscribe(() => {
      this.closeMenu$.next(true)
    })
  }

  destroy() {
    this.sub.unsubscribe()
  }

}
