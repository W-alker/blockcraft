import {fromEvent, merge, Subject, Subscription, take, takeUntil} from "rxjs";
import {BlockModel, Controller, EditableBlock, IBlockFlavour, IPlugin} from "../../core";
import {Overlay, OverlayRef} from "@angular/cdk/overlay";
import {BlockTransformContextMenu} from "./widget/contextmenu";
import {ComponentPortal} from "@angular/cdk/portal";

export {BlockTransformContextMenu} from "./widget/contextmenu";

export interface IBlockTransformConfig {
  flavour: string
  description: string
  markdown?: RegExp
  hotkey?: (e: KeyboardEvent) => boolean,
  onConvert?: (controller: Controller, from: EditableBlock, matchedString: string) => BlockModel
}

export const blockTransforms: IBlockTransformConfig[] = [
  {
    flavour: 'heading-one',
    description: `一级标题(⌘/Ctrl + 1)\nMarkdown: # (空格)`,
    markdown: /^#(\s+)?$/,
    hotkey: (e) => e.code === 'Digit1' && (e.ctrlKey || e.metaKey)
  },
  {
    flavour: 'heading-two',
    description: `二级标题(⌘/Ctrl + 2)\nMarkdown: ## (空格)`,
    markdown: /^##(\s+)?$/,
    hotkey: (e) => e.code === 'Digit2' && (e.ctrlKey || e.metaKey)
  },
  {
    flavour: 'heading-three',
    description: `三级标题(⌘/Ctrl + 3)\nMarkdown: ### (空格)`,
    markdown: /^###(\s+)?$/,
    hotkey: (e) => e.code === 'Digit3' && (e.ctrlKey || e.metaKey)
  },
  {
    flavour: 'heading-four',
    description: `四级标题(⌘/Ctrl + 4)\nMarkdown: #### (空格)`,
    markdown: /^####(\s+)?$/,
    hotkey: (e) => e.code === 'Digit4' && (e.ctrlKey || e.metaKey)
  },
  {
    flavour: 'bullet-list',
    description: `无序列表(⌘/Ctrl + Shift + L)\nMarkdown: -/+ (空格)`,
    markdown: /^[-+](\s+)?$/,
    hotkey: (e) => e.code === 'KeyL' && (e.ctrlKey || e.metaKey) && e.shiftKey
  },
  {
    flavour: 'ordered-list',
    description: `有序列表(⌘/Ctrl + Shift + O)\nMarkdown: (数字). (空格)`,
    markdown: /^\d+\.(\s+)?$/,
    hotkey: (e) => e.code === 'KeyO' && (e.ctrlKey || e.metaKey) && e.shiftKey,
    onConvert: (controller, from, matchedString) => {
      const props = {
        order: parseInt(matchedString, 10) - 1,
        ...from.props
      }
      return controller.createBlock('ordered-list', [from.getTextDelta(), props])
    }
  },
  {
    flavour: 'todo-list',
    description: `待办事项(⌘/Ctrl + Shift + T)\nMarkdown: [] (空格)`,
    markdown: /^\[\]\s$/,
    hotkey: (e) => e.code === 'KeyT' && (e.ctrlKey || e.metaKey) && e.shiftKey
  },
  {
    flavour: 'callout',
    description: `高亮块(⌘/Ctrl + Shift + Q)\nMarkdown: ! (空格)`,
    markdown: /^!\s$/,
    hotkey: (e) => e.code === 'KeyQ' && (e.ctrlKey || e.metaKey) && e.shiftKey
  },
  {
    flavour: 'blockquote',
    description: `引用块\nMarkdown: > (空格)`,
    markdown: /^>\s$/,
  },
  {
    flavour: 'divider',
    description: `分割线(⌘/Ctrl + Shift + H)\nMarkdown: --- (空格)`,
    markdown: /^---(\s+)?$/
  },
  {
    flavour: 'divider',
    description: `分割线(⌘/Ctrl + Shift + H)\nMarkdown: --- (空格)`,
    markdown: /^---(\s+)?$/,
    hotkey: (e) => e.code === 'KeyH' && (e.ctrlKey || e.metaKey) && e.shiftKey
  },
  {
    flavour: 'code',
    description: `代码块(⌘/Ctrl + Shift + C)\nMarkdown: \`\`\` (空格)`,
    markdown: /^```(\s+)?$/,
    hotkey: (e) => e.code === 'KeyC' && (e.ctrlKey || e.metaKey) && e.shiftKey
  }
]

const TransformReg = /^[\\、].*/

export class BlockTransformPlugin implements IPlugin {
  name = 'block-transformer';
  version = 1.0;

  private _controller!: Controller
  private mdTransformList: { regex: RegExp, flavour: IBlockFlavour }[] = []

  constructor(
    readonly transformList: IBlockTransformConfig[] = blockTransforms
  ) {
  }

  private sub = new Subscription()

  static transformEditableBlock = (controller: Controller, from: EditableBlock, to: IBlockFlavour) => {
    const deltas = from.getTextDelta()
    const newBlock = controller.createBlock(to, [deltas, from.props])
    controller.replaceWith(from.id, [newBlock]).then(() => {
      controller.selection.setSelection(newBlock.id, 'start')
    })
  }

  init(controller: Controller) {
    this._controller = controller

    this.transformList.forEach((item) => {
      const schema = controller.schemas.get(item.flavour)
      if (!schema) return
      schema.description = item.description

      item.hotkey && controller.keyEventBus.add({
        trigger: item.hotkey,
        handler: (e, controller) => {
          const block = controller.getFocusingBlockRef()
          if (!block) return
          const blockPos = controller.getBlockPosition(block.id)
          if (blockPos.parentId !== controller.rootId) return
          e.preventDefault()
          e.stopPropagation()
          BlockTransformPlugin.transformEditableBlock(controller, block, item.flavour)
        }
      })

      if (item.markdown) {
        this.mdTransformList.push({
          regex: item.markdown,
          flavour: item.flavour
        })
      }
    })

    this.sub.add(
      fromEvent<InputEvent>(controller.rootElement, 'input')
        .subscribe(e => {
          if (e.data !== ' ') return
          const block = controller.getFocusingBlockRef()
          if (!block || block.flavour !== 'paragraph' || block.getParentId() !== controller.rootId) return
          const range = controller.selection.getSelection()!
          if (range.isAtRoot) return
          const {blockId, blockRange} = range
          const text = block.getTextContent().slice(0, blockRange.start)
          const matched = this.mdTransformList.find((item) => item.regex.test(text))
          if (!matched) return

          const config = this.transformList.find((item) => item.flavour === matched.flavour)!
          block.applyDelta([{delete: text.length}], false)

          let newBlock: BlockModel
          if (config.onConvert) {
            newBlock = config.onConvert!(controller, block, text)
          } else {
            newBlock = controller.createBlock(matched.flavour, [block.getTextDelta(), block.props])
          }
          const appendBlocks = [newBlock]
          if (newBlock.nodeType === 'void') {
            appendBlocks.push(controller.createBlock('paragraph'))
          }
          controller.replaceWith(block.id, appendBlocks).then(() => {
            controller.selection.setSelection(appendBlocks[appendBlocks.length - 1].id, 'start')
          })

        })
    )

    this.sub.add(
      fromEvent<InputEvent>(controller.rootElement, 'input')
        .subscribe(e => {
          if (e.data !== '\\' && e.data !== '、') return
          const block = controller.getFocusingBlockRef()
          if (!block || block.flavour !== 'paragraph' || block.getParentId() !== controller.rootId || block.containerEle.textContent !== e.data) return
          this.openContextMenu(block)
        })
    )
  }

  private contextOvr: OverlayRef | null = null
  private closeMenu$ = new Subject()

  openContextMenu(block: EditableBlock) {
    const overlay = this._controller.injector.get(Overlay)
    const positions = overlay.position().flexibleConnectedTo(block.containerEle).withPositions([
      {originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top'},
      {originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom'},
    ])
    this.contextOvr = overlay.create({positionStrategy: positions})
    const cpr = this.contextOvr.attach(new ComponentPortal(BlockTransformContextMenu))

    const blockSchemas = this._controller.schemas.values().filter(v => !v.isLeaf && v.flavour !== 'image' && v.flavour !== 'paragraph')
    cpr.setInput('blocks', blockSchemas)

    let isComposing = false
    fromEvent(block.containerEle, 'compositionstart').pipe(takeUntil(this.closeMenu$)).subscribe(() => {
      isComposing = true
    })
    fromEvent(block.containerEle, 'compositionend').pipe(takeUntil(this.closeMenu$)).subscribe(() => {
      isComposing = false
    })

    const textObserver = () => {
      if (isComposing) return;
      const text = block.getTextContent()
      if (!text || !TransformReg.test(text)) {
        this.closeMenu$.next(true)
        return
      }
      const searchText = text.slice(1)
      const matchedSchemas = blockSchemas.filter(v => v.label.startsWith(searchText) || v.flavour.startsWith(searchText))
      if (!matchedSchemas.length) {
        this.closeMenu$.next(true)
        return
      }
      cpr.setInput('blocks', matchedSchemas)
      cpr.instance.activeIdx = 0
    }
    block.yText.observe(textObserver)
    this.closeMenu$.pipe(take(1)).subscribe(v => {
      this.contextOvr!.dispose()
      this.contextOvr = null
      block.yText.unobserve(textObserver)
    })

    cpr.instance.blockSelected.pipe(takeUntil(this.closeMenu$)).subscribe(schema => {
      this.contextOvr!.dispose()
      const newBlock = this._controller.createBlock(schema.flavour)
      this._controller.replaceWith(block.id, [newBlock]).then(() => {
        newBlock.nodeType === 'editable' && this._controller.selection.setSelection(newBlock.id, 'start')
      })
    })

    merge(fromEvent(block.containerEle, 'blur'), block.onDestroy).pipe(takeUntil(this.closeMenu$)).subscribe(() => {
      this.closeMenu$.next(true)
    })

    fromEvent<KeyboardEvent>(block.containerEle, 'keydown').pipe(takeUntil(this.closeMenu$))
      .subscribe((e) => {
        switch (e.key) {
          case 'Escape':
            e.preventDefault()
            e.stopPropagation()
            this.closeMenu$.next(true)
            break
          case 'Enter':
            e.preventDefault()
            e.stopPropagation()
            cpr.instance.select();
            break
          case 'ArrowUp':
            e.preventDefault()
            e.stopPropagation()
            cpr.instance.selectUp()
            break
          case 'ArrowDown':
            e.stopPropagation()
            e.preventDefault()
            cpr.instance.selectDown()
            break
        }
      })
  }

  destroy() {
    this.sub.unsubscribe()
    this.transformList.forEach((item) => {
      item.hotkey && this._controller.keyEventBus.remove(item.hotkey)
    })
  }

}
