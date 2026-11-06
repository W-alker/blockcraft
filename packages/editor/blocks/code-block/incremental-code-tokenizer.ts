import type {BundledLanguage, BundledTheme, GrammarState, Highlighter, ThemedToken} from 'shiki'

type TokenizerHighlighter = Pick<Highlighter, 'codeToTokensBase' | 'getLastGrammarState'>

interface TokenizerOptions {
  lang: string
  theme: string
}

interface TokenizedLine {
  text: string
  tokens: ThemedToken[]
  /**
   * Grammar state after this logical line, including its end-of-line transition.
   * Cold caches store checkpoints; editing fills the intervening line states.
   */
  state?: GrammarState
}

const PLAIN_LANGUAGES = new Set(['text', 'txt', 'plain', 'plaintext'])
const INITIAL_CHECKPOINT_LINES = 64

/**
 * Package-internal logical-line cache for the code renderer.
 *
 * Token offsets are relative to their line, unlike full-document Shiki offsets.
 * The renderer consumes only content/color; retaining line-local offsets lets
 * an inserted line reuse every unaffected suffix token without cloning it.
 * The returned arrays are cache-owned and must not be mutated by callers.
 *
 * Initial tokenization batches 64 logical lines to avoid paying Shiki's setup
 * cost once per line. A later edit refines only the enclosing checkpoint range
 * into per-line states, so subsequent nearby edits retain the one-line fast path.
 */
export class IncrementalCodeTokenizer {
  private _lines: TokenizedLine[] = []
  private _tokens: ThemedToken[][] = []
  private _text: string | undefined
  private _lang: string | undefined
  private _theme: string | undefined
  private _highlighter: TokenizerHighlighter | undefined

  clear(): void {
    this._lines = []
    this._tokens = []
    this._text = undefined
    this._lang = undefined
    this._theme = undefined
    this._highlighter = undefined
  }

  tokenize(
    text: string,
    options: TokenizerOptions,
    highlighter?: TokenizerHighlighter,
  ): ThemedToken[][] {
    const plain = PLAIN_LANGUAGES.has(options.lang)
    if (!plain && !highlighter) {
      throw new Error('Syntax tokenization requires a loaded highlighter')
    }
    if (
      this._lang !== options.lang ||
      this._theme !== options.theme ||
      this._highlighter !== highlighter
    ) {
      this.clear()
      this._lang = options.lang
      this._theme = options.theme
      this._highlighter = highlighter
    }
    if (this._text === text) return this._tokens

    // ANSI has a separate state machine and no TextMate GrammarState. Keep its
    // whole-source semantics if an internal caller supplies this special lang.
    if (options.lang === 'ansi') {
      const tokens = highlighter!.codeToTokensBase(text, {lang: 'ansi', theme: options.theme as BundledTheme})
      this._text = text
      this._tokens = tokens
      return tokens
    }

    // Match Shiki's splitLines exactly: CRLF/LF delimit lines; a bare CR is text.
    const sourceLines = text.split(/\r?\n/)
    const oldLines = this._lines
    if (!plain && !oldLines.length) {
      return this._publish(text, this._tokenizeInitialLines(sourceLines, options, highlighter!))
    }
    let prefix = 0
    while (
      prefix < sourceLines.length && prefix < oldLines.length &&
      sourceLines[prefix] === oldLines[prefix].text
    ) prefix++

    // A CRLF/LF-only change has identical token content and grammar states.
    // The projection owns the source separators independently of this cache.
    if (prefix === sourceLines.length && prefix === oldLines.length) {
      this._text = text
      return this._tokens
    }

    let suffix = 0
    const suffixLimit = Math.min(sourceLines.length, oldLines.length) - prefix
    while (
      suffix < suffixLimit &&
      sourceLines[sourceLines.length - 1 - suffix] === oldLines[oldLines.length - 1 - suffix].text
    ) suffix++

    const unchangedPrefix = prefix
    // Missing state means an unrefined cold-cache line, never the start of the
    // language. Resume only after a real checkpoint (or at document offset 0).
    if (!plain) {
      while (prefix > 0 && !oldLines[prefix - 1].state) prefix--
    }
    const lines = oldLines.slice(0, prefix)
    let state = lines.at(-1)?.state
    const suffixStart = sourceLines.length - suffix
    for (let index = prefix; index < sourceLines.length; index++) {
      const oldIndex = oldLines.length - (sourceLines.length - index)
      if (
        index >= suffixStart &&
        (plain || sameGrammarState(state, oldLines[oldIndex - 1]?.state))
      ) {
        for (let reuse = oldIndex; reuse < oldLines.length; reuse++) lines.push(oldLines[reuse])
        break
      }

      const line = sourceLines[index]
      if (plain) {
        // Shiki plaintext tokens have no color; its separate result.fg is not
        // consumed by the code renderer. Do not load an engine/theme for text.
        lines.push({text: line, tokens: [{content: line, offset: 0}]})
        continue
      }

      const tokens = highlighter!.codeToTokensBase(line, {
        lang: options.lang as BundledLanguage,
        theme: options.theme as BundledTheme,
        grammarState: state,
      })
      state = highlighter!.getLastGrammarState(tokens)
      const previous = index < unchangedPrefix
        ? oldLines[index]
        : index >= suffixStart ? oldLines[oldIndex] : undefined
      // Refining checkpoint state should not invalidate the projection cache
      // for neighboring lines whose actual presentation did not change.
      const reusable = previous && sameTokenPresentation(previous.tokens, tokens[0])
      lines.push({text: line, tokens: reusable ? previous.tokens : tokens[0], state})
    }

    return this._publish(text, lines)
  }

