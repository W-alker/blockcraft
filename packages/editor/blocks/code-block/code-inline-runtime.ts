import {InlineRuntime} from "../../framework/block-std/inline/runtime/inline-runtime";
import {EmbedConverterMap} from "../../framework/block-std/inline/blot/scroll-blot";
import {DeltaInsertText, DeltaOperation, InlineModel} from "../../framework/block-std/types";
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

const flatShikiTokens = (lines: ThemedToken[][], withLineBreak = true): DeltaInsertText[] => {
  const res: DeltaInsertText[] = []
  for (let i = 0; i < lines.length; i++) {
    for (const token of lines[i]) {
      if (!token.content) continue
      res.push({
        insert: token.content,
        attributes: token.color ? {'s:color': token.color} : undefined
      })
    }
    if (i < lines.length - 1) {
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
    fp += d.insert + '\0' + (d.attributes?.['s:color'] || '') + '\0'
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

  private async _tokenize(text: string): Promise<DeltaInsertText[]> {
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

    return flatShikiTokens(tokenLines, this._options.withLineBreak)
  }

  /**
   * Shiki tokenize -> line-level diff -> blot tree patch.
   */
  async diffHighLight(_ops: DeltaOperation[], opts?: {
    block: { id: string, textContent: () => string, setInlineRange: (idx: number) => void },
    selectionValue: { from: { blockId: string, type: string, index?: number } } | null,
    normalizeRange: (range: Range) => { from: { type: string, index?: number } }
  }) {
    let pos = 0
    let isHere = false

    if (opts) {
      isHere = opts.selectionValue?.from.blockId === opts.block.id
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

    try {
      const text = opts?.block.textContent() ?? this._getPlainText()
      const newDeltas = await this._tokenize(text)
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

  async renderCode(getText?: () => string) {
    try {
      const text = getText?.() ?? this._getPlainText()

      // Capture cursor position before async tokenization
      const sel = document.getSelection()
      const isHere = !!(sel?.rangeCount && this.container.contains(sel.focusNode))
      let cursorPos = 0
      if (isHere) {
        try {
          cursorPos = this.mapper.domPointToModelPoint(this.container, sel!.focusNode!, sel!.focusOffset)
        } catch { /* cursor capture failed, will skip restore */ }
      }

      const deltas = await this._tokenize(text)
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
