import {
  BlockNodeType,
  DeltaInsert,
  EditableBlockComponent,
  IEditableBlockProps,
  IBlockProps,
  IInlineNodeAttrs,
  INLINE_TYPOGRAPHY_ATTRS,
  createInlineTypographyPatch,
  matchTypographyFontFamily,
  normalizeInlineFontScale,
  normalizeInlineLetterSpacing,
  normalizeParagraphFontScale,
  normalizeParagraphSpacing,
  normalizeTypographyLineHeight,
  type TypographyFontFamilyId,
} from "../block-std";
import {getCommonAttributesFromDeltas, sliceDelta} from "../../global";
import {getSelectionCoveredBlockIds} from "../modules/selection/covered-blocks";
import {isSelectionAlive} from "../modules/selection/liveness";

export interface ITextCommonAttrs {
  attrs: Map<string, any>
  colors: Record<string, string | null>
  props: Partial<IEditableBlockProps>,
  /** `null` means inherited/default; `undefined` means mixed or unsupported. */
  typography?: {
    ff: TypographyFontFamilyId | null | undefined
    fs: number | null | undefined
    ls: number | null | undefined
  }
  /** Paragraph-level typography across every editable block in the selection. */
  paragraph?: {
    pfs: number | null | undefined
    lh: number | null | undefined
    psb: number | null | undefined
    psa: number | null | undefined
  }
  flavour?: BlockCraft.BlockFlavour,
  allEditable?: boolean
}

export interface IFontScaleTarget {
  blockId: string
  kind: 'paragraph' | 'inline'
  start: number
  length: number
}

export class TextToolbarHelper {
  constructor(public readonly doc: BlockCraft.Doc) {
  }

  private emptyCommonAttrs(): ITextCommonAttrs {
    return {
      attrs: new Map(),
      colors: {},
      props: {},
      typography: {ff: null, fs: null, ls: null},
      paragraph: {pfs: null, lh: null, psb: null, psa: null},
      allEditable: false,
    }
  }

  private isSelectionAlive(selection: BlockCraft.Selection | null | undefined): selection is BlockCraft.Selection {
    return isSelectionAlive(selection as any, this.doc)
  }

  private hasModelBlock(blockId: string): boolean {
    return typeof (this.doc as any).model?.exists === 'function' && this.doc.model.exists(blockId)
  }

  private firstBlockId(selection: BlockCraft.Selection): string {
    return (selection as BlockCraft.Selection & {firstBlockId?: string}).firstBlockId ?? selection.firstBlock.id
  }

  private lastBlockId(selection: BlockCraft.Selection): string {
    return (selection as BlockCraft.Selection & {lastBlockId?: string}).lastBlockId ?? selection.lastBlock.id
  }

  private blockNodeType(blockId: string): BlockNodeType | undefined {
    if (this.hasModelBlock(blockId)) return this.doc.model.getNodeType(blockId)
    try {
      return this.doc.getBlockById(blockId).nodeType
    } catch {
      return undefined
    }
  }

  private blockProps(blockId: string): Partial<IEditableBlockProps> {
    if (this.hasModelBlock(blockId)) {
      return (this.doc.model.getProps(blockId) ?? {}) as Partial<IEditableBlockProps>
    }
    try {
      return this.doc.getBlockById(blockId).props as Partial<IEditableBlockProps>
    } catch {
      return {}
    }
  }

  private blockFlavour(blockId: string): BlockCraft.BlockFlavour | undefined {
    if (this.hasModelBlock(blockId)) return this.doc.model.getFlavour(blockId)
    try {
      return this.doc.getBlockById(blockId).flavour
    } catch {
      return undefined
    }
  }

  private blockDeltas(blockId: string): DeltaInsert[] {
    if (this.hasModelBlock(blockId)) return this.doc.model.getTextDeltas(blockId) ?? []
    try {
      return (this.doc.getBlockById(blockId) as EditableBlockComponent).textDeltas()
    } catch {
      return []
    }
  }

  private blockTextLength(blockId: string): number {
    if (this.hasModelBlock(blockId)) return this.doc.model.getTextLength(blockId)
    try {
      return (this.doc.getBlockById(blockId) as EditableBlockComponent).textLength
    } catch {
      return 0
    }
  }

