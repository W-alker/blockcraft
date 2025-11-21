import {EditableBlockComponent, HotKeyTrigger, IBlockProps, ORIGIN_SKIP_SYNC} from "../../framework";
import {sliceDelta} from "../../global";

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
    description: `一级标题(⌘/Ctrl + 1)\nMarkdown: # (空格)`,
    markdown: /^#\s$/
  },
  {
    flavour: 'heading-two',
    description: `二级标题(⌘/Ctrl + 2)\nMarkdown: ## (空格)`,
    markdown: /^##\s$/
  },
  {
    flavour: 'heading-three',
    description: `三级标题(⌘/Ctrl + 3)\nMarkdown: ### (空格)`,
    markdown: /^###\s$/
  },
  {
    flavour: 'heading-four',
    description: `四级标题(⌘/Ctrl + 4)\nMarkdown: #### (空格)`,
    markdown: /^####\s$/
  },
]

export const blockTransforms: IBlockTransformConfig[] = [
  {
    flavour: 'bullet',
    description: `无序列表(⌘/Ctrl + Shift + L)\nMarkdown: -/+ (空格)`,
    markdown: /^[-+]\s$/,
    hotkey: {key: ['l', 'L'], shortKey: true, shiftKey: true}
  },
  {
    flavour: 'ordered',
    description: `有序列表(⌘/Ctrl + Shift + O)\nMarkdown: (数字/字母). (空格)`,
    markdown: /^(\d|[a-zA-Z])+\.\s$/,
    hotkey: {key: ['o', 'O'], shortKey: true, shiftKey: true},
    onConvert: (doc, from, matchedString) => {
      // const prevBlock = doc.prevSibling(from)
      const props: IBlockProps = {
        order: parseInt(matchedString, 10) - 1,
        ...from.props,
      }
      // props.order = prevBlock?.flavour === 'ordered' ? (prevBlock.props['order'] || 0) + 1 : 1
      // if(!prevBlock || (!prevBlock.props.depth && prevBlock.flavour != 'ordered')) {
      //   props['start'] = 1
      // }

      const o = doc.schemas.createSnapshot('ordered', [sliceDelta(from.textDeltas(), matchedString.length), props])
      doc.crud.replaceWithSnapshots(from.id, [o]).then(() => {
        doc.selection.selectOrSetCursorAtBlock(o.id, true)
      })
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
