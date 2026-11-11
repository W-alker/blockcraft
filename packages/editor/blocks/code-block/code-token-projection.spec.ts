import type {ThemedToken} from 'shiki'
import type {DeltaInsertText} from '../../framework/model/delta'
import {deltaFingerprint} from './color-merge'
import {CodeTokenProjection} from './code-token-projection'

describe('CodeTokenProjection', () => {
  const token = (content: string, color?: string, offset = 0): ThemedToken => ({content, color, offset})

  // Reference the existing flat projection contract without importing a runtime
  // (and therefore the editor's Angular/DOM dependencies) into this pure suite.
  const referenceProjection = (lines: ThemedToken[][], text: string) => {
    const endings = text.match(/\r?\n/g) ?? []
    const deltas: DeltaInsertText[] = []
    for (let index = 0; index < lines.length; index++) {
      for (const part of lines[index]) {
        if (part.content) deltas.push({
          insert: part.content,
          attributes: part.color ? {'s:color': part.color} : undefined,
        })
      }
      if (index < lines.length - 1) {
        if (endings[index] === '\r\n') deltas.push({insert: '\r'})
        deltas.push({insert: '\n'})
      }
    }
    return deltas
  }

  it('preserves text, token colors and line-break deltas for LF, CRLF and bare CR', () => {
    const projection = new CodeTokenProjection()
    const tokens = [[token('const ', '#ff0000'), token('a\rb', '#222222')], [], [token('last')]]
    const text = 'const a\rb\r\n\nlast'
    const result = projection.project(tokens, text)
    expect(result.deltas).toEqual(referenceProjection(tokens, text))
    expect(result.deltas.map(delta => delta.insert).join('')).toBe(text)
    expect(result.lines?.map(line => line.text)).toEqual(['const a\rb\r\n', '\n', 'last'])
    expect(result.lines?.map(line => line.fp))
      .toEqual(result.lines?.map(line => line.deltas.map(deltaFingerprint).join('')))
    expect(tokens[0][1].content).toBe('a\rb')
    expect(tokens[0][1].offset).toBe(0)
  })

  it('reuses unaffected line and delta identities after a local line edit', () => {
    const projection = new CodeTokenProjection()
    const first = [token('first', '#111111')]
    const middle = [token('middle', '#222222')]
    const last = [token('last', '#333333')]
    const before = projection.project([first, middle, last], 'first\nmiddle\nlast')
    const changed = [token('updated', '#444444')]
    const after = projection.project([first, changed, last], 'first\nupdated\nlast')
    expect(after.lines?.[0]).toBe(before.lines?.[0])
    expect(after.lines?.[1]).not.toBe(before.lines?.[1])
    expect(after.lines?.[2]).toBe(before.lines?.[2])
    expect(after.deltas[0]).toBe(before.deltas[0])
    expect(after.deltas.at(-1)).toBe(before.deltas.at(-1))
  })

  it('reuses an identical complete projection and clears it at lifecycle boundaries', () => {
    const projection = new CodeTokenProjection()
    const tokens = [[token('a')], [token('b')]]
    const first = projection.project(tokens, 'a\nb')
    expect(projection.project(tokens, 'a\nb')).toBe(first)
    projection.clear()
    const second = projection.project(tokens, 'a\nb')
    expect(second).not.toBe(first)
    expect(second.lines?.[0]).not.toBe(first.lines?.[0])
    expect(second.deltas).toEqual(first.deltas)
  })

  it('invalidates only line endings that changed while keeping token identity stable', () => {
    const projection = new CodeTokenProjection()
    const first = [token('a')]
    const second = [token('b')]
    const tokens = [first, second]
    const lf = projection.project(tokens, 'a\nb')
    const crlf = projection.project(tokens, 'a\r\nb')
    expect(crlf.lines?.[0]).not.toBe(lf.lines?.[0])
    expect(crlf.lines?.[1]).toBe(lf.lines?.[1])
    expect(crlf.deltas.map(delta => delta.insert).join('')).toBe('a\r\nb')
    const extended = projection.project([first, second, []], 'a\r\nb\n')
    expect(extended.lines?.[0]).toBe(crlf.lines?.[0])
    expect(extended.lines?.[1]).not.toBe(crlf.lines?.[1])
    expect(extended.lines?.[1].text).toBe('b\n')
  })

  it('does not add an extra line for a trailing empty token line or empty document', () => {
    const projection = new CodeTokenProjection()
    for (const tokens of [[[]], [[token('')]]]) {
      const result = projection.project(tokens, '')
      expect(result.deltas).toEqual([])
      expect(result.lines).toEqual([])
    }
    const trailing = projection.project([[token('a')], [], []], 'a\n\n')
    expect(trailing.lines?.map(line => line.text)).toEqual(['a\n', '\n'])
    expect(trailing.deltas).toEqual(referenceProjection([[token('a')], [], []], 'a\n\n'))
  })

  it('uses plain LF deltas in both modes and omits pregrouped Mermaid lines', () => {
    const projection = new CodeTokenProjection()
    const tokens = [[token('a')], [token('b')]]
    const marked = projection.project(tokens, 'a\r\nb')
    const unmarked = projection.project(tokens, 'a\r\nb', false)
    expect(unmarked.lines).toBeUndefined()
    expect(unmarked.deltas).toEqual(referenceProjection(tokens, 'a\r\nb'))
    expect(marked.deltas.some(delta => delta.attributes?.['d:lineBreak'])).toBeFalse()
    expect(unmarked.deltas.some(delta => delta.attributes?.['d:lineBreak'])).toBeFalse()
    expect(projection.project(tokens, 'a\r\nb').lines?.[0]).toBe(marked.lines?.[0])
  })
})