  private isPlainTextBlock(blockId: string): boolean {
    if (typeof (this.doc as any).isPlainTextBlock === 'function') {
      return this.doc.isPlainTextBlock(blockId)
    }
    try {
      return !!(this.doc.getBlockById(blockId) as EditableBlockComponent).plainTextOnly
    } catch {
      return false
    }
  }

  private formatBlockText(
    blockId: string,
    index: number,
    length: number,
    attrs: IInlineNodeAttrs,
  ): void {
    if (this.hasModelBlock(blockId) && typeof (this.doc.crud as any).formatText === 'function') {
      this.doc.crud.formatText(blockId, index, length, attrs)
      return
    }
    ;(this.doc.getBlockById(blockId) as EditableBlockComponent).formatText(index, length, attrs)
  }

  private updateBlockPropsById(blockId: string, props: Partial<IEditableBlockProps>): void {
    if (this.hasModelBlock(blockId) && typeof (this.doc.crud as any).updateBlockProps === 'function') {
      this.doc.crud.updateBlockProps(blockId, props)
      return
    }
    // The stable ID was already checked as an editable block. Global flavour
    // unions cannot express this runtime narrowing (root `lh` is non-nullable).
    this.doc.getBlockById(blockId).updateProps({...props} as never)
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

  private getCollapsedAttrs(blockId: string, index: number) {
    const deltas = this.blockDeltas(blockId)
    if (!deltas.length) return {}

    const textLength = this.blockTextLength(blockId)
    const safeIndex = Math.max(0, Math.min(index, textLength))
    const prevAttrs = safeIndex > 0 ? this.pickDeltaAttrsAt(deltas, safeIndex - 1) : null
    const curAttrs = this.pickDeltaAttrsAt(deltas, safeIndex)

    return prevAttrs || curAttrs || {}
  }

  private parseLegacyEm(value: unknown, normalize: (value: unknown) => number | null): number | null | undefined {
    if (value === null || value === undefined || value === '') return null
    if (typeof value !== 'string') return undefined
    const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))em$/i.exec(value.trim())
    return match ? normalize(match[1]) ?? undefined : undefined
  }

  private inlineTypographyFromAttrs(attrs: IInlineNodeAttrs) {
    let ff: TypographyFontFamilyId | null | undefined = null
    const compactFamily = attrs[INLINE_TYPOGRAPHY_ATTRS.fontFamily]
    if (compactFamily !== null && compactFamily !== undefined) {
      ff = matchTypographyFontFamily(compactFamily) ?? undefined
    } else if (attrs['s:fontFamily'] !== null && attrs['s:fontFamily'] !== undefined) {
      ff = matchTypographyFontFamily(attrs['s:fontFamily']) ?? undefined
    }

    const compactScale = attrs[INLINE_TYPOGRAPHY_ATTRS.fontScale]
    const fs = compactScale === null || compactScale === undefined
      ? this.parseLegacyEm(attrs['s:fontSize'], normalizeInlineFontScale)
      : normalizeInlineFontScale(compactScale) ?? undefined

    const compactSpacing = attrs[INLINE_TYPOGRAPHY_ATTRS.letterSpacing]
    const ls = compactSpacing === null || compactSpacing === undefined
      ? this.parseLegacyEm(attrs['s:letterSpacing'], normalizeInlineLetterSpacing)
      : normalizeInlineLetterSpacing(compactSpacing) ?? undefined

    return {ff, fs, ls}
  }

  private commonValue<T>(values: ReadonlyArray<T | null | undefined>): T | null | undefined {
    if (!values.length) return null
    const first = values[0]
    if (first === undefined) return undefined
    return values.every(value => value !== undefined && value === first) ? first : undefined
  }

  private commonInlineTypography(deltas: readonly DeltaInsert[]) {
    const states = deltas.length
      ? deltas.map(delta => this.inlineTypographyFromAttrs(delta.attributes ?? {}))
      : [this.inlineTypographyFromAttrs({})]
    return {
      ff: this.commonValue(states.map(state => state.ff)),
      fs: this.commonValue(states.map(state => state.fs)),
      ls: this.commonValue(states.map(state => state.ls)),
    }
  }

  private paragraphTypographyFromProps(props: Partial<IEditableBlockProps>) {
    const lineHeight = props.lh
    return {
      pfs: this.normalizedParagraphValue(props.pfs, normalizeParagraphFontScale),
      lh: lineHeight === null || lineHeight === undefined
        ? null
        : normalizeTypographyLineHeight(lineHeight) ?? undefined,
      psb: this.normalizedParagraphValue(props.psb, normalizeParagraphSpacing, true),
      psa: this.normalizedParagraphValue(props.psa, normalizeParagraphSpacing),
    }
  }

  private normalizedParagraphValue(
    value: unknown,
    normalize: (value: unknown) => number | null,
    zeroIsDefault = false,
  ): number | null | undefined {
    if (value === null || value === undefined) return null
    const normalized = normalize(value)
    if (normalized === null) return undefined
    return zeroIsDefault && normalized === 0 ? null : normalized
  }

  private commonParagraphTypography(states: Array<{
    pfs: number | null | undefined
    lh: number | null | undefined
    psb: number | null | undefined
    psa: number | null | undefined
  }>) {
    return {
      pfs: this.commonValue(states.map(state => state.pfs)),
      lh: this.commonValue(states.map(state => state.lh)),
      psb: this.commonValue(states.map(state => state.psb)),
      psa: this.commonValue(states.map(state => state.psa)),
    }
  }

  /**
   * Resolve model-only font-scale targets. A range that covers a complete
   * editable block becomes paragraph formatting; every other text range stays
   * inline. No DOM geometry or observers are involved.
   */
  getFontScaleTargets(
    selection: BlockCraft.Selection | null = this.doc.selection.value,
  ): IFontScaleTarget[] {
    if (!selection || !this.isSelectionAlive(selection) || selection.isAllSelected) return []

    let coveredIds: string[]
    try {
      coveredIds = getSelectionCoveredBlockIds(selection, this.doc)
    } catch {
      return []
    }

    const startId = this.firstBlockId(selection)
    const endId = this.lastBlockId(selection)
    const targets: IFontScaleTarget[] = []

    for (const blockId of coveredIds) {
      if (this.blockNodeType(blockId) !== BlockNodeType.editable || this.isPlainTextBlock(blockId)) continue

      const textLength = this.blockTextLength(blockId)
      let start = 0
      let end = textLength
      if (selection.start.type === 'text' && blockId === startId) {
        start = Math.max(0, Math.min(selection.start.offset, textLength))
      }
      if (selection.end.type === 'text' && blockId === endId) {
        end = Math.max(0, Math.min(selection.end.offset, textLength))
      }
      if (end < start) [start, end] = [end, start]

      const isCollapsedCaret = selection.collapsed &&
        selection.start.type === 'text' &&
        blockId === startId
      const completeBlock = !isCollapsedCaret && start === 0 && end === textLength
      targets.push({
        blockId,
        kind: completeBlock ? 'paragraph' : 'inline',
        start,
        length: end - start,
      })
    }

    return targets
  }

  canFormatFontScale(selection: BlockCraft.Selection | null = this.doc.selection.value): boolean {
    return this.getFontScaleTargets(selection).length > 0
  }

  private commonFontScaleForTargets(targets: readonly IFontScaleTarget[]) {
    return this.commonValue(targets.map(target => {
      if (target.kind === 'paragraph') {
        return this.normalizedParagraphValue(
          this.blockProps(target.blockId).pfs,
          normalizeParagraphFontScale,
        )
      }
      return this.commonInlineTypography(
        sliceDelta(
          this.blockDeltas(target.blockId),
          target.start,
          target.start + target.length,
        ),
      ).fs
    }))
  }

  getCurrentCommonAttrs(selection: BlockCraft.Selection): ITextCommonAttrs {
    if (!this.isSelectionAlive(selection)) return this.emptyCommonAttrs()

    const firstId = this.firstBlockId(selection)
    const lastId = this.lastBlockId(selection)
    const attrs = new Map<string, any>()
    let colors: Record<string, string | null>
    let props: Partial<IEditableBlockProps> = JSON.parse(JSON.stringify(this.blockProps(firstId)))
    let flavour: BlockCraft.BlockFlavour | undefined = this.blockFlavour(firstId)
    let allEditable = this.blockNodeType(firstId) === BlockNodeType.editable && !this.isPlainTextBlock(firstId)
    const paragraphStates = [this.paragraphTypographyFromProps(props)]

    const between = getSelectionCoveredBlockIds(selection, this.doc)

    const allDeltas: DeltaInsert[] = []
    if (selection.start.type === 'text' && selection.collapsed) {
      const startOffset = selection.start.offset
      const collapsedAttrs = this.doc.inputManger.peekNextInsertAttrs({
        blockId: selection.start.blockId,
        index: startOffset
      }) || this.getCollapsedAttrs(firstId, startOffset)
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
        typography: this.inlineTypographyFromAttrs(collapsedAttrs),
        paragraph: this.commonParagraphTypography(paragraphStates),
        flavour,
        allEditable
      }
    }

    if (selection.start.type === 'text') {
      const startOffset = selection.start.offset
      const endOffset = selection.isInSameBlock && selection.end.type === 'text'
        ? selection.end.offset
        : this.blockTextLength(firstId)
      allDeltas.push(...sliceDelta(this.blockDeltas(firstId), startOffset, endOffset))
    } else if (
      between.includes(firstId) &&
      this.blockNodeType(firstId) === BlockNodeType.editable &&
      !this.isPlainTextBlock(firstId)
    ) {
      allDeltas.push(...this.blockDeltas(firstId))
    }

    between.filter(id => id !== firstId).forEach(blockId => {
      if (this.blockNodeType(blockId) !== BlockNodeType.editable || this.isPlainTextBlock(blockId)) {
        allEditable = false
        return
      }
      const blockProps = this.blockProps(blockId)
      paragraphStates.push(this.paragraphTypographyFromProps(blockProps))
      const blockFlavour = this.blockFlavour(blockId)
      if (props.textAlign !== null && blockProps.textAlign !== props.textAlign) {
        props.textAlign = undefined
      }
      if (props.heading !== null && blockProps.heading !== props.heading) {
        props.heading = undefined
      }
      if (blockProps.lh !== props.lh) {
        props.lh = undefined
      }
      for (const key of ['psb', 'psa'] as const) {
        if (blockProps[key] !== props[key]) props[key] = undefined
      }
      if (blockFlavour !== flavour) {
        flavour = undefined
      }
      if (blockId === lastId && !selection.isInSameBlock && selection.end.type === 'text') {
        allDeltas.push(...sliceDelta(this.blockDeltas(blockId), 0, selection.end.offset))
      } else {
        allDeltas.push(...this.blockDeltas(blockId))
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
      typography: {
        ...this.commonInlineTypography(allDeltas),
        fs: this.commonFontScaleForTargets(this.getFontScaleTargets(selection)),
      },
      paragraph: this.commonParagraphTypography(paragraphStates),
      flavour,
      allEditable
    }
  }

  /**
   * Apply typography with paragraph-aware font scaling. Family, letter spacing
   * and effects still target the selected text; font scale is promoted to
   * `pfs` only for complete blocks and clears stale full-block inline size.
   */
  formatTypography(
    options: {
      attrs?: IInlineNodeAttrs
      fontScale?: unknown
    },
    selection: BlockCraft.Selection | null = this.doc.selection.value,
  ): void {
    if (!selection || !this.isSelectionAlive(selection)) return

    const targets = this.getFontScaleTargets(selection)
    if (!targets.length) return
    const hasFontScale = Object.prototype.hasOwnProperty.call(options, 'fontScale')
    const normalizedScale = hasFontScale
      ? options.fontScale === null || options.fontScale === undefined
        ? 1
        : normalizeParagraphFontScale(options.fontScale)
      : null
    if (hasFontScale && normalizedScale === null) return

    const attrs = options.attrs ?? {}
    const hasAttrs = Object.keys(attrs).length > 0
    if (!hasAttrs && !hasFontScale) return

    if (selection.collapsed && selection.start.type === 'text') {
      const caretPatch = {
        ...attrs,
        ...(hasFontScale
          ? createInlineTypographyPatch('fs', normalizedScale)
          : {}),
      } as IInlineNodeAttrs
      this.formatText(caretPatch, selection)
      return
    }

    const s = selection.start
    const e = selection.end
    this.doc.crud.transact(() => {
      for (const target of targets) {
        if (hasAttrs && target.length > 0) {
          this.formatBlockText(target.blockId, target.start, target.length, attrs)
        }
        if (!hasFontScale) continue

        if (target.kind === 'paragraph') {
          this.updateBlockPropsById(target.blockId, {
            pfs: normalizedScale === 1 ? null : normalizedScale,
          })
          if (target.length > 0) {
            this.formatBlockText(target.blockId, 0, target.length, {
              [INLINE_TYPOGRAPHY_ATTRS.fontScale]: null,
              's:fontSize': null,
            })
          }
        } else if (target.length > 0) {
          this.formatBlockText(
            target.blockId,
            target.start,
            target.length,
            createInlineTypographyPatch('fs', normalizedScale) as IInlineNodeAttrs,
          )
        }
      }
    })

    this.doc.selection.setSelection(s, e)
  }

  formatText = (attrs: IInlineNodeAttrs, selection: BlockCraft.Selection | null = this.doc.selection.value) => {
    if (!selection) return
    if (!this.isSelectionAlive(selection)) return

    const s = selection.start, e = selection.end
    const startId = this.firstBlockId(selection)
    const endId = this.lastBlockId(selection)

    if (selection.collapsed && s.type === 'text') {
      const nextAttrs: Record<string, any> = {
        ...this.getCollapsedAttrs(startId, s.offset)
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

    const coveredIds = getSelectionCoveredBlockIds(selection, this.doc)
    this.doc.crud.transact(() => {
      if (
        s.type === 'text' &&
        this.blockNodeType(startId) === BlockNodeType.editable &&
        !this.isPlainTextBlock(startId)
      ) {
        const len = selection.isInSameBlock && e.type === 'text'
          ? e.offset - s.offset
          : this.blockTextLength(startId) - s.offset
        this.formatBlockText(startId, s.offset, len, attrs)
      }

      if (!selection.isInSameBlock && e.type === 'text') {
        if (
          this.blockNodeType(endId) === BlockNodeType.editable &&
          !this.isPlainTextBlock(endId) &&
          e.offset > 0
        ) {
          this.formatBlockText(endId, 0, e.offset, attrs)
        }
      }

      if (!selection.isInSameBlock) {
        for (const blockId of coveredIds) {
          if (blockId === startId || blockId === endId) continue
          if (this.blockNodeType(blockId) !== BlockNodeType.editable) continue
          if (this.isPlainTextBlock(blockId)) continue
          this.formatBlockText(blockId, 0, this.blockTextLength(blockId), attrs)
        }
      }
    })

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
        if (this.blockNodeType(id) !== BlockNodeType.editable) continue
        if (this.isPlainTextBlock(id)) continue
        this.updateBlockPropsById(id, props)
      }
    })
  }

  transformBlocks(
    flavour: BlockCraft.BlockFlavour,
    selection: BlockCraft.Selection | null = this.doc.selection.value,
    props?: IBlockProps,
  ) {
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
          if (this.blockNodeType(id) !== BlockNodeType.editable) return
          if (this.isPlainTextBlock(id) || this.blockFlavour(id) === flavour) return
          const blockProps = this.blockProps(id)
          const newBlock = this.doc.schemas.createSnapshot(flavour, [this.blockDeltas(id), {
            ...blockProps,
            heading: flavour === 'ordered' ? blockProps.heading : null,
            ...props,
          }])
          idMap.set(id, newBlock.id)
          this.doc.crud.replaceWithSnapshots(id, [newBlock])
        })
      })
      .run()
      .finally(() => {
        // 等 Angular 同步插入完成 + 一帧 layout 后再放开。后台页或视图切换
        // 可能长期不执行 RAF，因此再提供一个 timeout 终止保证；两条路径共享
        // 同一个幂等 finalizer，避免重复 replay。
        let done = false
        let frameId: number | null = null
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        const finishRestore = () => {
          if (done) return
          done = true
          if (frameId !== null) cancelAnimationFrame(frameId)
          if (timeoutId !== null) clearTimeout(timeoutId)
          try {
            // 用 idMap remap 老选区，恢复焦点到对应的新块。
            // 未被替换的块（已是目标 flavour / plainTextOnly）id 不变。
            const remapId = (id: string) => idMap.get(id) ?? id
            this.doc.selection.replay({
              anchor: { ...savedJson.anchor, blockId: remapId(savedJson.anchor.blockId) },
              head: { ...savedJson.head, blockId: remapId(savedJson.head.blockId) },
              commonParent: remapId(savedJson.commonParent),
            })
          } catch {
          } finally {
            this.doc.selection.setSuppressRecalculate(false)
          }
        }

        timeoutId = setTimeout(finishRestore, 100)
        try {
          frameId = requestAnimationFrame(finishRestore)
        } catch {
          finishRestore()
        }
      })
  }
}
