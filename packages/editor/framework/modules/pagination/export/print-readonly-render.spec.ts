import {IBlockSnapshot} from '../../../block-std/types/block.type'
import {readonlyDocRenderProvider} from './print-readonly-render'

describe('readonlyDocRenderProvider', () => {
  class FakeYDoc {}

  class FakeDoc {
    static instances: FakeDoc[] = []
    readonly yDoc: FakeYDoc
    readonly config: any
    readonly theme = 'light'
    readonly destroy = jasmine.createSpy('destroy')

    constructor(config: any = {}) {
      this.config = config
      this.yDoc = config.yDoc ?? new FakeYDoc()
      FakeDoc.instances.push(this)
    }

    initBySnapshot(_snapshot: IBlockSnapshot, host: HTMLElement): void {
      const root = document.createElement('div')
      root.setAttribute('data-blockcraft-root', 'true')
      const block = document.createElement('div')
      block.setAttribute('data-block-id', 'p1')
      root.appendChild(block)
      host.appendChild(root)
    }
  }

  const snapshot = {
    id: 'root',
    flavour: 'root',
    nodeType: 'block',
    props: {},
    meta: {},
    children: [],
  } as unknown as IBlockSnapshot

  beforeEach(() => {
    FakeDoc.instances = []
    spyOn(window, 'requestAnimationFrame').and.callFake(callback => {
      queueMicrotask(() => callback(0))
      return FakeDoc.instances.length + 1
    })
  })

  it('prepares only the isolated readonly document before returning its root', async () => {
    const liveDoc = new FakeDoc({
      docId: 'live',
      schemas: [],
      injector: {},
      embeds: [],
    }) as unknown as BlockCraft.Doc
    const prepareDocument = jasmine.createSpy('prepareDocument').and.callFake(async context => {
      expect(context.doc).not.toBe(liveDoc)
      expect(context.root.getAttribute('data-blockcraft-root')).toBe('true')
      context.root.setAttribute('data-business-ready', 'true')
    })

    const rendered = await readonlyDocRenderProvider(liveDoc, snapshot, {prepareDocument})(600)

    const printDoc = FakeDoc.instances[1]
    expect(prepareDocument).toHaveBeenCalledTimes(1)
    expect(printDoc.config.readonly).toBeTrue()
    expect(printDoc.config.plugins).toEqual([])
    expect(rendered.root.getAttribute('data-business-ready')).toBe('true')

    rendered.dispose()
    expect(printDoc.destroy).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-bc-print-offscreen]')).toBeNull()
  })

  it('destroys the isolated document when preparation fails', async () => {
    const liveDoc = new FakeDoc({docId: 'live'}) as unknown as BlockCraft.Doc

    await expectAsync(readonlyDocRenderProvider(liveDoc, snapshot, {
      prepareDocument: () => Promise.reject(new Error('business failed')),
    })(600)).toBeRejectedWith(jasmine.objectContaining({code: 'layout-not-ready'}))

    expect(FakeDoc.instances[1].destroy).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-bc-print-offscreen]')).toBeNull()
  })
})
