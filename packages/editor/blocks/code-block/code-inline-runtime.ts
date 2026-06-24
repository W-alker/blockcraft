import {InlineRuntime} from "../../framework/block-std/inline/runtime/inline-runtime";
import {EmbedConverterMap} from "../../framework/block-std/inline/blot/scroll-blot";
import {DeltaInsert, DeltaInsertText, DeltaOperation, InlineModel} from "../../framework/block-std/types";
import {mergeColorOverShiki, deltaFingerprint} from "./color-merge";
import {STR_LINE_BREAK} from "../../framework/block-std/inline/const";
import {shikiService} from "./shiki-config";
import type {BundledLanguage, ThemedToken} from 'shiki'
import {TextBlot} from "../../framework/block-std/inline/blot/text-blot";
import {EmbedBlot} from "../../framework/block-std/inline/blot/embed-blot";

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

const getOriginalLineBreaks = (text: string): string[] => text.match(/\r\n|\r|\n/g) || []

export const flatShikiTokens = (
  lines: ThemedToken[][],
  originalText: string,
  withLineBreak = true
): DeltaInsertText[] => {
  const res: DeltaInsertText[] = []
  const originalLineBreaks = getOriginalLineBreaks(originalText)

  for (let i = 0; i < lines.length; i++) {
    for (const token of lines[i]) {
      if (!token.content) continue
      res.push({
        insert: token.content,
        attributes: token.color ? {'s:color': token.color} : undefined
      })
    }
    if (i < lines.length - 1) {
      if (originalLineBreaks[i] === '\r\n') {
        res.push({insert: '\r'})
      }
      res.push({
        insert: STR_LINE_BREAK,
        attributes: withLineBreak ? {'d:lineBreak': true} : undefined
      })
    }
  }
  return res
}

// ─── Line-level diff ───

interface TokenLine {
  deltas: DeltaInsertText[]
  fp: string
}

function groupTokenLines(deltas: DeltaInsertText[]): TokenLine[] {
  const lines: TokenLine[] = []
  let cur: DeltaInsertText[] = []
  let fp = ''

  for (const d of deltas) {
    cur.push(d)
    fp += deltaFingerprint(d)
    if (d.insert === STR_LINE_BREAK && d.attributes?.['d:lineBreak']) {
      lines.push({deltas: cur, fp})
      cur = []
      fp = ''
    }
  }
  if (cur.length) lines.push({deltas: cur, fp})
  return lines
}

function tokenLineText(line: TokenLine): string {
  let s = ''
  for (const d of line.deltas) s += d.insert
  return s
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
}

/**
 * CodeInlineRuntime extends InlineRuntime with Shiki-based syntax highlighting.
 *
 * Line-level diff strategy:
 * 1. Shiki tokenize full text -> group by line + compute fingerprints
 * 2. Compare fingerprints (from Shiki tokens, not DOM) to find changed lines
 * 3. Splice changed lines in the blot tree (not direct DOM manipulation)
 *
 * Key: fingerprint comparison never reads DOM (avoids hex->rgb conversion mismatch).
 */
export class CodeInlineRuntime extends InlineRuntime {

  private _lineFPs: string[] = []
  private _options: IRenderOptions
  /**
   * 高亮代际令牌。renderCode（全量）和 diffHighLight（增量）都 await 异步
   * tokenize，期间文本可能又变了。两者共享此令牌：开始时 ++ 抢占，await 后
   * 若令牌已被更新的高亮请求改掉，则放弃写回——否则陈旧 token 会覆盖更新的
   * blot 树，且把 _lineFPs 基线设成陈旧指纹，导致后续增量 diff 持续错位。
   *
   * 配套的 `!this.container.isConnected` 守卫拦的是「块在 tokenize 期间被删除」。
   * 注意：当前虚拟化是 CD-detach（容器仍在 DOM、isConnected 为 true），不会误杀；
   * 若将来虚拟化改为把 hostElement 移出 DOM，此守卫需要换成 _isGone 式判断。
   */
  private _renderToken = 0

