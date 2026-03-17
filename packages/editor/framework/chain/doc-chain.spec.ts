import "../../blocks"
import { BlockNodeType, IBlockSnapshot } from "../block-std"
import { DocChain } from "./doc-chain"

const createSnapshot = (id: string): IBlockSnapshot => ({
  id,
  flavour: 'paragraph',
  nodeType: BlockNodeType.editable,
  props: {depth: 0},
  meta: {},
  children: []
})

describe('DocChain', () => {
  it('runs CRUD steps before selection helpers', async () => {
    const order: string[] = []
    const doc = {
      crud: {
        insertBlocksAfter: jasmine.createSpy('insertBlocksAfter').and.callFake(() => {
          order.push('insert')
          return []
        }),
        transact: jasmine.createSpy('transact').and.callFake((fn: () => unknown) => fn())
      },
      selection: {
        setCursorAtBlock: jasmine.createSpy('setCursorAtBlock').and.callFake(() => {
          order.push('cursor')
        }),
        selectBlock: jasmine.createSpy('selectBlock'),
        setSelection: jasmine.createSpy('setSelection'),
        selectOrSetCursorAtBlock: jasmine.createSpy('selectOrSetCursorAtBlock'),
        recalculate: jasmine.createSpy('recalculate')
      }
    }

    await new DocChain(doc as unknown as BlockCraft.Doc)
      .insertAfterSnapshots('anchor', [createSnapshot('paragraph-1')])
      .setCursorAtBlock('paragraph-1', true)
      .run()

    expect(order).toEqual(['insert', 'cursor'])
  })

  it('wraps custom mutations in a CRUD transaction', async () => {
    const order: string[] = []
    const doc = {
      crud: {
        transact: jasmine.createSpy('transact').and.callFake((fn: () => unknown) => {
          order.push('transact')
          return fn()
        })
      },
      selection: {
        setCursorAtBlock: jasmine.createSpy('setCursorAtBlock'),
        selectBlock: jasmine.createSpy('selectBlock'),
        setSelection: jasmine.createSpy('setSelection'),
        selectOrSetCursorAtBlock: jasmine.createSpy('selectOrSetCursorAtBlock'),
        recalculate: jasmine.createSpy('recalculate')
      }
    }

    const result = await new DocChain(doc as unknown as BlockCraft.Doc)
      .transact(() => {
        order.push('body')
        return 'done'
      })
      .tap(({lastResult}) => {
        order.push(`tap:${lastResult}`)
      })
      .run()

    expect(doc.crud.transact).toHaveBeenCalled()
    expect(order).toEqual(['transact', 'body', 'tap:done'])
    expect(result.lastResult).toBe('done')
  })
})
