import {PaginationExportError} from './pdf-export.types'
import {preparePrintResources} from './print-resources'

describe('preparePrintResources', () => {
  it('keeps iframe content for the native print engine', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<div data-block-id="embed-1"><iframe src="https://example.com"></iframe></div>'

    const prepared = await preparePrintResources(root, {resourcePolicy: 'best-effort', timeoutMs: 10})

    expect(prepared.warnings).toEqual([])
    expect(root.querySelector('iframe')).not.toBeNull()
  })

  it('removes editing state from the print copy', async () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="selected selecting"><span class="blockcraft-cursor"></span></div>
      <div class="code-block">
        <span class="btn-collapse"></span>
        <div class="head-btn__group"><div class="head-btn">语言</div><div class="head-btn">复制</div></div>
        <div class="bc-scrollable-container"></div>
      </div>
      <div class="table-block"><table-row-bar></table-row-bar><button class="bc-table-fullscreen-btn"></button></div>
    `

    await preparePrintResources(root, {timeoutMs: 10})

    expect(root.querySelector('.blockcraft-cursor')).toBeNull()
    expect(root.querySelector('.selected')).toBeNull()
    expect(root.querySelector('.selecting')).toBeNull()
    expect(root.textContent).not.toContain('复制')
    expect(root.querySelector('.btn-collapse')).toBeNull()
    expect((root.querySelector<HTMLElement>('table-row-bar')!).style.visibility).toBe('hidden')
    expect((root.querySelector<HTMLElement>('.bc-table-fullscreen-btn')!).style.visibility).toBe('hidden')
    const scrollable = root.querySelector<HTMLElement>('.bc-scrollable-container')!
    expect(scrollable.dataset['bcPrintScrollable']).toBe('true')
    expect(scrollable.style.getPropertyValue('scrollbar-color')).toBe('transparent transparent')
  })

  it('honors an already aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expectAsync(preparePrintResources(document.createElement('div'), {
      signal: controller.signal,
    })).toBeRejectedWith(jasmine.objectContaining({code: 'aborted'}))
  })

  it('forces lazy images in the offscreen print copy to load eagerly', async () => {
    const root = document.createElement('div')
    const img = document.createElement('img')
    img.loading = 'lazy'
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
    root.appendChild(img)

    await preparePrintResources(root, {timeoutMs: 100})

    expect(img.loading).toBe('eager')
  })
})