  constructor(
    container: HTMLElement,
    embedConverters: EmbedConverterMap,
    options: IRenderOptions = {lang: 'text'}
  ) {
    super(container, embedConverters)
    this._options = options
  }

  setLang(lang: string) {
    this._options.lang = lang
    this._lineFPs = []
  }

  setTheme(theme: string) {
    this._options.theme = theme
    this._lineFPs = []
  }

  /**
   * Override: incremental delta patch, then schedule async highlight.
   */
  override applyDelta(ops: DeltaOperation[]) {
    super.applyDelta(ops)
    // Highlighting is triggered externally via diffHighLight() with debounce
  }

  private _getShikiLanguage(): BundledLanguage {
    const lang = this._options.lang || 'text'
    if (!lang || lang === 'text') return 'text' as BundledLanguage
    return lang as BundledLanguage
  }

  private async _tokenize(text: string, modelDeltas: DeltaInsert[] = []): Promise<DeltaInsertText[]> {
    const highlighter = await shikiService.getHighlighter()
    const lang = this._getShikiLanguage()
    await shikiService.ensureLanguageLoaded(lang)
    const baseTokens = highlighter.codeToTokens(text, {
      lang, theme: this._options.theme || 'github-light',
    })

    let tokenLines = baseTokens.tokens

    if (isMermaidLang(lang) && !hasMultipleTokenColors(tokenLines)) {
      const wrappedText = wrapMermaidForShiki(text)
      const wrappedTokens = highlighter.codeToTokens(wrappedText, {
        lang, theme: this._options.theme || 'github-light',
      })
      const strippedLines = stripMermaidFenceLines(wrappedTokens.tokens)
      if (hasMultipleTokenColors(strippedLines)) {
        tokenLines = strippedLines
      }
    }

    const shikiDeltas = flatShikiTokens(tokenLines, text, this._options.withLineBreak)
    return modelDeltas.length ? mergeColorOverShiki(shikiDeltas, modelDeltas) : shikiDeltas
  }

  /**
   * Shiki tokenize -> line-level diff -> blot tree patch.
   */
  async diffHighLight(_ops: DeltaOperation[], opts?: {
    block: { id: string, textContent: () => string, setInlineRange: (idx: number) => void, textDeltas?: () => DeltaInsert[] },
    selectionValue: { start: { blockId: string, type: string, offset?: number } } | null,
    normalizeRange: (range: Range) => { from: { type: string, index?: number } }
  }) {
    let pos = 0
    let isHere = false

    if (opts) {
      isHere = opts.selectionValue?.start.blockId === opts.block.id
      if (isHere) {
        const sel = document.getSelection()
        if (sel?.rangeCount) {
          const range = sel.getRangeAt(0)
          try {
            const nr = opts.normalizeRange(range)
            pos = nr?.from.type === 'text' ? nr.from.index ?? 0 : 0
          } catch {
            pos = 0
          }
        }
      }
    }

    const myToken = ++this._renderToken
    try {
      const text = opts?.block.textContent() ?? this._getPlainText()
      const modelDeltas = opts?.block.textDeltas?.() ?? []
      const newDeltas = await this._tokenize(text, modelDeltas)
      // 陈旧/已卸载守卫：更新的高亮请求已抢占，或块在 tokenize 期间被移除
      if (myToken !== this._renderToken || !this.container.isConnected) return
      const newLines = groupTokenLines(newDeltas)
      const newFPs = newLines.map(l => l.fp)

      if (arraysEqual(this._lineFPs, newFPs)) return

      if (!this._lineFPs.length) {
        this.scrollBlot.build(newDeltas)
      } else {
        this._patchLinesByBlot(newLines, newFPs)
      }

      this._lineFPs = newFPs

      if (isHere && opts) {
        opts.block.setInlineRange(pos)
      }
    } catch (error) {
      console.error('[CodeInlineRuntime] highlight failed:', error)
      this._lineFPs = []
      this._renderPlainText()
    }
  }

