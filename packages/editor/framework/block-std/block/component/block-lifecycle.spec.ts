import {Subject} from 'rxjs'
import {BaseBlockComponent} from './base-block'

describe('BaseBlockComponent view lifecycle', () => {
  it('detaches once without broadcasting permanent destruction', () => {
    const block = createLifecycleBlock()
    let destroys = 0
    let detaches = 0
    block.onDestroy$.subscribe(() => destroys++)
    block.onDetach$.subscribe(() => detaches++)

    block.detach()
    block.detach()

    expect(block.viewState).toBe('retained')
    expect(block.isAttached).toBeFalse()
    expect(block.events).toEqual(['before-detach', 'cd-detach'])
    expect(detaches).toBe(1)
    expect(destroys).toBe(0)
  })

  it('reattaches once from current Yjs and broadcasts only after the view is ready', () => {
    const block = createLifecycleBlock()
    block.detach()
    block.events.length = 0
    block.onReattach$.subscribe(() => block.events.push('reattach-event'))

    block.reattach()
    block.reattach()

    expect(block.viewState).toBe('mounted')
    expect(block.isAttached).toBeTrue()
    expect(block.events).toEqual([
      'resolve-y-block',
      'init-model',
      'after-reattach',
      'cd-reattach',
      'readonly-view',
      'reattach-event',
    ])
  })

  it('marks permanent destruction separately and cannot be reattached', () => {
    const block = createLifecycleBlock()
    let destroys = 0
    block.onDestroy$.subscribe(() => destroys++)

    block.ngOnDestroy()
    block.ngOnDestroy()
    block.reattach()

    expect(block.viewState).toBe('destroyed')
    expect(block.isAttached).toBeFalse()
    expect(destroys).toBe(1)
    expect(block.events).toEqual(['before-detach'])
  })

  it('does not release retained view resources twice on permanent destruction', () => {
    const block = createLifecycleBlock()
    const releaseViewRetention = jasmine.createSpy('releaseViewRetention')
    ;(block as any)._releaseViewRetention = releaseViewRetention

    block.detach()
    block.ngOnDestroy()
    block.ngOnDestroy()

    expect(block.events).toEqual(['before-detach', 'cd-detach'])
    expect(releaseViewRetention).toHaveBeenCalledTimes(1)
  })

  it('binds schema view retention to the full component lifetime', () => {
    const block = createLifecycleBlock()
    const releaseViewRetention = jasmine.createSpy('releaseViewRetention')
    const bindBlockViewRetention = jasmine.createSpy('bindBlockViewRetention')
      .and.returnValue(releaseViewRetention)
    Object.assign((block as any)._native, {
      flavour: 'custom-player',
      nodeType: 'void',
    })
    Object.assign((block as any).doc, {
      schemas: {
        get: () => ({metadata: {viewRetention: 'keep-alive'}}),
      },
      virtualization: {
        enabled: true,
        bindBlockViewRetention,
      },
    })

    ;(block as any)._bindViewRetention()
    block.detach()

    expect(bindBlockViewRetention).toHaveBeenCalledOnceWith({
      blockId: 'block',
      flavour: 'custom-player',
      nodeType: 'void',
      schemaRetention: 'keep-alive',
    })
    expect(releaseViewRetention).not.toHaveBeenCalled()

    block.ngOnDestroy()
    expect(releaseViewRetention).toHaveBeenCalledTimes(1)
  })

  it('does not schedule block-gap work for schema leaf blocks', () => {
    const block = createLifecycleBlock()
    Object.assign((block as any)._native, {
      flavour: 'table-cell',
      nodeType: 'block',
    })
    Object.assign(block, {
      hostElement: document.createElement('td'),
      doc: {
        schemas: {
          get: () => ({metadata: {isLeaf: true}}),
        },
      },
    })
    const requestFrame = spyOn(window, 'requestAnimationFrame')

    ;(block as any)._bindBlockGapSpaces()

    expect(requestFrame).not.toHaveBeenCalled()
    expect((block as any)._blockGapSub).toBeUndefined()
  })
})

class LifecycleBlock extends BaseBlockComponent {
  events!: string[]

  protected override beforeDetach(): void {
    this.events.push('before-detach')
  }

  protected override afterReattach(): void {
    this.events.push('after-reattach')
  }
}

function createLifecycleBlock(): LifecycleBlock {
  const block = Object.create(LifecycleBlock.prototype) as LifecycleBlock
  const mutable = block as any
  block.events = []
  mutable._viewState = 'mounted'
  mutable._native = {id: 'block'}
  Object.assign(block, {
    onViewInit$: new Subject<boolean>(),
    onDestroy$: new Subject<boolean>(),
    onDetach$: new Subject<void>(),
    onReattach$: new Subject<void>(),
    changeDetectorRef: {
      detach: () => block.events.push('cd-detach'),
      reattach: () => block.events.push('cd-reattach'),
      markForCheck: () => {},
    },
    doc: {
      crud: {
        getYBlock: () => {
          block.events.push('resolve-y-block')
          return {}
        },
      },
    },
  })
  mutable._init = () => block.events.push('init-model')
  block.applyReadonlyViewState = () => block.events.push('readonly-view')
  return block
}
