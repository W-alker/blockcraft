import {BlockNodeType, DeltaInsert, IEditableBlockProps, IInlineNodeAttrs} from "../../framework";
import {getCommonAttributesFromDeltas, sliceDelta} from "../../global";

export interface ITextCommonAttrs {
  attrs: Map<string, any>
  colors: Record<string, string | null>
  props: Partial<IEditableBlockProps>,
  flavour?: BlockCraft.BlockFlavour,
  allEditable?: boolean
}

export class TextToolbarUtils {
  constructor(public readonly doc: BlockCraft.Doc) {
  }

  getCurrentCommonAttrs(selection: BlockCraft.Selection): ITextCommonAttrs {
    const attrs = new Map<string, any>()
    let colors: Record<string, string | null>
    let props: Partial<IEditableBlockProps> = JSON.parse(JSON.stringify(selection.firstBlock.props))
    let flavour: BlockCraft.BlockFlavour | undefined = selection.firstBlock.flavour
    let allEditable = selection.firstBlock.nodeType === BlockNodeType.editable

    const between = this.doc.queryBlocksBetween(selection.firstBlock, selection.lastBlock, true).map(id => this.doc.getBlockById(id))

    const allDeltas: DeltaInsert[] = []
    if (selection.from.type === 'text') {
      allDeltas.push(...sliceDelta(selection.from.block.textDeltas(), selection.from.index, selection.from.index + selection.from.length))
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
      if (i === between.length - 2 && selection.to?.type === 'text') {
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

  formatText = (attrs: IInlineNodeAttrs) => {
    const selection = this.doc.selection.value
    if (!selection) return

    const {from, to} = selection
    // this.doc.crud.transact(() => {
    if (from.type === 'text' && !from.block.plainTextOnly) {
      from.block.formatText(from.index, from.length, attrs)
    }
    if (!to) return
    if (to.type === 'text' && !to.block.plainTextOnly) {
      to.block.formatText(to.index, to.length, attrs)
    }

    const between = this.doc.queryBlocksBetween(from.block, to.block)
    for (const id of between) {
      const block = this.doc.getBlockById(id)
      if (!this.doc.isEditable(block) || block.plainTextOnly) continue;
      block.formatText(0, block.textLength, attrs)
    }
    // }, ORIGIN_SKIP_SYNC)
  }


}