  async renderCode(getText?: () => string, getModelDeltas?: () => DeltaInsert[]) {
    const myToken = ++this._renderToken
    try {
      const text = getText?.() ?? this._getPlainText()
      const modelDeltas = getModelDeltas?.() ?? []
      const deltas = await this._tokenize(text, modelDeltas)

      // 陈旧/已卸载守卫：更新的 renderCode/diffHighLight 已抢占令牌，或块在
      // tokenize 期间被移除。继续 build 会用旧文本覆盖更新的树、污染 _lineFPs。
      if (myToken !== this._renderToken || !this.container.isConnected) return

      // Capture cursor AFTER async tokenization, right before rebuild.
      // This ensures we capture the position set by any intervening operations
      // (e.g. undo replay that runs during the await).
      const sel = document.getSelection()
      const isHere = !!(sel?.rangeCount && this.container.contains(sel.focusNode))
      let cursorPos = 0
      if (isHere) {
        try {
          cursorPos = this.mapper.domPointToModelPoint(this.container, sel!.focusNode!, sel!.focusOffset)
        } catch { /* cursor capture failed, will skip restore */ }
      }

      this.scrollBlot.build(deltas)
      const lines = groupTokenLines(deltas)
      this._lineFPs = lines.map(l => l.fp)

      // Restore cursor after rebuild
      if (isHere) {
        try {
          const pt = this.mapper.modelPointToDomPoint(this.container, cursorPos)
          sel!.setPosition(pt.node as Node, pt.offset)
        } catch { /* restore failed, cursor may have moved */ }
      }
    } catch (error) {
      console.error('[CodeInlineRuntime] render failed:', error)
      this._lineFPs = []
      this._renderPlainText()
    }
  }

  // ─── Internal ───

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
        deltas.push({insert: STR_LINE_BREAK, attributes: {'d:lineBreak': true}})
        start = idx + 1
      }
      if (start < text.length) deltas.push({insert: text.slice(start)})
    } else {
      if (text) deltas.push({insert: text})
    }
    this.scrollBlot.build(deltas)
    const lines = groupTokenLines(deltas)
    this._lineFPs = lines.map(l => l.fp)
  }

  /**
   * Line-level blot tree patch.
   * Groups current blot tree leaves by lineBreak, compares with new token lines,
   * and replaces only the changed lines.
   */
  private _patchLinesByBlot(newLines: TokenLine[], newFPs: string[]) {
    const blotLines = this._groupBlotsByLine()
    const oldFPs = this._lineFPs
    const blotLen = blotLines.length
    const newLen = newLines.length
    const oldLen = oldFPs.length

    // Front trim
    const prefixMax = Math.min(blotLen, newLen, oldLen)
    let prefix = 0
    while (prefix < prefixMax) {
      if (oldFPs[prefix] !== newFPs[prefix]) break
      if (this._blotLineText(blotLines[prefix]) !== tokenLineText(newLines[prefix])) break
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
      if (this._blotLineText(blotLines[bi]) !== tokenLineText(newLines[ni])) break
      suffix++
    }

    if (prefix + suffix >= blotLen && prefix + suffix >= newLen) return

    // Find the leaf indices in the flat leaves array
    const flatLeaves = this.scrollBlot.leaves
    let startLeafIdx = 0
    for (let i = 0; i < prefix; i++) {
      startLeafIdx += blotLines[i].length
    }
    let deleteCount = 0
    for (let i = prefix; i < blotLen - suffix; i++) {
      deleteCount += blotLines[i].length
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
      if (leaf instanceof TextBlot && leaf.text === STR_LINE_BREAK && leaf.attrs?.['d:lineBreak']) {
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