  private _tokenizeInitialLines(
    sourceLines: string[],
    options: TokenizerOptions,
    highlighter: TokenizerHighlighter,
  ): TokenizedLine[] {
    const lines: TokenizedLine[] = []
    let state: GrammarState | undefined
    for (let start = 0; start < sourceLines.length; start += INITIAL_CHECKPOINT_LINES) {
      const end = Math.min(sourceLines.length, start + INITIAL_CHECKPOINT_LINES)
      const tokens = highlighter.codeToTokensBase(sourceLines.slice(start, end).join('\n'), {
        lang: options.lang as BundledLanguage,
        theme: options.theme as BundledTheme,
        grammarState: state,
      })
      state = highlighter.getLastGrammarState(tokens)
      let lineOffset = 0
      for (let index = start; index < end; index++) {
        const lineTokens = tokens[index - start]
        // These freshly created tokens are exclusively owned by this cache.
        // Normalize their chunk-local offsets without allocating another copy.
        if (lineOffset) {
          for (const token of lineTokens) token.offset -= lineOffset
        }
        lines.push({
          text: sourceLines[index],
          tokens: lineTokens,
          state: index === end - 1 ? state : undefined,
        })
        lineOffset += sourceLines[index].length + 1
      }
    }
    return lines
  }

  private _publish(text: string, lines: TokenizedLine[]): ThemedToken[][] {
    // Publish only after successful tokenization. A thrown grammar error cannot
    // leave a partially updated line cache for the next render request.
    this._lines = lines
    this._tokens = lines.map(line => line.tokens)
    this._text = text
    return this._tokens
  }
}

function sameTokenPresentation(left: ThemedToken[], right: ThemedToken[]): boolean {
  return left.length === right.length && left.every((token, index) => {
    const other = right[index]
    return token.content === other.content && token.offset === other.offset &&
      token.color === other.color && token.fontStyle === other.fontStyle
  })
}

function sameGrammarState(left?: GrammarState, right?: GrammarState): boolean {
  if (!left || !right) return false
  if (left === right) return true
  if (left.lang !== right.lang || left.theme !== right.theme) return false
  // Shiki exposes the TextMate stack through this typed internal seam. Scope
  // names alone are insufficient: dynamic end patterns (e.g. heredocs) matter.
  const leftStack = left.getInternalStack()
  const rightStack = right.getInternalStack()
  return !!leftStack && !!rightStack && leftStack.equals(rightStack)
}
