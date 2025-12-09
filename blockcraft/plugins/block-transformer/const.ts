import {EditableBlockComponent, HotKeyTrigger, IBlockProps, ORIGIN_SKIP_SYNC} from "../../framework";
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
    markdown: /^(\d|[a-zA-Z])+\.\s$/,
    hotkey: {key: ['o', 'O'], shortKey: true, shiftKey: true},
    onConvert: (doc, from, matchedString) => {
      const prevBlock = doc.prevSibling(from)
      // props.order = prevBlock?.flavour === 'ordered' ? (prevBlock.props['order'] || 0) + 1 : 1
      // if(!prevBlock || (!prevBlock.props.depth && prevBlock.flavour != 'ordered')) {
      //   props['start'] = 1
      // }

      const o = doc.schemas.createSnapshot('ordered', [sliceDelta(from.textDeltas(), matchedString.length), from.props])
      if (prevBlock?.flavour === 'ordered') {
        o.props['order'] = prevBlock.props['order'] || 0
      } else {
        let parsedNum = parseInt(matchedString, 10)
        if (isNaN(parsedNum)) {
          parsedNum = 1
        }
        o.props['order'] = parsedNum - 1
        o.props['start'] = parsedNum
      }
      doc.crud.replaceWithSnapshots(from.id, [o]).then(() => {
        doc.selection.selectOrSetCursorAtBlock(o.id, true)
      })
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
      doc.crud.replaceWithSnapshots(from.id, [callout]).then(() => {
        doc.selection.selectOrSetCursorAtBlock(p.id, true)
      })
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
    description: `代码块(${IS_MAC ? '⌘' : 'Ctrl'} + Shift + C)\nMarkdown: \`\`\` (空格)`,
    markdown: /^```\s$/,
    hotkey: {key: ['c', 'C'], shortKey: true, shiftKey: true}
  }
]
