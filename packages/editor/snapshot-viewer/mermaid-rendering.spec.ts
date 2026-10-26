import {BlockNodeType, IBlockSnapshot} from '../framework/block-std/types/block.type'
import {createSnapshotRenderer} from './create-snapshot-renderer'
import {createAllBlocksFixture} from './testing/fixtures/all-blocks.fixture'

function paragraph(text: string): IBlockSnapshot {
  return {id: 'tail', flavour: 'paragraph', nodeType: BlockNodeType.editable,
    props: {}, meta: {}, children: [{insert: text}]}
}

function mermaid(source: string, mode = 'graph'): IBlockSnapshot {
  return {id: 'diagram', flavour: 'mermaid', nodeType: BlockNodeType.block,
    props: {mode}, meta: {}, children: [{id: 'source', flavour: 'mermaid-textarea',
      nodeType: BlockNodeType.editable, props: {}, meta: {}, children: [{insert: source}]}]}
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return {promise, resolve}
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('Snapshot Mermaid rendering', () => {
  it('shows only the graph regardless of the editor mode stored in the snapshot', async () => {
    for (const mode of ['text', 'default', 'graph']) {
      const host = document.createElement('div')
      const render = jasmine.createSpy().and.resolveTo('<svg data-diagram="ready"></svg>')
      const renderer = createSnapshotRenderer({enhancers: {mermaid: {render}}})
      const snapshot = mermaid('graph TD; A-->B', mode)
      renderer.render(host, [snapshot])
      await settle()
      expect(host.querySelector('.graph-con svg')).not.toBeNull()
      expect(host.querySelector('.head, .text-container, .mermaid-textarea, button')).toBeNull()
      expect(host.querySelector('.mermaid-block')?.getAttribute('data-mode')).toBe('graph')
      expect(snapshot.props['mode']).toBe(mode)
      renderer.destroy()
    }
  })

  it('keeps an in-flight diagram on its mounted target while following text streams', async () => {
    const host = document.createElement('div')
    const pending = deferred<string>()
    let signal!: AbortSignal
    const render = jasmine.createSpy().and.callFake((_source: string, next: AbortSignal) => {
      signal = next
      return pending.promise
    })
    const renderer = createSnapshotRenderer({enhancers: {mermaid: {render}}})
    renderer.render(host, [mermaid('graph TD; A-->B'), paragraph('one')])
    const graph = host.querySelector('.graph-con')!
    renderer.update([mermaid('graph TD; A-->B'), paragraph('one two')])
    renderer.update([mermaid('graph TD; A-->B'), paragraph('one two')])
    expect(signal.aborted).toBeFalse()
    expect(render).toHaveBeenCalledTimes(1)
    pending.resolve('<svg data-diagram="ready"></svg>')
    await settle()
    expect(host.querySelector('.graph-con')).toBe(graph)
    expect(graph.querySelector('svg')).not.toBeNull()
    renderer.destroy()
  })

  it('updates the mounted graph and ignores stale results without clearing the last good SVG', async () => {
    const host = document.createElement('div')
    const jobs = new Map<string, ReturnType<typeof deferred<string>> & {signal: AbortSignal}>()
    const render = jasmine.createSpy().and.callFake((source: string, signal: AbortSignal) => {
      const job = {...deferred<string>(), signal}
      jobs.set(source, job)
      return job.promise
    })
    const renderer = createSnapshotRenderer({enhancers: {mermaid: {render}}})
    renderer.render(host, [mermaid('first')])
    jobs.get('first')!.resolve('<svg data-diagram="first"></svg>')
    await settle()
    const graph = host.querySelector('.graph-con')!
    const first = graph.firstElementChild
    renderer.update([mermaid('second')])
    expect(graph.firstElementChild).toBe(first)
    renderer.update([mermaid('third')])
    expect(jobs.get('second')!.signal.aborted).toBeTrue()
    expect(graph.firstElementChild).toBe(first)
    jobs.get('third')!.resolve('<svg data-diagram="third"></svg>')
    await settle()
    jobs.get('second')!.resolve('<svg data-diagram="stale"></svg>')
    await settle()
    expect(host.querySelector('.graph-con')).toBe(graph)
    expect(graph.firstElementChild?.getAttribute('data-diagram')).toBe('third')
    expect(render).toHaveBeenCalledTimes(3)
    renderer.destroy()
  })

  it('cancels late diagram results when cleared, removed, or destroyed', async () => {
    for (const action of ['clear', 'remove', 'destroy']) {
      const host = document.createElement('div')
      const pending = deferred<string>()
      let signal!: AbortSignal
      const renderer = createSnapshotRenderer({enhancers: {mermaid: {
        render: (_source, next) => { signal = next; return pending.promise },
      }}})
      renderer.render(host, [mermaid('graph TD; A-->B')])
      if (action === 'destroy') renderer.destroy()
      else renderer.update(action === 'clear' ? [mermaid('')] : [])
      expect(signal.aborted).toBeTrue()
      pending.resolve('<svg data-diagram="stale"></svg>')
      await settle()
      expect(host.querySelector('svg')).toBeNull()
      renderer.destroy()
    }
  })

  it('retains the last valid graph when an incomplete streamed source fails to render', async () => {
    const host = document.createElement('div')
    const render = jasmine.createSpy().and.callFake((source: string) => source === 'valid'
      ? Promise.resolve('<svg data-diagram="valid"></svg>')
      : Promise.reject(new Error('Incomplete Mermaid source')))
    const renderer = createSnapshotRenderer({enhancers: {mermaid: {render}}})
    renderer.render(host, [mermaid('valid')])
    await settle()
    const svg = host.querySelector('svg')!
    renderer.update([mermaid('incomplete')])
    await settle()
    expect(host.querySelector('svg')).toBe(svg)
    expect(host.querySelector('.text-container')).toBeNull()
    renderer.destroy()
  })

  it('does not invoke Mermaid or expose its source with resources disabled', () => {
    const host = document.createElement('div')
    const render = jasmine.createSpy()
    const renderer = createSnapshotRenderer({resourcePolicy: 'off', enhancers: {mermaid: {render}}})
    renderer.render(host, [mermaid('graph TD; A-->B', 'text')])
    renderer.update([mermaid('graph TD; B-->C')])
    expect(render).not.toHaveBeenCalled()
    expect(host.textContent).toBe('')
    renderer.destroy()
  })

  it('preserves pending formula and bookmark enhancements across unrelated updates', async () => {
    const fixture = createAllBlocksFixture()
    const host = document.createElement('div')
    const formula = deferred<string>()
    const bookmark = deferred<{title: string}>()
    const renderer = createSnapshotRenderer({enhancers: {
      formula: {render: () => formula.promise},
      bookmark: {load: () => bookmark.promise},
    }})
    renderer.render(host, [fixture.formula, fixture.bookmark, paragraph('one')])
    renderer.update([fixture.formula, fixture.bookmark, paragraph('one two')])
    formula.resolve('<span data-formula="ready">formula</span>')
    bookmark.resolve({title: 'Loaded bookmark'})
    await settle()
    expect(host.querySelector('[data-formula="ready"]')).not.toBeNull()
    expect(host.textContent).toContain('Loaded bookmark')
    renderer.destroy()
  })

  it('cancels old inline enhancement work when the editable fast path changes its source', async () => {
    const host = document.createElement('div')
    const pending = deferred<string>()
    let signal!: AbortSignal
    const renderer = createSnapshotRenderer({blockRenderers: [{
      canRender: snapshot => snapshot.flavour === 'paragraph',
      render: (ctx, snapshot) => {
        const element = document.createElement('div')
        const text = document.createElement('div')
        text.className = 'edit-container'
        text.append(ctx.createInlineContent(snapshot.children as never))
        element.append(text)
        ctx.scheduleEnhancement({key: `highlight:${JSON.stringify(snapshot.children)}`, target: text,
          load: next => { signal = next; return pending.promise },
          apply: value => { text.textContent = value as string }})
        return {element}
      },
    }]})
    renderer.render(host, [paragraph('one')])
    renderer.update([paragraph('one two')])
    expect(signal.aborted).toBeTrue()
    pending.resolve('stale source')
    await settle()
    expect(host.textContent).toBe('one two')
    renderer.destroy()
  })
})
