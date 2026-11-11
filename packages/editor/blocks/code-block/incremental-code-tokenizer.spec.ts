import {createHighlighter, type BundledLanguage, type BundledTheme, type Highlighter, type ThemedToken} from 'shiki'
import {IncrementalCodeTokenizer} from './incremental-code-tokenizer'

describe('IncrementalCodeTokenizer', () => {
  let highlighter: Highlighter
  const options = {lang: 'typescript', theme: 'github-light'}

  beforeAll(async () => {
    highlighter = await createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: ['typescript', 'javascript', 'html', 'bash'],
    })
  })

  afterAll(() => highlighter.dispose())

  // Global offsets intentionally belong to the renderer's model index. The
  // segmented cache keeps each token offset relative to its own logical line.
  const presentation = (lines: ThemedToken[][]) => lines.map(line => line.map(token => ({
    content: token.content,
    color: token.color,
    fontStyle: token.fontStyle,
  })))

  const expectFullHighlight = (
    tokenizer: IncrementalCodeTokenizer,
    text: string,
    renderOptions = options,
  ) => {
    const actual = tokenizer.tokenize(text, renderOptions, highlighter)
    const expected = highlighter.codeToTokensBase(text, {
      lang: renderOptions.lang as BundledLanguage,
      theme: renderOptions.theme as BundledTheme,
    })
    expect(presentation(actual)).withContext(text).toEqual(presentation(expected))
    return actual
  }

  it('matches full highlighting across multiline comments, templates and line edits', () => {
    const tokenizer = new IncrementalCodeTokenizer()
    const sources = [
      'const a = 1;\n/* comment\ncontinued */\nconst t = `hello\n${a}`;\nreturn a;',
      'const a = 2;\n/* comment\ncontinued */\nconst t = `hello\n${a}`;\nreturn a;',
      'const a = 2;\n// comment\ncontinued */\nconst t = `hello\n${a}`;\nreturn a;',
      'const a = 2;\n// comment\nconst t = `hello\n${a}`;\nreturn a;',
      'const a = 2;\n// comment\nconst t = `hello\nworld\n${a}`;\nreturn a;',
      'const a = 2;\n// comment\nconst t = "hello";\nworld\n${a}`;\nreturn a;',
      '',
    ]
    for (const text of sources) expectFullHighlight(tokenizer, text)
  })

  it('batches cold checkpoints, refines only the edited checkpoint, then tokenizes one line', () => {
    const tokenizer = new IncrementalCodeTokenizer()
    const source = Array.from({length: 1000}, (_,i) => `const value${i} = ${i};`)
    const tokenize = spyOn(highlighter, 'codeToTokensBase').and.callThrough()
    const before = tokenizer.tokenize(source.join('\n'), options, highlighter)
    expect(tokenize.calls.count()).toBe(Math.ceil(1000 / 64))
    tokenize.calls.reset()
    source[500] = 'const changedValue = 500;'
    const after = tokenizer.tokenize(source.join('\n'), options, highlighter)
    expect(tokenize.calls.count()).toBeLessThanOrEqual(64)
    expect(after[0]).toBe(before[0])
    expect(after[499]).toBe(before[499])
    expect(after[500]).not.toBe(before[500])
    expect(after[501]).toBe(before[501])
    expect(after[999]).toBe(before[999])
    tokenize.calls.reset()
    expect(tokenizer.tokenize(source.join('\n'), options, highlighter)).toBe(after)
    expect(tokenize.calls.count()).toBe(0)
    source[500] = 'const changedAgain = 500;'
    const next = tokenizer.tokenize(source.join('\n'), options, highlighter)
    expect(tokenize.calls.count()).toBe(1)
    expect(next[499]).toBe(before[499])
    expect(next[501]).toBe(before[501])
    for (let line = 0; line < next.length; line++) {
      let offset = 0
      for (const token of next[line]) {
        expect(token.offset).toBe(offset)
        offset += token.content.length
      }
    }
  })

  it('continues from a checkpoint inside a multiline grammar and propagates to a known state', () => {
    const tokenizer = new IncrementalCodeTokenizer()
    const source = Array.from({length: 200}, (_, index) => `const value${index} = ${index};`)
    source[60] = '/* open'
    source[130] = '*/'
    const before = expectFullHighlight(tokenizer, source.join('\n'))
    source[70] = '*/ const visible = 70;'
    const changed = expectFullHighlight(tokenizer, source.join('\n'))
    expect(changed[69]).toBe(before[69])
    expect(changed[71]).not.toBe(before[71])
    expect(changed[150]).toBe(before[150])
    source[70] = 'inside comment again'
    expectFullHighlight(tokenizer, source.join('\n'))
  })

  it('retokenizes the affected suffix until a multiline grammar state converges', () => {
    const tokenizer = new IncrementalCodeTokenizer()
    const original = 'const before = 1;\n/* open\ninside\n*/\nconst after = 2;'
    const before = tokenizer.tokenize(original, options, highlighter)
    const changed = original.replace('/* open', '// open')
    const after = expectFullHighlight(tokenizer, changed)
    expect(after[0]).toBe(before[0])
    expect(after[2]).not.toBe(before[2])
    expect(after[4]).toBe(before[4])
  })

  it('preserves reusable suffix tokens after inserting and deleting logical lines', () => {
    const tokenizer = new IncrementalCodeTokenizer()
    const original = 'const a = 1;\nconst b = 2;\nconst c = 3;'
    const before = tokenizer.tokenize(original, options, highlighter)
    const inserted = expectFullHighlight(tokenizer, 'const a = 1;\n// inserted\nconst b = 2;\nconst c = 3;')
    expect(inserted[2]).toBe(before[1])
    expect(inserted[3]).toBe(before[2])
    const deleted = expectFullHighlight(tokenizer, 'const b = 2;\nconst c = 3;')
    expect(deleted[1]).toBe(before[2])
  })

  it('matches Shiki for blank lines, CRLF and bare CR without losing text', () => {
    const tokenizer = new IncrementalCodeTokenizer()
    for (const text of ['', '\n', '\n\n', '\r\nconst a = 1;\r\n', 'a\rb\r\nc\nd\r']) {
      expectFullHighlight(tokenizer, text)
    }
    const plain = new IncrementalCodeTokenizer()
    const text = '\r\na\rb\r\n\nc\r'
    const tokens = plain.tokenize(text, {lang: 'text', theme: 'github-light'})
    expect(presentation(tokens)).toEqual(presentation(
      highlighter.codeToTokensBase(text, {lang: 'text', theme: 'github-light'}),
    ))
    expect(tokens.map(line => line.map(token => token.content).join('')))
      .toEqual(['', 'a\rb', '', 'c\r'])
  })

  it('does not confuse first-line grammar rules with a cached middle-line state', () => {
    const tokenizer = new IncrementalCodeTokenizer()
    const bashOptions = {lang: 'bash', theme: 'github-light'}
    for (const source of [
      '#!/usr/bin/env bash\necho hi\n',
      'echo before\n#!/usr/bin/env bash\necho hi\n',
      '#!/usr/bin/env bash\necho hi\n',
      '\n#!/usr/bin/env bash\necho hi\n',
    ]) expectFullHighlight(tokenizer, source, bashOptions)
  })

  it('compares full grammar states for dynamic heredoc endings', () => {
    const tokenizer = new IncrementalCodeTokenizer()
    const bashOptions = {lang: 'bash', theme: 'github-light'}
    for (const source of [
      'cat <<EOF\nhello\nEOF\necho done',
      'cat <<OTHER\nhello\nEOF\necho done',
      'cat <<OTHER\nhello\nOTHER\necho done',
    ]) expectFullHighlight(tokenizer, source, bashOptions)
  })

  it('invalidates language, theme and explicit lifecycle resets', () => {
    const tokenizer = new IncrementalCodeTokenizer()
    const source = '<script>\nconst value = `a\nb`;\n</script>'
    const light = expectFullHighlight(tokenizer, source)
    const dark = expectFullHighlight(tokenizer, source, {...options, theme: 'github-dark'})
    expect(dark[0]).not.toBe(light[0])
    const html = expectFullHighlight(tokenizer, source, {lang: 'html', theme: 'github-dark'})
    expect(html[0]).not.toBe(dark[0])
    tokenizer.clear()
    const rebuilt = expectFullHighlight(tokenizer, source, {lang: 'html', theme: 'github-dark'})
    expect(rebuilt[0]).not.toBe(html[0])
  })

  it('keeps the last successful cache when a tokenization attempt throws', () => {
    const tokenizer = new IncrementalCodeTokenizer()
    const source = 'const a = 1;\nconst b = 2;'
    const before = tokenizer.tokenize(source, options, highlighter)
    const tokenize = spyOn(highlighter, 'codeToTokensBase').and.throwError('test grammar failure')
    expect(() => tokenizer.tokenize('const a = 2;\nconst b = 2;', options, highlighter)).toThrow()
    expect(tokenizer.tokenize(source, options, highlighter)).toBe(before)
    tokenize.and.callThrough()
    expectFullHighlight(tokenizer, 'const a = 2;\nconst b = 2;')
  })
})
