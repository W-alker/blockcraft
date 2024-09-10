import {Controller, EditableBlock, IBlockFlavour, IPlugin} from "@core";
import {fromEvent} from "rxjs";

export interface IBlockTransformConfig {
  flavour: string
  description: string
  markdown?: string | string[]
  hotkey: (e: KeyboardEvent) => boolean
}

export const blockTransforms: IBlockTransformConfig[] = [
  {
    flavour: 'heading-one',
    description: `一级标题(⌘/Ctrl + 1)\nMarkdown: # (空格)`,
    markdown: '#',
    hotkey: (e) => e.code === 'Digit1' && (e.ctrlKey || e.metaKey)
  },
  {
    flavour: 'heading-two',
    description: `二级标题(⌘/Ctrl + 2)\nMarkdown: ## (空格)`,
    markdown: '##',
    hotkey: (e) => e.code === 'Digit2' && (e.ctrlKey || e.metaKey)
  },
  {
    flavour: 'heading-three',
    description: `三级标题(⌘/Ctrl + 3)\nMarkdown: ### (空格)`,
    markdown: '###',
    hotkey: (e) => e.code === 'Digit3' && (e.ctrlKey || e.metaKey)
  },
  {
    flavour: 'heading-four',
    description: `四级标题(⌘/Ctrl + 4)\nMarkdown: #### (空格)`,
    markdown: '####',
    hotkey: (e) => e.code === 'Digit4' && (e.ctrlKey || e.metaKey)
  },
]

const transformBlock = (controller: Controller, from: EditableBlock, to: IBlockFlavour) => {
  const deltas = from.getTextDelta()
  const newBlock = controller.schemaStore.create(to, deltas)
  controller.transact(() => {
    controller.replaceWith(from.id, newBlock).then(() => {
      controller.setSelection(newBlock.id, 'start')
    })
  })
}

export class BlockTransformPlugin implements IPlugin {
  name = 'block-transform';
  version = 1.0;

  private _controller!: Controller

  constructor(
    readonly transformList: IBlockTransformConfig[] = blockTransforms
  ) {
  }

  mdTransformList: { regex: RegExp, flavour: IBlockFlavour }[] = []

  init(controller: Controller) {
    this._controller = controller

    this.transformList.forEach((item) => {
      const schema = controller.schemaStore.get(item.flavour)
      if (!schema) return
      schema.description = item.description

      controller.keyEventBus.add({
        trigger: item.hotkey,
        handler: (e, controller) => {
          const block = controller.getFocusingBlockRef()
          if (!block) return
          const blockPos = controller.getBlockPosition(block.id)
          if (blockPos.parentId !== controller.rootId) return
          e.preventDefault()
          e.stopPropagation()
          transformBlock(controller, block, item.flavour)
        }
      })

      if (item.markdown) {
        item.markdown = Array.isArray(item.markdown) ? item.markdown : [item.markdown]
        this.mdTransformList.push({
          regex: new RegExp(`^${item.markdown.join('|')}(\\s+)?$`),
          flavour: item.flavour
        })
      }

    })

    console.log(this.mdTransformList)

    fromEvent<InputEvent>(controller.rootElement, 'input')
      .subscribe(e => {
        if (e.data !== ' ') return
        const block = controller.getFocusingBlockRef()
        if (!block || block.flavour !== 'paragraph') return
        const range = controller.getSelection()!
        if (range.isAtRoot) return
        const {blockId, blockRange} = range
        const text = block.getTextContent().slice(0, blockRange.start)
        const matched = this.mdTransformList.find((item) => item.regex.test(text))
        console.log(matched, text)
        if (!matched) return
        controller.applyDeltaToEditableBlock(block, [{delete: text.length}], false)

        controller.transact(() => {
          transformBlock(controller, block, matched.flavour)
        })
      })

  }

  destroy() {
    this.transformList.forEach((item) => {
      this._controller.keyEventBus.remove(item.hotkey)
    })
  }

}
