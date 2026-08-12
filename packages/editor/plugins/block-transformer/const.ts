import {EditableBlockComponent, HotKeyTrigger, IBlockProps} from "../../framework";
import {sliceDelta} from "../../global";

export interface IBlockTransformConfig {
  flavour: string
  /** Slash-menu introduction overriding Schema `metadata.description`. */
  description?: string
  /** Additional searchable aliases owned by this transform. */
  keywords?: readonly string[]
  /** Short alias displayed as `/alias` and included in slash search. */
  searchAlias?: string
  markdown?: RegExp
  /** Human-readable Markdown trigger rendered separately from the introduction. */
  markdownHint?: string
  hotkey?: HotKeyTrigger,
  onConvert?: (doc: BlockCraft.Doc, from: EditableBlockComponent, matchedString: string) => void
}

export const headingTransforms: IBlockTransformConfig[] = [
  {
    flavour: 'heading-one',
    description: '用于文档主标题或最高层级章节',
    searchAlias: 'h1',
    markdown: /^#\s$/,
    markdownHint: '# + 空格',
    hotkey: {key: '1', shortKey: true},
  },
  {
    flavour: 'heading-two',
    description: '用于组织主要章节',
    searchAlias: 'h2',
    markdown: /^##\s$/,
    markdownHint: '## + 空格',
    hotkey: {key: '2', shortKey: true},
  },
  {
    flavour: 'heading-three',
    description: '用于组织章节内的小节',
    searchAlias: 'h3',
    markdown: /^###\s$/,
    markdownHint: '### + 空格',
    hotkey: {key: '3', shortKey: true},
  },
  {
    flavour: 'heading-four',
    description: '用于更细粒度的内容层级',
    searchAlias: 'h4',
    markdown: /^####\s$/,
    markdownHint: '#### + 空格',
    hotkey: {key: '4', shortKey: true},
  },
]

export const blockTransforms: IBlockTransformConfig[] = [
  {
    flavour: 'bullet',
    searchAlias: 'wxlb',
    markdown: /^[-+]\s$/,
    markdownHint: '- 或 + 后空格',
    hotkey: {key: ['l', 'L'], shortKey: true, shiftKey: true}
  },
  {
    flavour: 'ordered',
    searchAlias: 'yxlb',
    markdown: /^(\d|[a-z])+\.\s$/,
    markdownHint: '1. + 空格',
    hotkey: {key: ['o', 'O'], shortKey: true, shiftKey: true},
    onConvert: (doc, from, matchedString) => {
      const o = doc.schemas.createSnapshot('ordered', [sliceDelta(from.textDeltas(), matchedString.length), from.props])
      const prevOrdered = findPreviousOrderedForContinuation(doc, from)
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
        .nextTick()
        .selectOrSetCursorAtBlock(o.id, true)
        .recalculateSelection()
        .run()
    }
  },
  {
    flavour: 'todo',
    searchAlias: 'db',
    markdown: /^\[\]\s$/,
    markdownHint: '[] + 空格',
    hotkey: {key: ['t', 'T'], shortKey: true, shiftKey: true}
  },
  {
    flavour: 'callout',
    searchAlias: 'gl',
    markdown: /^!\s$/,
    markdownHint: '! + 空格',
    hotkey: {key: ['q', 'Q'], shortKey: true, shiftKey: true},
    onConvert: (doc, from, matchedString) => {
      const callout = doc.schemas.createSnapshot('callout', [])
      const p = doc.schemas.createSnapshot('paragraph', [sliceDelta(from.textDeltas(), matchedString.length), from.props])
      callout.children = [p]
      void doc.chain()
        .replaceWithSnapshots(from.id, [callout])
        .nextTick()
        .selectOrSetCursorAtBlock(p.id, true)
        .recalculateSelection()
        .run()
    }
  },
  {
    flavour: 'blockquote',
    searchAlias: 'yy',
    markdown: /^>\s$/,
    markdownHint: '> + 空格',
  },
  {
    flavour: 'divider',
    searchAlias: 'fgx',
    markdown: /^---\s$/,
    markdownHint: '--- + 空格',
  },
  {
    flavour: 'divider',
    searchAlias: 'fgx',
    markdown: /^---\s$/,
    markdownHint: '--- + 空格',
    hotkey: {key: ['h', 'H'], shortKey: true, shiftKey: true}
  },
  {
    flavour: 'code',
    searchAlias: 'dm',
    markdown: /^```\s$/,
    markdownHint: '``` + 空格',
    hotkey: {key: ['E', 'e'], shortKey: true, shiftKey: true}
  }
]

type OrderedContinuationBlock = {
  id: string
  flavour: string
  props: IBlockProps
}

const findPreviousOrderedForContinuation = (
  doc: BlockCraft.Doc,
  block: OrderedContinuationBlock,
) => {
  const parentId = doc.model.getParentId(block.id)
  if (!parentId) return null

  const siblings = doc.model.getChildrenIds(parentId)
  const index = siblings.indexOf(block.id)
  if (index === -1) return null

  for (let i = index - 1; i >= 0; i--) {
    const siblingId = siblings[i]
    const flavour = doc.model.getFlavour(siblingId)
    const props = doc.model.getProps(siblingId) as IBlockProps | undefined
    if (!flavour || !props) continue
    const prevBlock = {id: siblingId, flavour, props}
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

const getDepth = (block: Pick<OrderedContinuationBlock, 'props'>) => {
  return (block.props['depth'] || 0) as number
}

const getHeadingLevel = (block: Pick<OrderedContinuationBlock, 'props'>) => {
  return (block.props['heading'] || 0) as number
}

const isSameHeadingLevel = (
  left: Pick<OrderedContinuationBlock, 'props'>,
  right: Pick<OrderedContinuationBlock, 'props'>,
) => {
  return getHeadingLevel(left) === getHeadingLevel(right)
}

const isHeadingBoundary = (block: Pick<OrderedContinuationBlock, 'props'>) => {
  return getHeadingLevel(block) > 0
}
