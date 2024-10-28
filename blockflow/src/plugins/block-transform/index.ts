import {fromEvent} from "rxjs";
import {BlockModel, Controller, EditableBlock, IBlockFlavour, IPlugin} from "../../core";

export interface IBlockTransformConfig {
  flavour: string
  description: string
  markdown?: RegExp
  hotkey: (e: KeyboardEvent) => boolean,
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
    markdown: /^\d+(\.)?(\s+)?$/,
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
    flavour: 'callout',
    description: `高亮块(⌘/Ctrl + Shift + Q)\nMarkdown: ! (空格)`,
    markdown: /^!\s$/,
    hotkey: (e) => e.code === 'KeyQ' && (e.ctrlKey || e.metaKey) && e.shiftKey
  },
  {
    flavour: 'divider',
    description: `分割线(⌘/Ctrl + Shift + H)\nMarkdown: --- (空格)`,
    markdown: /^---(\s+)?$/,
    hotkey: (e) => e.code === 'KeyH' && (e.ctrlKey || e.metaKey) && e.shiftKey
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

const transformBlock = (controller: Controller, from: EditableBlock, to: IBlockFlavour) => {
  const deltas = from.getTextDelta()
  const newBlock = controller.createBlock(to, [deltas, from.props])
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
  private mdTransformList: { regex: RegExp, flavour: IBlockFlavour }[] = []

  constructor(
    readonly transformList: IBlockTransformConfig[] = blockTransforms
  ) {
  }

  init(controller: Controller) {
    this._controller = controller

    this.transformList.forEach((item) => {
      const schema = controller.schemas.get(item.flavour)
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
        this.mdTransformList.push({
          regex: item.markdown,
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
        if (!matched) return
        const config = this.transformList.find((item) => item.flavour === matched.flavour)!
        block.applyDelta([{delete: text.length}], false)

        let newBlock: BlockModel
        if(config.onConvert) {
          newBlock = config.onConvert!(controller, block, text)
        } else {
          newBlock = controller.createBlock(matched.flavour, [block.getTextDelta(), block.props])
        }
        controller.transact(() => {
          controller.replaceWith(block.id, newBlock).then(() => {
            controller.setSelection(newBlock.id, 'start')
          })
        })

      })

  }

  destroy() {
    this.transformList.forEach((item) => {
      this._controller.keyEventBus.remove(item.hotkey)
    })
  }

}
