import {
  InlineRuntime,
  runInlineRuntimeCanonicalMutation,
} from "../../framework/block-std/inline/runtime/inline-runtime";
import {EmbedConverterMap} from "../../framework/block-std/inline/blot/scroll-blot";
import {DeltaInsert, DeltaInsertText, DeltaOperation, InlineModel} from "../../framework/block-std/types";
import {mergeColorOverShiki, deltaFingerprint} from "./color-merge";
import {STR_LINE_BREAK} from "../../framework/block-std/inline/const";
import {shikiService} from "./shiki-config";
import type {BundledLanguage, Highlighter, ThemedToken} from 'shiki'
import {TextBlot} from "../../framework/block-std/inline/blot/text-blot";
import {CursorBlot} from "../../framework/block-std/inline/blot/cursor-blot";
import {EmbedBlot} from "../../framework/block-std/inline/blot/embed-blot";
import type {INormalizedEndpoints} from "../../framework/modules/selection/normalize";
import {IncrementalCodeTokenizer} from './incremental-code-tokenizer';
import {CodeTokenProjection, type CodeTokenLine} from './code-token-projection';
import {CodeLineIntegrity} from './code-line-integrity';
import {getLogicalLineAccess} from '../../framework/block-std/inline/blot/logical-line-access';

// ─── Token utils ───

const MERMAID_LANG_SET = new Set<BundledLanguage>(['mermaid', 'mmd'])
const isMermaidLang = (lang: BundledLanguage) => MERMAID_LANG_SET.has(lang)

const hasMultipleTokenColors = (lines: ThemedToken[][]): boolean => {
  const colors = new Set<string>()
  for (const line of lines) {
    for (const token of line) {
      if (!token.color) continue
      colors.add(token.color)
      if (colors.size > 1) return true
    }
  }
  return false
}

const wrapMermaidForShiki = (text: string): string => {
  const body = text.endsWith('\n') ? text : `${text}\n`
  return `\`\`\`mermaid\n${body}\`\`\``
}

const stripMermaidFenceLines = (lines: ThemedToken[][]): ThemedToken[][] => {
  if (lines.length <= 2) return []
  return lines.slice(1, -1)
}

export const flatShikiTokens = (
  lines: ThemedToken[][],
  originalText: string,
  withLineBreak = true
): DeltaInsertText[] => new CodeTokenProjection().project(lines, originalText, withLineBreak).deltas

// ─── Line-level diff ───

type TokenLine = CodeTokenLine

