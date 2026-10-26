import {TableBlockSchema} from './index'

describe('TableBlockSchema initial values', () => {
  it('preserves the existing empty table and default dimensions', () => {
    const table: any = TableBlockSchema.createSnapshot(3, 3)
    expect(table.children.length).toBe(3)
    expect(table.children[0].children.length).toBe(3)
  })

  it('creates editable paragraphs for every value without interpreting HTML', () => {
    const values = [['项目', '数量'], ['<b>材料A</b>', '12']]
    const table: any = TableBlockSchema.createSnapshot(2, 2, values)
    const cells = table.children.flatMap((row: any) => row.children)
    const paragraphs = cells.map((cell: any) => cell.children[0])
    expect(paragraphs.map((p: any) => p.flavour)).toEqual(['paragraph', 'paragraph', 'paragraph', 'paragraph'])
    expect(paragraphs.map((p: any) => p.children)).toEqual(values.flat().map(insert => [{insert}]))
    expect(new Set(paragraphs.map((p: any) => p.id)).size).toBe(4)
    expect(TableBlockSchema.createSnapshot(2, 2, values).id).not.toBe(table.id)
  })

  it('rejects ragged data, wrong dimensions, invalid text and oversized payloads', () => {
    for (const values of [[['A']], [['A', 'B'], ['C']], [['A', 1], ['C', 'D']],
      [['A'.repeat(4001), 'B'], ['C', 'D']]]) {
      expect(() => TableBlockSchema.createSnapshot(2, 2, values as any)).toThrow()
    }
    expect(() => TableBlockSchema.createSnapshot(100, 50,
      Array.from({length: 100}, () => Array(50).fill('a'.repeat(25))))).toThrow()
  })
})
