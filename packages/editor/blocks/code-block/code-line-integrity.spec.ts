import {CodeLineIntegrity} from './code-line-integrity'
import {ScrollBlot} from '../../framework/block-std/inline/blot/scroll-blot'
import {TextBlot} from '../../framework/block-std/inline/blot/text-blot'
import {CursorBlot} from '../../framework/block-std/inline/blot/cursor-blot'
import {getLogicalLineAccess} from '../../framework/block-std/inline/blot/logical-line-access'
import type {DeltaInsertText} from '../../framework/model/delta'

describe('CodeLineIntegrity dirty display rows', () => {
  const cleanups: Array<() => void> = []

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
  })

  function fixture(model?: DeltaInsertText[]) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const scroll = new ScrollBlot(container, new Map(), {lineContainerTag: 'c-line'})
    const integrity = new CodeLineIntegrity()
    if (!model) {
      model = []
      for (let index = 0; index < 32; index++) {
        model.push({insert: `left${index}`, attributes: {'s:color': 'red'}})
        model.push({insert: `right${index}`, attributes: {'s:color': 'blue'}})
        if (index < 31) model.push({insert: '\n'})
      }
    }
    scroll.build(model)
    integrity.repair(scroll, container)
    integrity.captureBaseline(scroll, container)
    const groups = getLogicalLineAccess(scroll)!.sourceLines().map(line => line.leaves)
    const rows = Array.from(container.children)
    const observer = new MutationObserver(records => integrity.recordMutations(records))
    observer.observe(container, {
      subtree: true, characterData: true, characterDataOldValue: true, childList: true, attributes: true,
    })
    const deep = spyOn<any>(integrity, '_isTextIntact').and.callThrough()
    const inspectAll = () => {
      integrity.recordMutations(observer.takeRecords())
      const reusable = integrity.inspect(scroll, container)
      return {reusable, results: groups.map(group => reusable(group))}
    }
    const inspectedRows = () => new Set<Node | null>(deep.calls.allArgs()
      .map(args => (args[0] as TextBlot).domNode.parentNode))
    cleanups.push(() => {
      observer.disconnect()
      integrity.clear()
      scroll.detachAll()
      container.remove()
    })
    return {container, scroll, integrity, observer, groups, rows, deep, inspectAll, inspectedRows}
  }

  it('reuses a fully verified clean snapshot without deeply checking text again', () => {
    const h = fixture()
    expect(h.inspectAll().results.every(Boolean)).toBeTrue()
    expect(h.deep).not.toHaveBeenCalled()
  })

  for (const delivered of [false, true]) {
    for (const dirtyRows of [[16], [5, 24]]) {
      it(`deeply checks only ${dirtyRows.length} dirty rows with ${delivered ? 'delivered' : 'pending'} character-data records`, async () => {
        const h = fixture()
        for (const index of dirtyRows) {
          const [left, right] = h.groups[index] as readonly TextBlot[]
          left.textNode.data = left.textNode.data.toUpperCase()
          right.textNode.data += '候选'
        }
        if (delivered) await Promise.resolve()

        const {reusable, results} = h.inspectAll()

        // Text content is reconciled against the model by CodeInlineRuntime;
        // this predicate verifies the native row's structure and attributes.
        expect(results.every(Boolean)).toBeTrue()
        expect(h.inspectedRows()).toEqual(new Set(dirtyRows.map(index => h.rows[index])))
        const expectedChecks = dirtyRows.reduce((count, index) => count + h.groups[index].length, 0)
        expect(h.deep).toHaveBeenCalledTimes(expectedChecks)
        for (const index of dirtyRows) expect(reusable(h.groups[index])).toBeTrue()
        expect(h.deep).toHaveBeenCalledTimes(expectedChecks)
      })
    }
  }

  for (const mutation of ['attributes', 'childList', 'new LF', 'original LF', 'gap text', 'Break structure', 'unknown root child'] as const) {
    it(`falls back to complete row checking for ${mutation}`, () => {
      const h = fixture()
      const leaf = h.groups[16][0] as TextBlot
      if (mutation === 'attributes') leaf.cElement.removeAttribute('style')
      else if (mutation === 'childList') leaf.textNode.parentNode!.appendChild(document.createTextNode('extra'))
      else if (mutation === 'new LF') leaf.textNode.data += '\n'
      else if (mutation === 'original LF') (h.groups[16].at(-1) as TextBlot).textNode.data = ''
      else if (mutation === 'gap text') h.scroll.leadingGapNode!.firstChild!.textContent = 'native gap'
      else if (mutation === 'Break structure') h.scroll.children.at(-1)!.domNode.textContent = 'native break'
      else h.container.appendChild(document.createTextNode('unknown'))

      h.inspectAll()

      expect(h.inspectedRows().has(h.rows[0])).toBeTrue()
      expect(h.inspectedRows().has(h.rows.at(-1)!)).toBeTrue()
    })
  }

  it('keeps text recovery local when the host class changes in the same mutation batch', () => {
    const h = fixture()
    h.container.classList.add('native-composition-active')
    ;(h.groups[16][0] as TextBlot).textNode.data += '候选'

    const {results} = h.inspectAll()

    expect(results.every(Boolean)).toBeTrue()
    expect(h.inspectedRows()).toEqual(new Set([h.rows[16]]))
    expect(h.deep).toHaveBeenCalledTimes(h.groups[16].length)
  })

  it('still invalidates descendant attributes when a host class change shares the batch', () => {
    const h = fixture()
    h.container.classList.add('native-composition-active')
    ;(h.groups[16][0] as TextBlot).cElement.removeAttribute('style')

    const {results} = h.inspectAll()

    expect(results[16]).toBeFalse()
    expect(h.inspectedRows().has(h.rows[0])).toBeTrue()
    expect(h.inspectedRows().has(h.rows.at(-1)!)).toBeTrue()
  })

  it('does not narrow character-data recovery for source lines sharing a hidden-LF display row', () => {
    const h = fixture([
      {insert: 'first\nleft'}, {insert: '\n', attributes: {'s:display': 'none'}}, {insert: 'right\nlast'},
    ])
    ;(h.groups[2][0] as TextBlot).textNode.data += '候选'

    h.inspectAll()

    expect(h.rows.length).toBe(3)
    expect(h.inspectedRows()).toEqual(new Set(h.rows))
  })

  it('does not certify a text row containing an active composition cursor as pure text', () => {
    const h = fixture([{insert: 'first\nmiddle\nlast'}])
    h.scroll.insertCursorBlot(6, new CursorBlot())
    h.integrity.repair(h.scroll, h.container)
    h.integrity.captureBaseline(h.scroll, h.container)
    h.observer.takeRecords()
    h.deep.calls.reset()
    ;(h.groups[1][0] as TextBlot).textNode.data += '候选'

    h.inspectAll()

    expect(h.inspectedRows()).toEqual(new Set(h.rows))
  })

  it('does not resurrect eligibility when a structural record follows an already delivered text record', async () => {
    const h = fixture()
    const leaf = h.groups[16][0] as TextBlot
    const original = leaf.textNode.data
    leaf.textNode.data += '候选'
    await Promise.resolve()
    leaf.cElement.setAttribute('data-native', 'changed')
    await Promise.resolve()
    leaf.textNode.data = original

    h.inspectAll()

    expect(h.inspectedRows().has(h.rows[0])).toBeTrue()
    expect(h.inspectedRows().has(h.rows.at(-1)!)).toBeTrue()
  })

  it('invalidates a transient LF insertion even when the same batch restores the original text', () => {
    const h = fixture()
    const leaf = h.groups[16][0] as TextBlot
    const original = leaf.textNode.data
    leaf.textNode.data = `${original}\n`
    leaf.textNode.data = original

    const {results} = h.inspectAll()

    expect(results.every(Boolean)).toBeTrue()
    expect(h.inspectedRows().has(h.rows[0])).toBeTrue()
    expect(h.inspectedRows().has(h.rows.at(-1)!)).toBeTrue()
  })

  it('invalidates an original LF changed to ordinary text after its row was already marked dirty', async () => {
    const h = fixture()
    ;(h.groups[16][0] as TextBlot).textNode.data += '候选'
    await Promise.resolve()
    const newline = h.groups[16].at(-1) as TextBlot
    expect(newline.textNode.data).toBe('\n')
    newline.textNode.data = 'native replacement'

    h.inspectAll()

    expect(h.inspectedRows().has(h.rows[0])).toBeTrue()
    expect(h.inspectedRows().has(h.rows.at(-1)!)).toBeTrue()
  })

  for (const invalidate of ['clear', 'invalidateBaseline'] as const) {
    it(`requires complete checking after ${invalidate}`, () => {
      const h = fixture()
      h.integrity[invalidate]()

      expect(h.inspectAll().results.every(Boolean)).toBeTrue()

      expect(h.inspectedRows()).toEqual(new Set(h.rows))
    })
  }
})