function groupTokenLines(deltas: DeltaInsertText[], withLines = true): TokenLine[] {
  const lines: TokenLine[] = []
  let cur: DeltaInsertText[] = []
  let fp = ''
  let text = ''

  for (const d of deltas) {
    cur.push(d)
    fp += deltaFingerprint(d)
    text += d.insert
    if (withLines && d.insert.endsWith(STR_LINE_BREAK)) {
      lines.push({deltas: cur, fp, text})
      cur = []
      fp = ''
      text = ''
    }
  }
  if (cur.length) lines.push({deltas: cur, fp, text})
  return lines
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

// ─── CodeInlineRuntime ───

interface IRenderOptions {
  lang: string;
  withLineBreak?: boolean;
  theme?: string;
  canonicalHost?: CodeInlineRuntimeHost;
}

interface CodeInlineSelection {
  anchor: number;
  head: number;
}

interface CodeInlineRuntimeHost {
  readModel: () => {text: string; deltas: DeltaInsert[]};
  hasTextRevisions: () => boolean;
  isCompositionBusy: () => boolean;
  readSelection: () => CodeInlineSelection | null;
}

/**
 * CodeInlineRuntime extends InlineRuntime with Shiki-based syntax highlighting.
 *
 * Line-level diff strategy:
 * 1. Reuse logical-line tokens; retokenize until grammar state converges
 * 2. Compare fingerprints (from Shiki tokens, not DOM) to find changed lines
 * 3. Splice changed lines in the blot tree (not direct DOM manipulation)
 *
 * Key: fingerprint comparison never reads DOM (avoids hex->rgb conversion mismatch).
 */
export class CodeInlineRuntime extends InlineRuntime {

  private _lineFPs: string[] = []
  private readonly _tokenizer = new IncrementalCodeTokenizer()
  private readonly _tokenProjection = new CodeTokenProjection()
  private readonly _lineIntegrity = new CodeLineIntegrity()
  private readonly _integrityObserver?: MutationObserver
  private _integrityClean = false
  private _readySyntax?: {lang: BundledLanguage; theme: string; highlighter: Highlighter}
  private _preparedLines = new WeakMap<DeltaInsertText[], TokenLine[]>()
  private _options: IRenderOptions
  /**
   * 高亮代际令牌。renderCode 和 diffHighLight 都 await 异步
   * tokenize，期间文本可能又变了。两者共享此令牌：开始时 ++ 抢占，await 后
   * 若令牌已被更新的高亮请求改掉，则放弃写回——否则陈旧 token 会覆盖更新的
   * blot 树，且把 _lineFPs 基线设成陈旧指纹，导致后续增量 diff 持续错位。
   *
   * 配套的 `!this.container.isConnected` 守卫拦的是「块在 tokenize 期间被删除」。
   * 虚拟化 detach 会 destroy runtime，重新挂载会创建新的 runtime。
   */
  private _renderToken = 0
  private _canonicalRenderFrame: number | null = null
  private _canonicalRenderGeneration = 0
  private _destroyed = false
  private _releaseCompositionCaret?: () => void

  private readonly _handleNativeInput = () => {
    const host = this._options.canonicalHost
    if (
      !host ||
      host.isCompositionBusy() ||
      !host.hasTextRevisions()
    ) return
    this._requestCanonicalRender(true)
  }

  constructor(
    container: HTMLElement,
    embedConverters: EmbedConverterMap,
    options: IRenderOptions = {lang: 'text'}
  ) {
    super(container, embedConverters, {
      lineContainerTag: options.withLineBreak === false ? undefined : 'c-line',
    })
    this._options = options
    if (options.withLineBreak !== false) {
      this._integrityObserver = new MutationObserver(records => this._recordIntegrityMutations(records))
    }
    if (options.canonicalHost) {
      container.addEventListener('input', this._handleNativeInput)
    }
  }

  /** @internal Isolate native candidate replacement from the preceding line break. */
  override acquireCompositionCaret(modelOffset: number): (() => void) | null {
    this._releaseCompositionCaret?.()
    if (this._destroyed || modelOffset <= 0) return null
    const previous = this.scrollBlot.findByOffset(modelOffset)
    if (!(previous?.blot instanceof TextBlot) || previous.localOffset !== 1 ||
      previous.blot.text !== '\n' || previous.blot.attrs?.['s:display'] === 'none') return null
    const line = previous.blot.domNode.parentNode
    if (!line || !this.scrollBlot.isCanonicalLineContainer(line)) return null
    const native = this.container.ownerDocument.getSelection()
    if (!native?.isCollapsed || !native.anchorNode || !this.container.contains(native.anchorNode)) return null

    // Blink can expand the second preedit replacement range to include the LF
    // before a c-line. A zero-model-length prefix gives it a stable start within
    // this line; all candidate text remains browser-owned until prepareCommit.
    const cursor = new CursorBlot()
    let released = false
    const release = () => {
      if (released) return
      released = true
      if (this._releaseCompositionCaret === release) this._releaseCompositionCaret = undefined
      this._integrityClean = false
      this._lineIntegrity.invalidateBaseline()
      runInlineRuntimeCanonicalMutation(this, () => this.scrollBlot.removeCursorBlot(cursor))
    }
    this._releaseCompositionCaret = release
    try {
      // Cursor insertion changes row structure; recheck all rows after IME.
      this._integrityClean = false
      this._lineIntegrity.invalidateBaseline()
      runInlineRuntimeCanonicalMutation(this, () => this.scrollBlot.insertCursorBlot(modelOffset, cursor))
      const node = cursor.anchorNode
      native.setBaseAndExtent(node, node.length, node, node.length)
    } catch (error) {
      release()
      throw error
    }
    return release
  }

  setLang(lang: string) {
    this._renderToken++
    this._options.lang = lang
    this._lineFPs = []
    this._clearSyntaxCache()
  }

  setTheme(theme: string) {
    this._renderToken++
    this._options.theme = theme
    this._lineFPs = []
    this._clearSyntaxCache()
  }

  /**
   * Render the authoritative model synchronously. A ready code surface can
   * reconcile IME commits by line; other cases retain the base full projection.
   * The following Shiki pass also repairs any late native composition tail.
   */
  override render(deltas: InlineModel) {
    this._renderToken++
    const host = this._options.canonicalHost
    // IME has already committed the complete Y.Text snapshot, including any
    // deferred remote changes. Repair its canonical view synchronously before
    // the input owner restores the committed caret and ends the session.
    if (host?.isCompositionBusy() && this._renderCompositionSnapshot(deltas)) {
      this._requestCanonicalRender(true)
      return
    }
    // The synchronous model projection replaces the highlighted DOM even when
    // text/tokens are identical. Its previous highlight baseline is no longer valid.
    this._lineFPs = []
    super.render(deltas)
    if (!host) return
    this._requestCanonicalRender(host.isCompositionBusy())
  }

  /**
   * Override: incremental delta patch, then schedule async highlight.
   */
  override applyDelta(ops: DeltaOperation[]) {
    // Invalidate at the model mutation, not at the later debounced highlight.
    this._renderToken++
    super.applyDelta(ops)
    // Highlighting is triggered externally via diffHighLight() with debounce
  }

  private _getShikiLanguage(): BundledLanguage {
    const lang = this._options.lang || 'text'
    if (!lang || lang === 'text') return 'text' as BundledLanguage
    return lang as BundledLanguage
  }

  private async _tokenize(
    text: string,
    modelDeltas: DeltaInsert[] = [],
    generation = this._renderToken,
  ): Promise<DeltaInsertText[]> {
    // Keep options tied to this text snapshot across asynchronous grammar loads.
    const lang = this._getShikiLanguage()
    const theme = this._options.theme || 'github-light'
    let tokenLines: ThemedToken[][]
    if ((lang as string) === 'text') {
      tokenLines = this._tokenizer.tokenize(text, {lang, theme})
    } else {
      const highlighter = await shikiService.getHighlighter()
      if (!this._canCommitHighlight(generation)) return []
      await shikiService.ensureLanguageLoaded(lang)
      if (!this._canCommitHighlight(generation)) return []
      if (isMermaidLang(lang)) {
        tokenLines = highlighter.codeToTokens(text, {lang, theme}).tokens
        if (!hasMultipleTokenColors(tokenLines)) {
          const wrappedTokens = highlighter.codeToTokens(wrapMermaidForShiki(text), {lang, theme})
          const strippedLines = stripMermaidFenceLines(wrappedTokens.tokens)
          if (hasMultipleTokenColors(strippedLines)) tokenLines = strippedLines
        }
      } else {
        tokenLines = this._tokenizer.tokenize(text, {lang, theme}, highlighter)
        this._readySyntax = {lang, theme, highlighter}
      }
    }

    return this._projectTokens(tokenLines, text, modelDeltas)
  }

  private _projectTokens(tokenLines: ThemedToken[][], text: string, modelDeltas: DeltaInsert[]) {
    const syntax = this._tokenProjection.project(tokenLines, text, this._options.withLineBreak)
    const deltas = modelDeltas.length ? mergeColorOverShiki(syntax.deltas, modelDeltas) : syntax.deltas
    // Presentation runs can split syntax runs; only the untouched syntax stream
    // can use cached line fingerprints. Bind to result identity across awaits.
    if (deltas === syntax.deltas && syntax.lines) this._preparedLines.set(deltas, syntax.lines)
    return deltas
  }

  private _renderCompositionSnapshot(deltas: InlineModel): boolean {
    if (this._options.withLineBreak === false || !this._lineFPs.length) return false
    const lang = this._getShikiLanguage()
    const theme = this._options.theme || 'github-light'
    const ready = this._readySyntax
    if (isMermaidLang(lang) || ((lang as string) !== 'text' && (ready?.lang !== lang || ready?.theme !== theme))) return false
    // An embed needs the existing full canonical reconstruction. Code normally
    // contains text only; do not infer model lengths from a damaged native DOM.
    if (deltas.some(delta => typeof delta.insert !== 'string')) return false
    try {
      const text = deltas.map(delta => delta.insert as string).join('')
      const tokens = this._tokenizer.tokenize(text, {lang, theme}, ready?.highlighter)
      this._reconcileHighlightedLines(this._projectTokens(tokens, text, deltas))
      return true
    } catch (error) {
      // The committed model must remain visible even if a native mutation made
      // the old Blot structure unrecoverable, or the cached engine is unavailable.
      console.error('[CodeInlineRuntime] composition reconciliation failed:', error)
      this._clearSyntaxCache()
      return false
    }
  }

  private _reconcileHighlightedLines(deltas: DeltaInsertText[]) {
    const lines = this._preparedLines.get(deltas) ?? groupTokenLines(deltas, this._options.withLineBreak !== false)
    const fingerprints = lines.map(line => line.fp)
    if (this._options.withLineBreak !== false && this._lineFPs.length) {
      this._patchLinesByBlot(lines, fingerprints, true)
    } else {
      super.render(deltas)
    }
    this._lineFPs = fingerprints
  }

  /**
   * Shiki tokenize -> line-level diff -> blot tree patch.
   */
  async diffHighLight(_ops: DeltaOperation[], opts?: {
    block: { id: string, textContent: () => string, setInlineRange: (idx: number) => void, textDeltas?: () => DeltaInsert[] },
    selectionValue: { start: { blockId: string, type: string, offset?: number } } | null,
    normalizeRange: (range: Range) => INormalizedEndpoints
  }) {
    if (!this._canCommitHighlight()) return
    const myToken = ++this._renderToken
    try {
      const canonical = this._options.canonicalHost?.readModel()
      const text = canonical?.text ?? opts?.block.textContent() ?? this._getPlainText()
      const modelDeltas = canonical?.deltas ?? opts?.block.textDeltas?.() ?? []
      const newDeltas = await this._tokenize(text, modelDeltas, myToken)
      // 陈旧/已卸载守卫：更新的高亮请求已抢占，或块在 tokenize 期间被移除
      if (!this._canCommitHighlight(myToken)) return
      const newLines = this._preparedLines.get(newDeltas) ?? groupTokenLines(newDeltas, this._options.withLineBreak !== false)
      const newFPs = newLines.map(l => l.fp)

      if (arraysEqual(this._lineFPs, newFPs)) return

      const selection = this._captureHighlightSelection()

      if (!this._lineFPs.length) {
        super.render(newDeltas)
      } else if (this._options.canonicalHost?.hasTextRevisions()) {
        // Revision presentation may coexist with a live inline-pagination
        // projection. Let InlineRuntime revoke that projection coherently
        // before rebuilding attributed Shiki runs.
        super.render(newDeltas)
      } else {
        this._patchLinesByBlot(newLines, newFPs)
      }

      this._lineFPs = newFPs

      if (selection) this._restoreNativeSelection(selection.native, selection.model)
    } catch (error) {
      if (!this._canCommitHighlight(myToken)) return
      console.error('[CodeInlineRuntime] highlight failed:', error)
      this._renderCanonicalFallback()
    }
  }

  async renderCode(getText?: () => string, getModelDeltas?: () => DeltaInsert[]) {
    if (!this._canCommitHighlight()) return
    const myToken = ++this._renderToken
    try {
      const canonical = this._options.canonicalHost?.readModel()
      const text = getText?.() ?? canonical?.text ?? this._getPlainText()
      const modelDeltas = getModelDeltas?.() ?? canonical?.deltas ?? []
      const deltas = await this._tokenize(text, modelDeltas, myToken)

      // 陈旧/已卸载守卫：更新的 renderCode/diffHighLight 已抢占令牌，或块在
      // tokenize 期间被移除。继续 build 会用旧文本覆盖更新的树、污染 _lineFPs。
      if (!this._canCommitHighlight(myToken)) return

      // Capture cursor AFTER async tokenization, right before reconciliation.
      // This ensures we capture the position set by any intervening operations
      // (e.g. undo replay that runs during the await).
      const selection = this._captureHighlightSelection()

      // The post-composition frame can contain late native input. Even equal
      // syntax fingerprints must validate/repair that DOM, without rebuilding
      // intact lines or clearing the synchronous commit's highlight baseline.
      this._reconcileHighlightedLines(deltas)

      if (selection) this._restoreNativeSelection(selection.native, selection.model)
    } catch (error) {
      if (!this._canCommitHighlight(myToken)) return
      console.error('[CodeInlineRuntime] render failed:', error)
      this._renderCanonicalFallback()
    }
  }

  override destroy() {
    if (this._destroyed) return
    this._releaseCompositionCaret?.()
    this._destroyed = true
    this._integrityObserver?.disconnect()
    this.container.removeEventListener('input', this._handleNativeInput)
    this._cancelCanonicalRender()
    this._canonicalRenderGeneration++
    this._renderToken++
    this._clearSyntaxCache()
    super.destroy()
  }

  // ─── Internal ───

  private _clearSyntaxCache() {
    this._integrityClean = false
    this._integrityObserver?.disconnect()
    this._tokenizer.clear()
    this._tokenProjection.clear()
    this._lineIntegrity.clear()
    this._readySyntax = undefined
    this._preparedLines = new WeakMap()
  }

  private _canCommitHighlight(generation = this._renderToken): boolean {
    return !this._destroyed && generation === this._renderToken &&
      this.container.isConnected && !this._options.canonicalHost?.isCompositionBusy()
  }

  private _captureHighlightSelection(): {native: Selection; model: CodeInlineSelection} | null {
    const native = this.container.ownerDocument.getSelection()
    if (
      !native?.rangeCount || !native.anchorNode || !native.focusNode ||
      !this.container.contains(native.anchorNode) || !this.container.contains(native.focusNode)
    ) return null
    const host = this._options.canonicalHost
    const canonical = host?.readSelection()
    // A whole-block selection may leave a stale native range in the editor.
    if (host && !canonical) return null
    // Native selectionchange can still be queued when Shiki resolves. Prefer
    // current mapped endpoints; unmanaged IME tails fall back to the model.
    const model = this._readNativeSelection(native) ?? canonical
    return model ? {native, model} : null
  }

  private _requestCanonicalRender(afterNativeMutation = false) {
    if (this._destroyed || !this._options.canonicalHost) return

    // A pending post-native frame already subsumes ordinary model renders.
    if (!afterNativeMutation && this._canonicalRenderFrame !== null) return

    const generation = ++this._canonicalRenderGeneration
    if (!afterNativeMutation) {
      queueMicrotask(() => {
        if (
          this._destroyed ||
          generation !== this._canonicalRenderGeneration ||
          this._canonicalRenderFrame !== null
        ) return
        void this.renderCode()
      })
      return
    }

    const ownerWindow = this.container.ownerDocument.defaultView
    if (!ownerWindow) {
      queueMicrotask(() => {
        if (
          this._destroyed ||
          generation !== this._canonicalRenderGeneration ||
          this._options.canonicalHost?.isCompositionBusy()
        ) return
        void this.renderCode()
      })
      return
    }

    if (this._canonicalRenderFrame !== null) {
      ownerWindow.cancelAnimationFrame(this._canonicalRenderFrame)
    }
    this._canonicalRenderFrame = ownerWindow.requestAnimationFrame(() => {
      this._canonicalRenderFrame = null
      if (
        this._destroyed ||
        generation !== this._canonicalRenderGeneration ||
        this._options.canonicalHost?.isCompositionBusy()
      ) return
      void this.renderCode()
    })
  }

  private _cancelCanonicalRender() {
    if (this._canonicalRenderFrame === null) return
    this.container.ownerDocument.defaultView
      ?.cancelAnimationFrame(this._canonicalRenderFrame)
    this._canonicalRenderFrame = null
  }

  private _readNativeSelection(selection: Selection): CodeInlineSelection | null {
    if (!selection.anchorNode || !selection.focusNode) return null
    try {
      const anchor = this.mapper.domPointToModelPoint(
        this.container, selection.anchorNode, selection.anchorOffset,
      )
      return {
        anchor,
        head: selection.isCollapsed ? anchor : this.mapper.domPointToModelPoint(
          this.container,
          selection.focusNode,
          selection.focusOffset,
        ),
      }
    } catch {
      return null
    }
  }

  private _restoreNativeSelection(
    selection: Selection,
    captured: CodeInlineSelection,
  ) {
    try {
      const anchor = this.mapper.modelPointToDomPoint(this.container, captured.anchor)
      const head = captured.anchor === captured.head
        ? anchor : this.mapper.modelPointToDomPoint(this.container, captured.head)
      if (
        selection.anchorNode === anchor.node && selection.anchorOffset === anchor.offset &&
        selection.focusNode === head.node && selection.focusOffset === head.offset
      ) return
      if (typeof selection.setBaseAndExtent === 'function') {
        selection.setBaseAndExtent(
          anchor.node as Node,
          anchor.offset,
          head.node as Node,
          head.offset,
        )
        return
      }
      selection.removeAllRanges()
      selection.collapse(anchor.node as Node, anchor.offset)
      selection.extend?.(head.node as Node, head.offset)
    } catch {
      // The model may have changed again while the asynchronous tokenizer ran.
      // A newer model render owns the next selection projection.
    }
  }

  private _renderCanonicalFallback() {
    const canonical = this._options.canonicalHost?.readModel()
    this._lineFPs = []
    if (canonical) {
      super.render(canonical.deltas)
      return
    }
    this._renderPlainText()
  }

  private _getPlainText(): string {
    let text = ''
    for (const leaf of this.scrollBlot.leaves) {
      if (leaf instanceof TextBlot) text += leaf.text
    }
    return text
  }

  private _renderPlainText() {
    const text = this._getPlainText()
    const deltas: DeltaInsertText[] = []
    if (this._options.withLineBreak && text.includes(STR_LINE_BREAK)) {
      let start = 0
      while (true) {
        const idx = text.indexOf(STR_LINE_BREAK, start)
        if (idx === -1) break
        if (idx > start) deltas.push({insert: text.slice(start, idx)})
        deltas.push({insert: STR_LINE_BREAK})
        start = idx + 1
      }
      if (start < text.length) deltas.push({insert: text.slice(start)})
    } else {
      if (text) deltas.push({insert: text})
    }
    super.render(deltas)
    const lines = groupTokenLines(deltas, this._options.withLineBreak !== false)
    this._lineFPs = lines.map(l => l.fp)
  }

  /**
   * Line-level blot tree patch.
   * Groups current blot tree leaves by LF, compares with new token lines,
   * and replaces only the changed lines.
   */
  private _patchLinesByBlot(newLines: TokenLine[], newFPs: string[], repairNativeDom = false) {
    try {
      runInlineRuntimeCanonicalMutation(this, () => {
        this._consumeIntegrityMutations()
        const alreadyClean = repairNativeDom && this._integrityClean && !!getLogicalLineAccess(this.scrollBlot)
        const reusable = repairNativeDom && !alreadyClean
          ? this._lineIntegrity.inspect(this.scrollBlot, this.container) : undefined
        this._patchCanonicalLinesByBlot(newLines, newFPs, reusable)
        if (repairNativeDom && !alreadyClean) {
          let repairedOwned = this._lineIntegrity.repair(this.scrollBlot, this.container)
          // Unknown native nodes may have prevented the earlier index rebuild;
          // revalidate the complete canonical topology after removing them.
          if (this._integrityObserver && !getLogicalLineAccess(this.scrollBlot)) {
            this.scrollBlot.restoreCanonicalDomOrder()
            // Canonical restoration can replace Blot members; rebuild ownership
            // instead of retaining the map captured before that restoration.
            repairedOwned = undefined
          }
          // Only the complete inspection/repair can establish this baseline.
          // The outer float-layout sync runs afterwards and remains observable.
          this._integrityObserver?.takeRecords()
          this._integrityClean = !!this._integrityObserver && !!getLogicalLineAccess(this.scrollBlot)
          if (this._integrityClean) {
            this._lineIntegrity.captureBaseline(this.scrollBlot, this.container, repairedOwned)
            // Observe only once there is a verified snapshot to protect, avoiding
            // a second set of mutation records during the initial full mount.
            this._integrityObserver!.observe(this.container, {
              subtree: true, childList: true, characterData: true, characterDataOldValue: true, attributes: true,
            })
          } else {
            this._lineIntegrity.invalidateBaseline()
          }
        }
      })
    } catch (error) {
      this._integrityClean = false
      this._lineIntegrity.invalidateBaseline()
      throw error
    } finally {
      // A fast patch or the outer layout sync may have changed DOM after the
      // snapshot was checked; do not treat those writes as a fresh full repair.
      this._consumeIntegrityMutations()
    }
  }

  private _consumeIntegrityMutations(): void {
    const records = this._integrityObserver?.takeRecords()
    if (records) this._recordIntegrityMutations(records)
  }

  private _recordIntegrityMutations(records: readonly MutationRecord[]): void {
    if (!records.length) return
    this._integrityClean = false
    this._lineIntegrity.recordMutations(records)
  }

  private _patchCanonicalLinesByBlot(
    newLines: TokenLine[],
    newFPs: string[],
    reusable?: (blots: readonly (TextBlot | EmbedBlot)[]) => boolean,
  ) {
    // A trusted source projection avoids regrouping leaves; native recovery still
    // checks actual row structure and attributes through the supplied predicate.
    const indexed = getLogicalLineAccess(this.scrollBlot)
    const sourceLines = indexed?.sourceLines()
    const blotLines = sourceLines ? undefined : this._groupBlotsByLine()
    const oldFPs = this._lineFPs
    // A trailing LF has a Break-only source row, but no corresponding token row.
    const blotLen = sourceLines
      ? sourceLines.length - (sourceLines.at(-1)?.leaves.length === 0 ? 1 : 0)
      : blotLines!.length
    const newLen = newLines.length
    const oldLen = oldFPs.length
    const lineText = (index: number) => sourceLines
      ? sourceLines[index].text : this._blotLineText(blotLines![index])

    // Front trim
    const prefixMax = Math.min(blotLen, newLen, oldLen)
    let prefix = 0
    while (prefix < prefixMax) {
      if (oldFPs[prefix] !== newFPs[prefix]) break
      if (reusable && !reusable(sourceLines?.[prefix].leaves ?? blotLines![prefix])) break
      if (lineText(prefix) !== newLines[prefix].text) break
      prefix++
    }

    // Back trim
    const suffixMax = Math.min(blotLen, newLen, oldLen) - prefix
    let suffix = 0
    while (suffix < suffixMax) {
      const bi = blotLen - 1 - suffix
      const ni = newLen - 1 - suffix
      const oi = oldLen - 1 - suffix
      if (oldFPs[oi] !== newFPs[ni]) break
      if (reusable && !reusable(sourceLines?.[bi].leaves ?? blotLines![bi])) break
      if (lineText(bi) !== newLines[ni].text) break
      suffix++
    }

    if (prefix + suffix >= blotLen && prefix + suffix >= newLen) return

    // Resolve the changed range without materializing the flat leaf index.
    let startLeafIdx = 0
    let deleteCount = 0
    if (sourceLines?.length) {
      const leafStart = (index: number) => {
        const line = sourceLines[Math.min(index, sourceLines.length - 1)]
        return indexed!.locate(line)!.leafStart +
          (index === sourceLines.length ? line.leaves.length : 0)
      }
      startLeafIdx = leafStart(prefix)
      deleteCount = leafStart(blotLen - suffix) - startLeafIdx
    } else {
      for (let i = 0; i < prefix; i++) startLeafIdx += blotLines![i].length
      for (let i = prefix; i < blotLen - suffix; i++) deleteCount += blotLines![i].length
    }

    // Create new blots from the changed token lines
    const newBlots: (TextBlot | EmbedBlot)[] = []
    for (let i = prefix; i < newLen - suffix; i++) {
      for (const d of newLines[i].deltas) {
        newBlots.push(this.scrollBlot.createLeafBlot(d))
      }
    }

    this.scrollBlot.spliceLeaves(startLeafIdx, deleteCount, newBlots)
  }

  private _groupBlotsByLine(): (TextBlot | EmbedBlot)[][] {
    const lines: (TextBlot | EmbedBlot)[][] = []
    let cur: (TextBlot | EmbedBlot)[] = []

    for (const leaf of this.scrollBlot.leaves) {
      cur.push(leaf)
      if (this._options.withLineBreak !== false && leaf instanceof TextBlot && leaf.text.endsWith(STR_LINE_BREAK)) {
        lines.push(cur)
        cur = []
      }
    }
    if (cur.length) lines.push(cur)
    return lines
  }

  private _blotLineText(blots: (TextBlot | EmbedBlot)[]): string {
    let s = ''
    for (const b of blots) {
      if (b instanceof TextBlot) s += b.text
    }
    return s
  }
}
