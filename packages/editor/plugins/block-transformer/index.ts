import {filter, fromEvent, merge, skip, Subject, Subscription, take, takeUntil} from "rxjs";
import {
  BindHotKey,
  DocPlugin,
  EditableBlockComponent,
  EventListen, getPositionWithOffset,
} from "../../framework";
import {UIEventStateContext} from "../../framework";
import {nextTick, sliceDelta} from "../../global";
import {BlockTransformContextMenu} from "./widget/contextmenu";
import {blockTransforms, headingTransforms, IBlockTransformConfig,} from "./const";

const ALLOWED_HEADING_FLAVOURS: BlockCraft.BlockFlavour[] = ['paragraph', 'ordered']

export class BlockTransformerPlugin extends DocPlugin {
  override name = 'block-transformer';
  override version = 1.0;

  private mdTransformList: { regex: RegExp, flavour: string }[] = []
  private pendingInputTriggerSeq = 0

  constructor(
    readonly transformList: IBlockTransformConfig[] = blockTransforms
  ) {
    super()
  }

  private sub = new Subscription()

  static transformEditableBlock = (doc: BlockCraft.Doc, from: EditableBlockComponent<any>, to: BlockCraft.BlockFlavour) => {
    const deltas = from.textDeltas()
    const newBlock = doc.schemas.createSnapshot(to, [deltas, from.props])
    void doc.chain()
      .replaceWithSnapshots(from.id, [newBlock])
      .selectOrSetCursorAtBlock(newBlock.id, true)
      .run()
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
        if (!selection.isInSameBlock || selection.start.type !== 'text' || selection.firstBlock.flavour === item.flavour) return
        evt.preventDefault()
        BlockTransformerPlugin.transformEditableBlock(this.doc, selection.firstBlock as any, item.flavour as any)
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

  @BindHotKey({key: ['0', '1', '2', '3', '4'], shortKey: true})
  formatHeading(evt: UIEventStateContext) {
    const state = evt.get('keyboardState')
    const selection = state.selection
    if (!selection.isInSameBlock || selection.start.type !== 'text' || !ALLOWED_HEADING_FLAVOURS.includes(selection.firstBlock.flavour)) return
    ;(selection.firstBlock as any).updateProps({
      heading: state.raw.key === '0' ? null : parseInt(state.raw.key, 10)
    })
    return true
  }

  @EventListen('beforeInput')
  onBeforeInput(evt: UIEventStateContext) {
    const e = evt.getDefaultEvent() as InputEvent
    const inputText = getPlainTextFromInputEvent(e)
    this.queueInputTrigger(inputText)
  }

  @EventListen('keyDown')
  onKeyDown(evt: UIEventStateContext) {
    const state = evt.get('keyboardState')
    const raw = state.raw
    if (raw.metaKey || raw.ctrlKey || raw.altKey) return
    this.queueInputTrigger(raw.key)
  }

  private _mdTransform = () => {
    const selection = this.getCurrentSelection()
    if (!selection) return false
    if (!selection.collapsed || selection.start.type !== 'text') return false
    const block = selection.firstBlock as any
    if (!block || block.flavour !== 'paragraph') return
    const blockText = block.textContent()
    const prefixes = [
      blockText.slice(0, Math.min(selection.start.offset + 1, blockText.length)),
      blockText.slice(0, Math.min(selection.start.offset, blockText.length))
    ]
    const matched = this.mdTransformList.find((item) => prefixes.some(text => item.regex.test(text)))
    if (!matched) return false
    const matchedText = prefixes.find(text => matched.regex.test(text))!

    // 设置heading
    if (matched.flavour.startsWith('heading-')) {
      const heading = headingTransforms.findIndex(item => item.flavour === matched.flavour)
      if (heading < 0) return false
      const selIdx = matchedText.length - 1
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
      config.onConvert!(this.doc, block, matchedText)
      return
    }

    const newBlock = this.doc.schemas.createSnapshot(matched.flavour as any, [sliceDelta(block.textDeltas(), matchedText.length), {
      ...block.props, heading: undefined
    }])

    if (!this.doc.schemas.isValidChildren(newBlock.flavour, block.parentBlock!.flavour)) {
      return
    }

    const appendBlocks = [newBlock]
    if (newBlock.nodeType === 'void') {
      appendBlocks.push(this.doc.schemas.createSnapshot('paragraph', [[], block.props]))
    }
    void this.doc.chain()
      .replaceWithSnapshots(block.id, appendBlocks)
      .setCursorAtBlock(appendBlocks[appendBlocks.length - 1].id, true)
      .run()
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
      this.doc.selection.selectionChange$.pipe(skip(1), filter(v => !v || !v.isInSameBlock || !v.collapsed || (v.firstBlock.id !== block.id))),
      block.onDestroy$).pipe(takeUntil(this.closeMenu$)).subscribe(() => {
      this.closeMenu$.next(true)
    })
  }

  destroy() {
    this.sub.unsubscribe()
  }

  private queueInputTrigger(inputText: string | null | undefined) {
    if (inputText !== ' ' && inputText !== '\/' && inputText !== '、') return
    const seq = ++this.pendingInputTriggerSeq
    nextTick().then(() => {
      if (this.pendingInputTriggerSeq !== seq) return
      if (inputText === ' ') {
        this._mdTransform()
        return
      }
      this.tryOpenContextMenu(inputText)
    })
  }

  private tryOpenContextMenu(inputText: '/' | '、') {
    const selection = this.getCurrentSelection()
    if (!selection || !selection.collapsed || selection.start.type !== 'text' || selection.firstBlock.flavour !== 'paragraph') return
    const block = selection.firstBlock as any
    if (block.textContent() !== inputText) return
    const schema = this.doc.schemas.get(block.flavour)!
    if (schema.metadata.isLeaf) return
    this.openContextMenu(block)
  }

  private getCurrentSelection() {
    return this.doc.selection.recalculate(false).value || this.doc.selection.value
  }

}

function getPlainTextFromInputEvent(event: InputEvent) {
  if (typeof event.data === 'string') {
    return event.data
  }
  if (event.dataTransfer?.types.includes('text/plain')) {
    return event.dataTransfer.getData('text/plain')
  }
  return null
}
