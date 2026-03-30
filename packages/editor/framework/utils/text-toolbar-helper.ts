import {BlockNodeType, DeltaInsert, EditableBlockComponent, IEditableBlockProps, IInlineNodeAttrs} from "../block-std";
import {getCommonAttributesFromDeltas, sliceDelta} from "../../global";

export interface ITextCommonAttrs {
  attrs: Map<string, any>
  colors: Record<string, string | null>
  props: Partial<IEditableBlockProps>,
  flavour?: BlockCraft.BlockFlavour,
  allEditable?: boolean
}

export class TextToolbarHelper {
  constructor(public readonly doc: BlockCraft.Doc) {
  }

  private pickDeltaAttrsAt(deltas: DeltaInsert[], index: number) {
    let offset = 0
    for (const op of deltas) {
      const length = typeof op.insert === 'string' ? op.insert.length : 1
      if (length <= 0) continue
      if (index < offset + length) {
        return op.attributes ? {...op.attributes} : {}
      }
      offset += length
    }
    return null
  }

  private getCollapsedAttrs(block: EditableBlockComponent, index: number) {
    const deltas = block.textDeltas()
    if (!deltas.length) return {}

    const textLength = block.textLength
    const safeIndex = Math.max(0, Math.min(index, textLength))
    const prevAttrs = safeIndex > 0 ? this.pickDeltaAttrsAt(deltas, safeIndex - 1) : null
    const curAttrs = this.pickDeltaAttrsAt(deltas, safeIndex)

    return prevAttrs || curAttrs || {}
  }

  getCurrentCommonAttrs(selection: BlockCraft.Selection): ITextCommonAttrs {
    const attrs = new Map<string, any>()
    let colors: Record<string, string | null>
    let props: Partial<IEditableBlockProps> = JSON.parse(JSON.stringify(selection.firstBlock.props))
    let flavour: BlockCraft.BlockFlavour | undefined = selection.firstBlock.flavour
    let allEditable = selection.firstBlock.nodeType === BlockNodeType.editable

    const between = this.doc.queryBlocksBetween(selection.firstBlock, selection.lastBlock, true).map(id => this.doc.getBlockById(id))

    const allDeltas: DeltaInsert[] = []
    if (selection.start.type === 'text' && selection.collapsed) {
      const startBlock = selection.firstBlock as EditableBlockComponent
      const startOffset = selection.start.offset
      const collapsedAttrs = this.doc.inputManger.peekNextInsertAttrs({
        blockId: selection.start.blockId,
        index: startOffset
      }) || this.getCollapsedAttrs(startBlock, startOffset)
      colors = {
        color: (collapsedAttrs['s:color'] as string | null) ?? null,
        backColor: (collapsedAttrs['s:background'] as string | null) ?? null
      }
      Object.entries(collapsedAttrs).forEach(([key, value]) => {
        attrs.set(key.slice(2), value)
      })
      return {
        attrs,
        colors,
        props,
        flavour,
        allEditable
      }
    }

    if (selection.start.type === 'text') {
      const startBlock = selection.firstBlock as EditableBlockComponent
      const startOffset = selection.start.offset
      const endOffset = selection.isInSameBlock && selection.end.type === 'text'
        ? selection.end.offset
        : startBlock.textLength
      allDeltas.push(...sliceDelta(startBlock.textDeltas(), startOffset, endOffset))
    }

    between.slice(1).forEach((block, i) => {
      if (!this.doc.isEditable(block) || block.plainTextOnly) {
        allEditable = false
        return
      }
      if (props.textAlign !== null && block.props.textAlign !== props.textAlign) {
        props.textAlign = undefined
      }
      if (props.heading !== null && block.props.heading !== props.heading) {
        props.heading = undefined
      }
      if (block.flavour !== null && block.flavour !== flavour) {
        flavour = undefined
      }
      if (i === between.length - 2 && !selection.isInSameBlock && selection.end.type === 'text') {
        allDeltas.push(...sliceDelta(block.textDeltas(), 0, selection.end.offset))
      } else {
        allDeltas.push(...block.textDeltas())
      }
    })

    const commonAttrs = getCommonAttributesFromDeltas(allDeltas)
    colors = {
      color: commonAttrs['s:color'] ?? null,
      backColor: commonAttrs['s:background'] ?? null
    }
    Object.entries(commonAttrs).forEach(([key, value]) => {
      attrs.set(key.slice(2), value)
    })
    return {
      attrs,
      colors,
      props,
      flavour,
      allEditable
    }
  }

  formatText = (attrs: IInlineNodeAttrs, selection: BlockCraft.Selection | null = this.doc.selection.value) => {
    if (!selection) return

    const s = selection.start, e = selection.end

    if (selection.collapsed && s.type === 'text') {
      const startBlock = selection.firstBlock as EditableBlockComponent
      const nextAttrs: Record<string, any> = {
        ...this.getCollapsedAttrs(startBlock, s.offset)
      }
      Object.entries(attrs).forEach(([key, value]) => {
        if (value === null || value === undefined) {
          delete nextAttrs[key]
        } else {
          nextAttrs[key] = value
        }
      })
      this.doc.inputManger.setNextInsertAttrs(nextAttrs as IInlineNodeAttrs, {
        blockId: s.blockId,
        index: s.offset
      })
    }

    if (s.type === 'text') {
      const startBlock = selection.firstBlock as EditableBlockComponent
      if (!startBlock.plainTextOnly) {
        const len = selection.isInSameBlock && e.type === 'text' ? e.offset - s.offset : startBlock.textLength - s.offset
        startBlock.formatText(s.offset, len, attrs)
      }
    }
    if (selection.isInSameBlock) return

    if (e.type === 'text') {
      const endBlock = selection.lastBlock as EditableBlockComponent
      if (!endBlock.plainTextOnly && e.offset > 0) {
        endBlock.formatText(0, e.offset, attrs)
      }
    }

    const between = this.doc.queryBlocksBetween(selection.firstBlock, selection.lastBlock)
    for (const id of between) {
      const block = this.doc.getBlockById(id)
      if (!this.doc.isEditable(block) || block.plainTextOnly) continue
      block.formatText(0, block.textLength, attrs)
    }
  }

  updateBlockProps(props: Partial<IEditableBlockProps>, selection: BlockCraft.Selection | null = this.doc.selection.value) {
    if (!selection) return

    this.doc.crud.transact(() => {
      const between: string[] = this.doc.queryBlocksBetween(selection.firstBlock, selection.lastBlock, true)
      for (const id of between) {
        const block = this.doc.getBlockById(id)
        if (!this.doc.isEditable(block)) continue
        if (block.plainTextOnly) continue
        block.updateProps({...props})
      }
    })
  }

  transformBlocks(flavour: BlockCraft.BlockFlavour, selection: BlockCraft.Selection | null = this.doc.selection.value) {
    if (!selection) return

    const between: string[] = this.doc.queryBlocksBetween(selection.firstBlock, selection.lastBlock, true)
    void this.doc.chain()
      .transact(() => {
        between.forEach(id => {
          const block = this.doc.getBlockById(id)
          if (!this.doc.isEditable(block)) return
          if (block.plainTextOnly || block.flavour === flavour) return
          const newBlock = this.doc.schemas.createSnapshot(flavour, [block.textDeltas(), {
            ...block.props,
            heading: flavour === 'ordered' ? block.props.heading : null
          }])
          this.doc.crud.replaceWithSnapshots(id, [newBlock])
        })
      })
      .run()
  }
}
