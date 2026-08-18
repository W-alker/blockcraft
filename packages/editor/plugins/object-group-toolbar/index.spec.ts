import {fakeAsync, flushMicrotasks, TestBed} from '@angular/core/testing'
import {
  ObjectGroupToolbarComponent,
  ObjectGroupToolbarPlugin,
} from './index'

describe('ObjectGroupToolbarPlugin', () => {
  it('uses the dedicated group and ungroup iconfont glyphs', async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectGroupToolbarComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(ObjectGroupToolbarComponent)
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement

    expect(host.querySelector('[aria-label="组合"] i')?.classList)
      .toContain('bc_combination')
    expect(host.querySelector('[aria-label="组合"] i')?.classList)
      .not.toContain('bc_quxiaozuhe')

    fixture.componentRef.setInput('mode', 'ungroup')
    fixture.componentRef.setInput('canUngroup', true)
    fixture.componentRef.setInput('objectLayout', 'top-bottom')
    fixture.detectChanges()
    expect(host.querySelector('[aria-label="取消组合"] i')?.classList)
      .toContain('bc_quxiaozuhe')
    expect(host.querySelector('[aria-label="取消组合"] i')?.classList)
      .not.toContain('bc_combination')
    expect(host.querySelector('[aria-label="上下型"] i')?.classList)
      .toContain('bc_tuwenraopaishangxiashi')
    expect(host.querySelector('[aria-label="衬于文字下方"] i')?.classList)
      .toContain('bc_cengji-xia')
    expect(host.querySelector('[aria-label="浮于文字上方"] i')?.classList)
      .toContain('bc_cengji-shang')
    expect(host.querySelector('[aria-label="上下型"]')?.getAttribute(
      'aria-pressed',
    )).toBe('true')
  })

  it('renders the Word-like alignment icons and gates distribution at three objects', async () => {
    await TestBed.configureTestingModule({
      imports: [ObjectGroupToolbarComponent],
    }).compileComponents()
    const fixture = TestBed.createComponent(ObjectGroupToolbarComponent)
    fixture.componentRef.setInput('canGroup', true)
    fixture.componentRef.setInput('canDistribute', false)
    fixture.detectChanges()
    const host = fixture.nativeElement as HTMLElement
    const labels = [
      '左对齐',
      '水平居中',
      '右对齐',
      '顶端对齐',
      '垂直居中',
      '底端对齐',
      '中心对齐',
      '横向分布',
      '纵向分布',
    ]
    const icons = [
      'bc_align2left',
      'bc_align2center',
      'bc_align2right',
      'bc_align2top',
      'bc_align2middle',
      'bc_align2bottom',
      'bc_zhongxinduiqi',
      'bc_hengxiangfenbu',
      'bc_zongxiangfenbu',
    ]

    expect(labels.map(label =>
      host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
        ?.querySelector('i')?.classList.contains(icons[labels.indexOf(label)]!),
    )).toEqual(Array(labels.length).fill(true))
    expect(host.querySelector<HTMLButtonElement>(
      '[aria-label="横向分布"]',
    )?.disabled).toBeTrue()
    expect(host.querySelector<HTMLButtonElement>(
      '[aria-label="纵向分布"]',
    )?.disabled).toBeTrue()

    fixture.componentRef.setInput('canDistribute', true)
    fixture.detectChanges()
    expect(host.querySelector<HTMLButtonElement>(
      '[aria-label="横向分布"]',
    )?.disabled).toBeFalse()
  })

  it('extends a whole-object selection into a contiguous placement boundary', () => {
    const replay = jasmine.createSpy('replay')
    const plugin = new ObjectGroupToolbarPlugin()
    ;(plugin as any).doc = {
      model: {
        getParentId: (id: string) => ['image', 'shape'].includes(id)
          ? 'layout'
          : null,
        getChildrenIds: () => ['image', 'shape'],
      },
      placement: {
        isPlacementLayout: (id: string) => id === 'layout',
        canAlignObjects: () => true,
      },
      selection: {
        value: {
          isInSameBlock: true,
          anchor: {type: 'selected'},
          head: {type: 'selected'},
          firstBlockId: 'image',
        },
        replay,
      },
    }

    expect((plugin as any).extendObjectSelection('shape')).toBeTrue()
    expect(replay).toHaveBeenCalledOnceWith({
      anchor: {blockId: 'layout', type: 'boundary', index: 0},
      head: {blockId: 'layout', type: 'boundary', index: 2},
      commonParent: 'layout',
    })
  })

  it('delegates alignment to the placement domain', fakeAsync(() => {
    const alignObjects = jasmine.createSpy('alignObjects')
    const plugin = new ObjectGroupToolbarPlugin()
    ;(plugin as any).doc = {placement: {alignObjects}}
    ;(plugin as any).syncToolbar = jasmine.createSpy('syncToolbar')

    ;(plugin as any).execute('center', ['image', 'shape'])
    expect(alignObjects).toHaveBeenCalledOnceWith(
      ['image', 'shape'],
      'center',
    )
    flushMicrotasks()
    expect((plugin as any).syncToolbar).toHaveBeenCalled()
  }))

  it('delegates whole-group layout without exposing member layout changes', fakeAsync(() => {
    const group = {id: 'group'}
    const setObjectLayout = jasmine.createSpy('setObjectLayout')
      .and.returnValue(true)
    const plugin = new ObjectGroupToolbarPlugin()
    ;(plugin as any).doc = {
      placement: {setObjectLayout},
      getBlockById: () => group,
    }
    ;(plugin as any).syncToolbar = jasmine.createSpy('syncToolbar')

    ;(plugin as any).execute({
      name: 'object-layout',
      value: 'top-bottom',
    }, ['group'])

    expect(setObjectLayout).toHaveBeenCalledOnceWith(group, 'top-bottom')
    flushMicrotasks()
    expect((plugin as any).syncToolbar).toHaveBeenCalled()
  }))

  it('keeps alignment available when the selected objects cannot be grouped', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const plugin = new ObjectGroupToolbarPlugin()
    ;(plugin as any).doc = {
      selection: {
        value: {
          isInSameBlock: false,
          getBoundarySelectedChildIds: () => ['image', 'object-group'],
        },
      },
      placement: {
        canAlignObjects: (_ids: string[], alignment?: string) =>
          alignment !== 'horizontal-distribute',
        canGroup: () => false,
      },
      getBlockById: () => ({id: 'image', hostElement: host}),
    }

    expect((plugin as any).resolveToolbarState()).toEqual({
      mode: 'group',
      anchor: host,
      blockIds: ['image', 'object-group'],
      canGroup: false,
      canUngroup: false,
      canDistribute: false,
      objectLayout: 'over',
      canMoveForward: false,
      canMoveBackward: false,
    })
    host.remove()
  })

  it('keeps the selected group toolbar available in top-bottom flow', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const plugin = new ObjectGroupToolbarPlugin()
    ;(plugin as any).doc = {
      selection: {
        value: {
          isInSameBlock: true,
          anchor: {blockId: 'group', type: 'selected'},
          head: {blockId: 'group', type: 'selected'},
          firstBlockId: 'group',
        },
      },
      placement: {
        isObjectGroup: (id: string) => id === 'group',
        canUngroup: () => false,
        getObjectLayout: () => 'top-bottom',
        canMoveForward: () => false,
        canMoveBackward: () => false,
      },
      getBlockById: () => ({id: 'group', hostElement: host}),
    }

    expect((plugin as any).resolveToolbarState()).toEqual({
      mode: 'ungroup',
      anchor: host,
      blockIds: ['group'],
      canGroup: false,
      canUngroup: false,
      canDistribute: false,
      objectLayout: 'top-bottom',
      canMoveForward: false,
      canMoveBackward: false,
    })
    host.remove()
  })

  it('selects the group first, enters a member on second click, and drags from an edge', () => {
    const root = document.createElement('div')
    const groupHost = document.createElement('div')
    groupHost.dataset['blockId'] = 'group'
    groupHost.setAttribute('data-bc-object-group', '')
    const child = document.createElement('div')
    child.dataset['blockId'] = 'image'
    groupHost.append(child)
    const edge = document.createElement('span')
    edge.className = 'object-group-block__move-edge'
    groupHost.append(edge)
    root.append(groupHost)
    document.body.append(root)

    const selectBlock = jasmine.createSpy('selectBlock')
    const startDrag = jasmine.createSpy('startDrag')
    const group = {id: 'group', hostElement: groupHost}
    const selection: {value: any} = {value: null}
    const plugin = new ObjectGroupToolbarPlugin()
    ;(plugin as any).doc = {
      isReadonly: false,
      root: {hostElement: root},
      model: {
        getParentId: (id: string) => id === 'image'
          ? 'group'
          : id === 'group'
            ? 'layout'
            : null,
      },
      placement: {
        isObjectGroup: (id: string) => id === 'group',
        isPlacementLayout: (id: string) => id === 'layout',
        startDrag,
      },
      selection: {
        get value() { return selection.value },
        selectBlock,
      },
      getBlockById: () => group,
      readonlyManager: {isReadonly: () => false},
    }

    const first = pointerOn(child)
    ;(plugin as any).onPointerDown(first)
    expect(selectBlock).toHaveBeenCalledOnceWith('group')
    expect(startDrag).not.toHaveBeenCalled()
    expect(first.defaultPrevented).toBeTrue()

    selection.value = {
      isInSameBlock: true,
      anchor: {blockId: 'group', type: 'selected'},
      head: {blockId: 'group', type: 'selected'},
      firstBlockId: 'group',
    }
    const second = pointerOn(child)
    ;(plugin as any).onPointerDown(second)
    expect(selectBlock).toHaveBeenCalledTimes(1)
    expect(startDrag).not.toHaveBeenCalled()
    expect(second.defaultPrevented).toBeFalse()

    selection.value = {
      isInSameBlock: true,
      anchor: {blockId: 'image', type: 'selected'},
      head: {blockId: 'image', type: 'selected'},
      firstBlockId: 'image',
    }
    const memberSelected = pointerOn(child)
    ;(plugin as any).onPointerDown(memberSelected)
    expect(selectBlock).toHaveBeenCalledTimes(1)
    expect(startDrag).not.toHaveBeenCalled()
    expect(memberSelected.defaultPrevented).toBeFalse()

    const edgePointer = pointerOn(edge)
    ;(plugin as any).onPointerDown(edgePointer)
    expect(selectBlock).toHaveBeenCalledTimes(2)
    expect(startDrag).toHaveBeenCalledOnceWith(edgePointer, group)
    expect(edgePointer.defaultPrevented).toBeTrue()
    root.remove()
  })

  it('keeps the group frame active while any nested descendant is selected', () => {
    const root = document.createElement('div')
    const groupHost = document.createElement('div')
    root.append(groupHost)
    document.body.append(root)
    const parents: Record<string, string> = {
      'shape-text': 'shape',
      shape: 'group',
      group: 'layout',
      outside: 'root',
    }

    const plugin = new ObjectGroupToolbarPlugin()
    ;(plugin as any).doc = {
      model: {
        getParentId: (id: string) => parents[id] ?? null,
      },
      placement: {
        isObjectGroup: (id: string) => id === 'group',
      },
      getBlockById: (id: string) => {
        if (id !== 'group') throw new Error('missing block')
        return {id, hostElement: groupHost}
      },
    }

    ;(plugin as any).syncSelectionWithinGroupFrames({
      anchor: {blockId: 'shape-text', type: 'text', offset: 0},
      head: {blockId: 'shape-text', type: 'text', offset: 2},
    })
    expect(groupHost.classList).toContain('bc-object-group--selection-within')

    ;(plugin as any).syncSelectionWithinGroupFrames({
      anchor: {blockId: 'outside', type: 'selected'},
      head: {blockId: 'outside', type: 'selected'},
    })
    expect(groupHost.classList).not.toContain('bc-object-group--selection-within')
    root.remove()
  })
})

function pointerOn(target: HTMLElement): PointerEvent {
  const event = new PointerEvent('pointerdown', {
    button: 0,
    pointerId: 9,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}
