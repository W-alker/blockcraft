import {resolveSlashQueryRange} from './slash-query'

describe('slash query length', () => {
  it('allows seven query characters and rejects the eighth', () => {
    expect(resolveSlashQueryRange([{insert: '/abcdefg'}], 0))
      .toEqual({query: 'abcdefg', triggerLength: 8})
    expect(resolveSlashQueryRange([{insert: '/abcdefgh'}], 0)).toBeNull()
  })

  it('counts Unicode characters independently from UTF-16 model offsets', () => {
    const query = '𠮷'.repeat(7)
    expect(resolveSlashQueryRange([{insert: '/' + query}], 0))
      .toEqual({query, triggerLength: 15})
    expect(resolveSlashQueryRange([{insert: '/' + query + '中'}], 0)).toBeNull()
  })

  it('does not count the prefix or text after a token boundary', () => {
    expect(resolveSlashQueryRange([
      {insert: '正文/abc', attributes: {'a:bold': true}},
      {insert: 'defg 后续正文withoutSpaces'},
    ], 2)).toEqual({query: 'abcdefg', triggerLength: 8})
  })
})
