import {InputTransformer} from "./index";

describe('InputTransformer beforeInput range resolution', () => {
  const resolveRange = (selection: any, targetRange: any) => {
    const transformer = new InputTransformer({} as any) as any
    return transformer['_resolveBeforeInputRange'](selection, targetRange)
  }

  const createTransformer = (selection: any) => {
    const doc = {
      rootId: 'root',
      selection: {
        value: selection,
        setSelection: jasmine.createSpy('setSelection'),
        blur: jasmine.createSpy('blur')
      },
      schemas: {
        get: jasmine.createSpy('get').and.returnValue({metadata: {renderUnit: true}}),
        isValidChildren: jasmine.createSpy('isValidChildren').and.returnValue(true)
      }
    }
    return {
      doc,
      transformer: new InputTransformer(doc as any) as any
    }
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

  it('falls back to keydown insertion when selection starts with a selected block', () => {
    const selection = {
      collapsed: false,
      commonParent: 'root',
      start: {type: 'selected', blockId: 'void-1'},
      end: {type: 'text', blockId: 'paragraph-1', offset: 3}
    }
    const {doc, transformer} = createTransformer(selection)
    spyOn(transformer, '_replaceText')
    const preventDefault = jasmine.createSpy('preventDefault')

    const result = transformer['_handleSelectedStartPrintableFallback']({
      getDefaultEvent: () => ({
        key: 'a',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault
      })
    })

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalled()
    expect(transformer['_replaceText']).toHaveBeenCalledWith(selection, 'a', true)
    expect(doc.selection.setSelection).toHaveBeenCalledWith({
      blockId: 'paragraph-1',
      type: 'text',
      index: 1,
      length: 0
    })
  })

  it('does not fallback on keydown for non-root selected block ranges', () => {
    const selection = {
      collapsed: false,
      commonParent: 'columns-1',
      start: {type: 'selected', blockId: 'image-1'},
      end: {type: 'text', blockId: 'paragraph-1', offset: 3}
    }
    const {doc, transformer} = createTransformer(selection)
    spyOn(transformer, '_replaceText')
    const preventDefault = jasmine.createSpy('preventDefault')

    const result = transformer['_handleSelectedStartPrintableFallback']({
      getDefaultEvent: () => ({
        key: 'a',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault
      })
    })

    expect(result).toBeUndefined()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(transformer['_replaceText']).not.toHaveBeenCalled()
    expect(doc.selection.setSelection).not.toHaveBeenCalled()
  })
})
