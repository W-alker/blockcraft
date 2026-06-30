import {BaseBlockComponent, EditableBlockComponent, HotKeyTrigger, IBlockProps, ORIGIN_SKIP_SYNC} from "../../framework";
import {IS_MAC, sliceDelta} from "../../global";

export interface IBlockTransformConfig {
  flavour: string
  description: string
  markdown?: RegExp
  hotkey?: HotKeyTrigger,
  onConvert?: (doc: BlockCraft.Doc, from: EditableBlockComponent, matchedString: string) => void
}

export const headingTransforms: IBlockTransformConfig[] = [
  {
    flavour: 'heading-one',
    description: `一级标题(${IS_MAC ? '⌘' : 'Ctrl'} + 1)\nMarkdown: # (空格)`,
    markdown: /^#\s$/
  },
  {
    flavour: 'heading-two',
    description: `二级标题(${IS_MAC ? '⌘' : 'Ctrl'} + 2)\nMarkdown: ## (空格)`,
    markdown: /^##\s$/
  },
  {
    flavour: 'heading-three',
    description: `三级标题(${IS_MAC ? '⌘' : 'Ctrl'} + 3)\nMarkdown: ### (空格)`,
    markdown: /^###\s$/
  },
  {
    flavour: 'heading-four',
    description: `四级标题(${IS_MAC ? '⌘' : 'Ctrl'} + 4)\nMarkdown: #### (空格)`,
    markdown: /^####\s$/
  },
]

export const blockTransforms: IBlockTransformConfig[] = [
  {
    flavour: 'bullet',
    description: `无序列表(${IS_MAC ? '⌘' : 'Ctrl'} + Shift + L)\nMarkdown: -/+ (空格)`,
    markdown: /^[-+]\s$/,
    hotkey: {key: ['l', 'L'], shortKey: true, shiftKey: true}
  },
  {
    flavour: 'ordered',
    description: `有序列表(${IS_MAC ? '⌘' : 'Ctrl'} + Shift + O)\nMarkdown: (数字/字母). (空格)`,
    markdown: /^(\d|[a-z])+\.\s$/,
    hotkey: {key: ['o', 'O'], shortKey: true, shiftKey: true},
    onConvert: (doc, from, matchedString) => {
      const o = doc.schemas.createSnapshot('ordered', [sliceDelta(from.textDeltas(), matchedString.length), from.props])
      const prevOrdered = findPreviousOrderedForContinuation(from as unknown as BaseBlockComponent<any>)
      if (prevOrdered) {
        o.props['order'] = prevOrdered.props['order'] || 0
      } else {
        let parsedNum = parseInt(matchedString, 10)
        if (isNaN(parsedNum)) {
          parsedNum = 1
        }
        o.props['order'] = parsedNum - 1
        // o.props['start'] = parsedNum
      }
      void doc.chain()
        .replaceWithSnapshots(from.id, [o])
        .selectOrSetCursorAtBlock(o.id, true)
        .run()
    }
  },
  {
    flavour: 'todo',
    description: `待办事项(${IS_MAC ? '⌘' : 'Ctrl'} + Shift + T)\nMarkdown: [] (空格)`,
    markdown: /^\[\]\s$/,
    hotkey: {key: ['t', 'T'], shortKey: true, shiftKey: true}
  },
  {
    flavour: 'callout',
    description: `高亮块(${IS_MAC ? '⌘' : 'Ctrl'} + Shift + Q)\nMarkdown: ! (空格)`,
    markdown: /^!\s$/,
    hotkey: {key: ['q', 'Q'], shortKey: true, shiftKey: true},
    onConvert: (doc, from, matchedString) => {
      const callout = doc.schemas.createSnapshot('callout', [])
      const p = doc.schemas.createSnapshot('paragraph', [sliceDelta(from.textDeltas(), matchedString.length), from.props])
      callout.children = [p]
      void doc.chain()
        .replaceWithSnapshots(from.id, [callout])
        .selectOrSetCursorAtBlock(p.id, true)
        .run()
    }
  },
  {
    flavour: 'blockquote',
    description: `引用块\nMarkdown: > (空格)`,
    markdown: /^>\s$/,
  },
  {
    flavour: 'divider',
    description: `分割线(${IS_MAC ? '⌘' : 'Ctrl'} + Shift + H)\nMarkdown: --- (空格)`,
    markdown: /^---\s$/
  },
  {
    flavour: 'divider',
    description: `分割线(${IS_MAC ? '⌘' : 'Ctrl'} + Shift + H)\nMarkdown: --- (空格)`,
    markdown: /^---\s$/,
    hotkey: {key: ['h', 'H'], shortKey: true, shiftKey: true}
  },
  {
    flavour: 'code',
    description: `代码块(${IS_MAC ? '⌘' : 'Ctrl'} + Shift + e)\nMarkdown: \`\`\` (空格)`,
    markdown: /^```\s$/,
    hotkey: {key: ['E', 'e'], shortKey: true, shiftKey: true}
  }
]

const findPreviousOrderedForContinuation = (block: BaseBlockComponent<any>) => {
  const parent = block.parentBlock
  if (!parent) return null

  const siblings = parent.getChildrenBlocks()
  const index = siblings.indexOf(block)
  if (index === -1) return null

  for (let i = index - 1; i >= 0; i--) {
    const prevBlock = siblings[i]
    if (isHeadingBoundary(prevBlock)) {
      break
    }
    if (prevBlock.flavour !== 'ordered') {
      continue
    }
    if (getDepth(prevBlock) < getDepth(block)) {
      break
    }
    if (!isSameHeadingLevel(prevBlock, block)) {
      continue
    }
    if (getDepth(prevBlock) === getDepth(block)) {
      return prevBlock
    }
  }

  return null
}

const getDepth = (block: BlockCraft.BlockComponent) => {
  return (block.props['depth'] || 0) as number
}

const getHeadingLevel = (block: BlockCraft.BlockComponent) => {
  return (block.props['heading'] || 0) as number
}

const isSameHeadingLevel = (left: BlockCraft.BlockComponent, right: BlockCraft.BlockComponent) => {
  return getHeadingLevel(left) === getHeadingLevel(right)
}

const isHeadingBoundary = (block: BlockCraft.BlockComponent) => {
  return getHeadingLevel(block) > 0
}
