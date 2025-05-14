import {filter, fromEvent, merge, skip, Subject, Subscription, take, takeUntil} from "rxjs";
import {Overlay, OverlayRef} from "@angular/cdk/overlay";
import {
  BlockNodeType,
  DocPlugin,
  EditableBlockComponent,
  EventListen,
  EventNames, getPositionWithOffset,
  HotKeyTrigger
} from "../../framework";
import {IBlockSnapshot, UIEventStateContext, BLOCK_CREATOR_SERVICE_TOKEN} from "../../framework";
import {nextTick, sliceDelta} from "../../global";
import {ComponentPortal} from "@angular/cdk/portal";
import {BlockTransformContextMenu} from "./widget/contextmenu";

export interface IBlockTransformConfig {
  flavour: BlockCraft.BlockFlavour
  description: string
  markdown?: RegExp
  hotkey?: HotKeyTrigger,
  onConvert?: (doc: BlockCraft.Doc, from: EditableBlockComponent, matchedString: string) => IBlockSnapshot
}

export const blockTransforms: IBlockTransformConfig[] = [
  {
    flavour: 'heading-one',
    description: `一级标题(⌘/Ctrl + 1)\nMarkdown: # (空格)`,
    markdown: /^#\s$/,
    hotkey: {key: '1', shortKey: true}
  },
  {
    flavour: 'heading-two',
    description: `二级标题(⌘/Ctrl + 2)\nMarkdown: ## (空格)`,
    markdown: /^##\s$/,
    hotkey: {key: '2', shortKey: true}
  },
  {
    flavour: 'heading-three',
    description: `三级标题(⌘/Ctrl + 3)\nMarkdown: ### (空格)`,
    markdown: /^###\s$/,
    hotkey: {key: '3', shortKey: true}
  },
  {
    flavour: 'heading-four',
    description: `四级标题(⌘/Ctrl + 4)\nMarkdown: #### (空格)`,
    markdown: /^####\s$/,
    hotkey: {key: '4', shortKey: true}
  },
  {
    flavour: 'bullet',
    description: `无序列表(⌘/Ctrl + Shift + L)\nMarkdown: -/+ (空格)`,
    markdown: /^[-+]\s$/,
    hotkey: {key: ['l', 'L'], shortKey: true, shiftKey: true}
  },
  {
    flavour: 'ordered',
    description: `有序列表(⌘/Ctrl + Shift + O)\nMarkdown: (数字). (空格)`,
    markdown: /^\d+\.\s$/,
    hotkey: {key: ['o', 'O'], shortKey: true, shiftKey: true},
    onConvert: (doc, from, matchedString) => {
      const props = {
        order: parseInt(matchedString, 10) - 1,
        ...from.props
      }
      return doc.schemas.createSnapshot('ordered', [sliceDelta(from.textDeltas(), matchedString.length), props])
    }
  },
  {
    flavour: 'todo',
    description: `待办事项(⌘/Ctrl + Shift + T)\nMarkdown: [] (空格)`,
    markdown: /^\[\]\s$/,
    hotkey: {key: ['t', 'T'], shortKey: true, shiftKey: true}
  },
  {
    flavour: 'callout',
    description: `高亮块(⌘/Ctrl + Shift + Q)\nMarkdown: ! (空格)`,
    markdown: /^!\s$/,
    hotkey: {key: ['q', 'Q'], shortKey: true, shiftKey: true}
  },
  // {
  //   flavour: 'blockquote',
  //   description: `引用块\nMarkdown: > (空格)`,
  //   markdown: /^>\s$/,
  // },
  {
    flavour: 'divider',
    description: `分割线(⌘/Ctrl + Shift + H)\nMarkdown: --- (空格)`,
    markdown: /^---\s$/
  },
  {
    flavour: 'divider',
    description: `分割线(⌘/Ctrl + Shift + H)\nMarkdown: --- (空格)`,
    markdown: /^---\s$/,
    hotkey: {key: ['h', 'H'], shortKey: true, shiftKey: true}
  },
  {
    flavour: 'code',
    description: `代码块(⌘/Ctrl + Shift + C)\nMarkdown: \`\`\` (空格)`,
    markdown: /^```\s$/,
    hotkey: {key: ['c', 'C'], shortKey: true, shiftKey: true}
  }
]

const TransformReg = /^[\/、].*/

export class BlockTransformerPlugin extends DocPlugin {
  override name = 'block-transformer';
  override version = 1.0;

  private mdTransformList: { regex: RegExp, flavour: BlockCraft.BlockFlavour }[] = []

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
      const schema = this.doc.schemas.get(item.flavour)
      if (!schema) return
      schema.metadata.description = item.description

      // register hotkey
      item.hotkey && this.doc.event.bindHotkey(item.hotkey, (evt) => {
        const state = evt.get('keyboardState')
        const selection = state.selection
        if (!selection.isInSameBlock || selection.from.type !== 'text' || selection.from.block.flavour === item.flavour) return
        evt.preventDefault()
        BlockTransformerPlugin.transformEditableBlock(this.doc, selection.from.block, item.flavour)
        return true
      })

      if (item.markdown) {
        this.mdTransformList.push({
          regex: item.markdown,
          flavour: item.flavour
        })
      }
    })
  }

  @EventListen(EventNames.beforeInput)
  onBeforeInput(evt: UIEventStateContext) {
    const e = evt.getDefaultEvent() as InputEvent
    if (e.data === ' ') {
      nextTick().then(() => {
        this._mdTransform()
      })
    }
    if (e.data === '\/' || e.data === '、') {
      nextTick().then(() => {
        const selection = this.doc.selection.value
        if (!selection || !selection.collapsed || selection.from.type !== 'text' || selection.from.block.flavour !== 'paragraph') return
        const block = selection.from.block
        if (block.textContent() !== e.data) return
        const schema = this.doc.schemas.get(block.flavour)
        if (schema.metadata.isLeaf) return;
        this.openContextMenu(block)
      })
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

    const config = this.transformList.find((item) => item.flavour === matched.flavour)!
    // block.deleteText(text.length)
    // block.applyDelta([{delete: text.length}], false)

    let newBlock: IBlockSnapshot
    if (config.onConvert) {
      newBlock = config.onConvert!(this.doc, block, text)
    } else {
      newBlock = this.doc.schemas.createSnapshot(matched.flavour, [sliceDelta(block.textDeltas(), text.length), block.props])
    }

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

  private contextOvr: OverlayRef | null = null
  private closeMenu$ = new Subject()

  openContextMenu(block: EditableBlockComponent) {

    const {componentRef: cpr, overlayRef} = this.doc.overlayService.createConnectedOverlay<BlockTransformContextMenu>({
      target: block.hostElement,
      component: BlockTransformContextMenu,
      positions: [getPositionWithOffset("bottom-left"), getPositionWithOffset("top-left")],
    }, this.closeMenu$, () => {})
    this.contextOvr = overlayRef

    const parentBlockSchema = this.doc.schemas.get(block.parentBlock!.flavour)
    const blockSchemas = this.doc.schemas.getSchemaList()
      .filter(v => !v.metadata.isLeaf && !['image', 'paragraph', 'root'].includes(v.flavour)
        && this.doc.schemas.isValidChildren(v.flavour, parentBlockSchema))
    cpr.setInput('blocks', blockSchemas)

    let isComposing = false
    fromEvent(block.hostElement, 'compositionstart').pipe(takeUntil(this.closeMenu$)).subscribe(() => {
      isComposing = true
    })
    fromEvent(block.hostElement, 'compositionend').pipe(takeUntil(this.closeMenu$)).subscribe(() => {
      isComposing = false
    })

    const textObserver = () => {
      if (isComposing) return;
      const text = block.textContent()
      if (!text || !TransformReg.test(text)) {
        this.closeMenu$.next(true)
        return
      }
      const searchText = text.slice(1)
      const matchedSchemas = blockSchemas.filter(v => v.metadata.label.startsWith(searchText) || v.flavour.toLowerCase().startsWith(searchText.toLowerCase()))
      if (!matchedSchemas.length) {
        this.closeMenu$.next(true)
        return
      }
      cpr.setInput('blocks', matchedSchemas)
      cpr.instance.activeIdx = 0
    }
    block.yText.observe(textObserver)

    cpr.instance.blockSelected.pipe(takeUntil(this.closeMenu$)).subscribe(schema => {
      this.contextOvr!.dispose()

      if (schema.nodeType === BlockNodeType.editable) {
        const snapshot = this.doc.schemas.createSnapshot(schema.flavour, [[], block.props])
        this.doc.crud.insertBlocksAfter(block, [snapshot]).then(() => {
          this.doc.selection.setCursorAtBlock(snapshot.id, true)
        })
        return
      }

      const blockCreator = this.doc.injector.get(BLOCK_CREATOR_SERVICE_TOKEN)
      blockCreator.getParamsByScheme(schema).then(params => {
        const newBlock = this.doc.schemas.createSnapshot(schema.flavour, params as any)
        newBlock.props.depth = block.props.depth
        this.doc.crud.replaceWithSnapshots(block.id, [newBlock]).then(() => {
          this.doc.selection.setCursorAtBlock(newBlock.id, true)
        })
      })
    })

    const hotKeyEvents = [
      this.doc.event.bindHotkey({key: 'Escape',}, evt => {
        evt.preventDefault()
        this.closeMenu$.next(true)
        return true
      }, {blockId: block.id}),
      this.doc.event.bindHotkey({key: 'Enter',}, evt => {
        evt.preventDefault()
        cpr.instance.select()
        return true
      }, {blockId: block.id}),
      this.doc.event.bindHotkey({key: 'ArrowUp',}, evt => {
        evt.preventDefault()
        cpr.instance.selectUp()
        return true
      }, {blockId: block.id}),
      this.doc.event.bindHotkey({key: 'ArrowDown'}, evt => {
        evt.preventDefault()
        cpr.instance.selectDown()
        return true
      }, {blockId: block.id})
    ]

    merge(
      this.doc.selection.selectionChange$.pipe(skip(1), filter(v => !v || !!v.to || !v.collapsed || (v.firstBlock.id !== block.id))),
      block.onDestroy$, this.doc.readonlySwitch$.pipe(filter(v => v))).pipe(takeUntil(this.closeMenu$)).subscribe(() => {
      this.closeMenu$.next(true)
    })

    this.closeMenu$.pipe(take(1)).subscribe(v => {
      this.contextOvr?.dispose()
      this.contextOvr = null
      block.yText.unobserve(textObserver)
      hotKeyEvents.forEach(v => v())
    })
  }

  destroy() {
    this.sub.unsubscribe()
  }

}
