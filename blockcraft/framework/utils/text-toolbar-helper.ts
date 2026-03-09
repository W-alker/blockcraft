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

    const blocks = selection.blocks

    const allDeltas: DeltaInsert[] = []
    if (selection.kind === 'text' && selection.from.type === 'text' && selection.collapsed) {
      const collapsedAttrs = this.doc.inputManger.peekNextInsertAttrs({
        blockId: selection.from.blockId,
        index: selection.from.index
      }) || this.getCollapsedAttrs(selection.from.block, selection.from.index)
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

    if (selection.from.type === 'text') {
      allDeltas.push(...sliceDelta(selection.from.block.textDeltas(), selection.from.index, selection.from.index + selection.from.length))
    } else if (this.doc.isEditable(selection.from.block) && !selection.from.block.plainTextOnly) {
      allDeltas.push(...selection.from.block.textDeltas())
    }

    blocks.slice(1).forEach((block, i) => {
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
      if (block.id === selection.to?.blockId && selection.to?.type === 'text') {
        allDeltas.push(...sliceDelta(block.textDeltas(), 0, selection.to.index))
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

    const {from, to} = selection
    if ((selection.kind === 'block' || selection.kind === 'table')) return

    if (selection.collapsed && from.type === 'text') {
      const nextAttrs: Record<string, any> = {
        ...this.getCollapsedAttrs(from.block, from.index)
      }
      Object.entries(attrs).forEach(([key, value]) => {
        if (value === null || value === undefined) {
          delete nextAttrs[key]
        } else {
          nextAttrs[key] = value
        }
      })
      this.doc.inputManger.setNextInsertAttrs(nextAttrs as IInlineNodeAttrs, {
        blockId: from.blockId,
        index: from.index
      })
    }

    selection.blocks.forEach(block => {
      if (!this.doc.isEditable(block) || block.plainTextOnly) return
      if (block.id === from.blockId && from.type === 'text') {
        block.formatText(from.index, from.length, attrs)
        return
      }
      if (block.id === to?.blockId && to.type === 'text') {
        block.formatText(to.index, to.length, attrs)
        return
      }
      block.formatText(0, block.textLength, attrs)
    })
  }

  updateBlockProps(props: Partial<IEditableBlockProps>, selection: BlockCraft.Selection | null = this.doc.selection.value) {
    if (!selection) return

    this.doc.crud.transact(() => {
      selection.blocks.forEach(block => {
        if (!this.doc.isEditable(block) || block.plainTextOnly) return
        block.updateProps({...props})
      })
    })
  }

  transformBlocks(flavour: BlockCraft.BlockFlavour, selection: BlockCraft.Selection | null = this.doc.selection.value) {
    if (!selection) return

    this.doc.crud.transact(async () => {
      for (const block of selection.blocks) {
        if (!this.doc.isEditable(block) || block.plainTextOnly || block.flavour === flavour) continue
        const newBlock = this.doc.schemas.createSnapshot(flavour, [block.textDeltas(), {
          ...block.props,
          heading: flavour === 'ordered' ? block.props.heading : null
        }])
        await this.doc.crud.replaceWithSnapshots(block.id, [newBlock])
      }
    })
  }
}
