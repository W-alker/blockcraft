import {InputTransformer} from "./index";

describe('InputTransformer beforeInput range resolution', () => {
  const resolveRange = (selection: any, targetRange: any) => {
    const transformer = new InputTransformer({} as any) as any
    return transformer['_resolveBeforeInputRange'](selection, targetRange)
  }

  it('prefers the model selection when selected block endpoints are present', () => {
    const selection = {
      start: {type: 'selected', blockId: 'void-1'},
      end: {type: 'text', blockId: 'paragraph-1', offset: 4}
    }
    const targetRange = {
      from: {type: 'text', blockId: 'paragraph-1', index: 0, length: 0},
      to: null,
      collapsed: true
    }

    expect(resolveRange(selection, targetRange)).toBe(selection)
  })

  it('uses the DOM target range for plain text selections', () => {
    const selection = {
      start: {type: 'text', blockId: 'paragraph-1', offset: 0},
      end: {type: 'text', blockId: 'paragraph-1', offset: 3}
    }
    const targetRange = {
      from: {type: 'text', blockId: 'paragraph-1', index: 0, length: 3},
      to: null,
      collapsed: false
    }

    expect(resolveRange(selection, targetRange)).toBe(targetRange)
  })
})
