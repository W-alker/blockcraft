import type {ThemedToken} from 'shiki'
import type {DeltaInsertText} from '../../framework/model/delta'
import {deltaFingerprint} from './color-merge'

/** Package-internal rendered logical line; callers must not mutate cached values. */
export interface CodeTokenLine {
  deltas: DeltaInsertText[]
  fp: string
  text: string
}

interface CodeTokenProjectionResult {
  deltas: DeltaInsertText[]
  /** Mermaid retains its existing whole-surface diff when logical lines are disabled. */
  lines: CodeTokenLine[] | undefined
}

/**
 * Projects stable token-line identities into stable Delta/line identities.
 * Syntax tokenization and projection have separate caches because text revisions
 * and user presentation attributes are applied after this syntax-only projection.
 */
export class CodeTokenProjection {
  private _cache = new WeakMap<ThemedToken[], Map<string, CodeTokenLine>>()
  private _lastTokens: ThemedToken[][] | undefined
  private _lastText: string | undefined
  private _lastWithLineBreak: boolean | undefined
  private _lastResult: CodeTokenProjectionResult | undefined

  clear(): void {
    this._cache = new WeakMap()
    this._lastTokens = undefined
    this._lastText = undefined
    this._lastWithLineBreak = undefined
    this._lastResult = undefined
  }

  project(
    tokenLines: ThemedToken[][],
    originalText: string,
    withLineBreak = true,
  ): CodeTokenProjectionResult {
    if (
      tokenLines === this._lastTokens &&
      originalText === this._lastText &&
      withLineBreak === this._lastWithLineBreak
    ) return this._lastResult!

    // Match Shiki's line splitting. Bare CR remains inside token content.
    const endings = originalText.match(/\r?\n/g) ?? []
    const deltas: DeltaInsertText[] = []
    const lines: CodeTokenLine[] | undefined = withLineBreak ? [] : undefined
    for (let index = 0; index < tokenLines.length; index++) {
      // flatShikiTokens emits LF between every pair of token lines even when
      // its source has fewer separators (e.g. a fallback highlighter result).
      const ending = index < tokenLines.length - 1
        ? endings[index] === '\r\n' ? '\r\n' : '\n'
        : ''
      const line = this._projectLine(tokenLines[index], ending, withLineBreak)
      for (const delta of line.deltas) deltas.push(delta)
      // The trailing empty Shiki line has no model content and no Blot line.
      if (line.deltas.length) lines?.push(line)
    }
    const result = {deltas, lines}
    this._lastTokens = tokenLines
    this._lastText = originalText
    this._lastWithLineBreak = withLineBreak
    this._lastResult = result
    return result
  }

  private _projectLine(
    tokens: ThemedToken[],
    ending: string,
    withLineBreak: boolean,
  ): CodeTokenLine {
    let variants = this._cache.get(tokens)
    if (!variants) {
      variants = new Map()
      this._cache.set(tokens, variants)
    }
    const key = `${withLineBreak ? 'lines' : 'plain'}${ending}`
    const cached = variants.get(key)
    if (cached) return cached

    const deltas: DeltaInsertText[] = []
    let text = ''
    let fp = ''
    const append = (delta: DeltaInsertText) => {
      deltas.push(delta)
      text += delta.insert
      if (withLineBreak) fp += deltaFingerprint(delta)
    }
    for (const token of tokens) {
      if (!token.content) continue
      append({
        insert: token.content,
        attributes: token.color ? {'s:color': token.color} : undefined,
      })
    }
    if (ending === '\r\n') append({insert: '\r'})
    if (ending) append({insert: '\n'})
    const line = {deltas, fp, text}
    variants.set(key, line)
    return line
  }
}
