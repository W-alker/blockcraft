import {TableBlockSchema} from '../../blocks/table-block'
import {createSnapshotRenderer} from '../create-snapshot-renderer'

describe('snapshot table column sizing', () => {
  it('switches between native auto layout and stored widths without changing the snapshot', () => {
    const snapshot = TableBlockSchema.createSnapshot(2, 2, [['序号', '说明'], ['1', '持续自适应内容']])
    delete snapshot.props.columnSizing // Legacy snapshots keep fixed sizing.
    snapshot.props.colWidths = [80, 240]
    const auto = {...snapshot, props: {...snapshot.props, columnSizing: 'auto' as const}}
    const original = JSON.stringify(auto)
    const host = document.createElement('div')
    const renderer = createSnapshotRenderer({resourcePolicy: 'off'})
    renderer.render(host, snapshot)
    expect(host.querySelector('.table-block')!.classList.contains('is-auto-column-width')).toBeFalse()
    expect(Array.from(host.querySelectorAll('col')).map(col => col.getAttribute('width'))).toEqual(['80', '240'])

    renderer.update(auto)
    expect(host.querySelector('.table-block')!.classList.contains('is-auto-column-width')).toBeTrue()
    expect(host.querySelectorAll('col').length).toBe(2)
    expect(host.querySelector('col[width]')).toBeNull()
    expect(host.querySelectorAll('.bc-table-column-metrics td').length).toBe(2)
    expect(host.querySelector('.bc-table-column-metrics')!.closest('tbody')).toBeNull()
    expect(host.textContent).toContain('持续自适应内容')
    expect(JSON.stringify(auto)).toBe(original)

    renderer.update(snapshot)
    expect(host.querySelector('.table-block')!.classList.contains('is-auto-column-width')).toBeFalse()
    expect(Array.from(host.querySelectorAll('col')).map(col => col.getAttribute('width'))).toEqual(['80', '240'])
    expect(host.querySelector('.bc-table-column-metrics')).toBeNull()
    renderer.destroy()
  })

  it('retains all native column tracks when every body cell belongs to one merged span', () => {
    const snapshot = TableBlockSchema.createSnapshot(1, 5)
    snapshot.props.columnSizing = 'auto'
    const row = snapshot.children[0] as any
    row.children[0].props.colspan = 5
    row.children.slice(1).forEach((cell: any) => cell.props.display = 'none')
    const original = JSON.stringify(snapshot)
    const host = document.createElement('div')
    const renderer = createSnapshotRenderer({resourcePolicy: 'off'})
    renderer.render(host, snapshot)
    expect(host.querySelector('tbody td[colspan]')!.getAttribute('colspan')).toBe('5')
    expect(host.querySelectorAll('tfoot.bc-table-column-metrics td').length).toBe(5)
    expect(host.querySelector('tfoot')!.getAttribute('aria-hidden')).toBe('true')
    expect(host.querySelector('tfoot [data-block-id]')).toBeNull()
    renderer.update({...snapshot, props: {...snapshot.props, rowHead: true}})
    expect(host.querySelectorAll('tfoot.bc-table-column-metrics td').length).toBe(5)
    expect(JSON.stringify(snapshot)).toBe(original)
    renderer.destroy()
  })
})
