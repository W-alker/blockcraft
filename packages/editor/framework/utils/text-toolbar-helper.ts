import {BlockNodeType, DeltaInsert, EditableBlockComponent, IEditableBlockProps, IInlineNodeAttrs} from "../block-std";
import {getCommonAttributesFromDeltas, sliceDelta} from "../../global";
import {getSelectionCoveredBlockIds} from "../modules/selection/covered-blocks";
import {isSelectionAlive} from "../modules/selection/liveness";

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

  private emptyCommonAttrs(): ITextCommonAttrs {
    return {
      attrs: new Map(),
      colors: {},
      props: {},
      allEditable: false,
    }
  }

  private isSelectionAlive(selection: BlockCraft.Selection | null | undefined): selection is BlockCraft.Selection {
    return isSelectionAlive(selection as any, this.doc)
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
    if (!this.isSelectionAlive(selection)) return this.emptyCommonAttrs()

    const attrs = new Map<string, any>()
    let colors: Record<string, string | null>
    let props: Partial<IEditableBlockProps> = JSON.parse(JSON.stringify(selection.firstBlock.props))
    let flavour: BlockCraft.BlockFlavour | undefined = selection.firstBlock.flavour
    let allEditable = selection.firstBlock.nodeType === BlockNodeType.editable

    const between = getSelectionCoveredBlockIds(selection, this.doc).map(id => this.doc.getBlockById(id))

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
    if (!this.isSelectionAlive(selection)) return

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
    if (selection.isInSameBlock) {
      // Restore selection after DOM restructuring from format (e.g., text node splits)
      if (!selection.collapsed) {
        this.doc.selection.setSelection(s, e)
      }
      return
    }

    if (e.type === 'text') {
      const endBlock = selection.lastBlock as EditableBlockComponent
      if (!endBlock.plainTextOnly && e.offset > 0) {
        endBlock.formatText(0, e.offset, attrs)
      }
    }

    let between: string[]
    try {
      between = this.doc.queryBlocksBetween(selection.firstBlock, selection.lastBlock)
    } catch {
      return
    }
    for (const id of between) {
      let block: BlockCraft.BlockComponent
      try {
        block = this.doc.getBlockById(id)
      } catch {
        continue
      }
      if (!this.doc.isEditable(block) || block.plainTextOnly) continue
      block.formatText(0, block.textLength, attrs)
    }

    // Restore selection after DOM restructuring from format
    if (!selection.collapsed) {
      this.doc.selection.setSelection(s, e)
    }
  }

  updateBlockProps(props: Partial<IEditableBlockProps>, selection: BlockCraft.Selection | null = this.doc.selection.value) {
    if (!selection) return
    if (!this.isSelectionAlive(selection)) return

    this.doc.crud.transact(() => {
      let between: string[] = []
      try {
        between = getSelectionCoveredBlockIds(selection, this.doc)
      } catch {
        return
      }
      for (const id of between) {
        let block: BlockCraft.BlockComponent
        try {
          block = this.doc.getBlockById(id)
        } catch {
          continue
        }
        if (!this.doc.isEditable(block)) continue
        if (block.plainTextOnly) continue
        block.updateProps({...props})
      }
    })
  }

  transformBlocks(flavour: BlockCraft.BlockFlavour, selection: BlockCraft.Selection | null = this.doc.selection.value) {
    if (!selection) return
    if (!this.isSelectionAlive(selection)) return

    let between: string[]
    try {
      between = getSelectionCoveredBlockIds(selection, this.doc)
    } catch {
      return
    }

    // 切列表类型等批量替换：WKWebView 在 DOM 大批替换 + contenteditable=false
    // 子元素（todo/ordered/bullet 的 prefix）附近会同步发出大量 selectionchange，
    // 每次都触发 recalculate + selection.modify('move') 强制 layout，最终主线程
    // 被锁（Blink 不会出现）。整个 transform 期间 gate 原生事件入口，并在 DOM
    // 落地后用 oldId → newId 映射 replay 老选区，避免原生 selection 因节点
    // 被替换而丢失导致失焦。
    const savedJson = selection.toJSON()
    const idMap = new Map<string, string>()

    this.doc.selection.setSuppressRecalculate(true)
    void this.doc.chain()
      .transact(() => {
        between.forEach(id => {
          let block: BlockCraft.BlockComponent
          try {
            block = this.doc.getBlockById(id)
          } catch {
            return
          }
          if (!this.doc.isEditable(block)) return
          if (block.plainTextOnly || block.flavour === flavour) return
          const newBlock = this.doc.schemas.createSnapshot(flavour, [block.textDeltas(), {
            ...block.props,
            heading: flavour === 'ordered' ? block.props.heading : null
          }])
          idMap.set(id, newBlock.id)
          this.doc.crud.replaceWithSnapshots(id, [newBlock])
        })
      })
      .run()
      .finally(() => {
        // 等 Angular 同步插入完成 + 一帧 layout 后再放开。
        // 直接放开会让残留的 selectionchange 队列立刻进入 recalculate。
        requestAnimationFrame(() => {
          // 用 idMap remap 老选区，恢复焦点到对应的新块。
          // 未被替换的块（已是目标 flavour / plainTextOnly）id 不变。
          // textDeltas 完全克隆到新块，offset 仍然有效。
          const remapId = (id: string) => idMap.get(id) ?? id
          const remapped = {
            anchor: { ...savedJson.anchor, blockId: remapId(savedJson.anchor.blockId) },
            head: { ...savedJson.head, blockId: remapId(savedJson.head.blockId) },
            commonParent: remapId(savedJson.commonParent),
          }
          try {
            this.doc.selection.replay(remapped)
          } catch {}
          this.doc.selection.setSuppressRecalculate(false)
          this.doc.selection.recalculate()
        })
      })
  }
}
