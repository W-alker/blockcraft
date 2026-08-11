import { TableFullscreenController } from './table-fullscreen-controller'

describe('TableFullscreenController', () => {
  let host: HTMLElement
  let controller: TableFullscreenController

  beforeEach(() => {
    TableFullscreenController.__resetForTesting()
    host = document.createElement('div')
    document.body.appendChild(host)
    controller = new TableFullscreenController(host)
  })

  afterEach(() => {
    controller.destroy()
    host.remove()
    // Ensure body class is cleared even if a test failed mid-flight.
    document.body.classList.remove('bc-table-fullscreen-lock')
    TableFullscreenController.__resetForTesting()
  })

  describe('state', () => {
    it('starts not fullscreen', () => {
      expect(controller.isFullscreen).toBe(false)
    })

    it('set(true) flips to fullscreen', () => {
      controller.set(true)
      expect(controller.isFullscreen).toBe(true)
    })

    it('set(false) flips back', () => {
      controller.set(true)
      controller.set(false)
      expect(controller.isFullscreen).toBe(false)
    })

    it('toggle() flips current value', () => {
      controller.toggle()
      expect(controller.isFullscreen).toBe(true)
      controller.toggle()
      expect(controller.isFullscreen).toBe(false)
    })

    it('repeated set with same value does not re-emit', () => {
      const emissions: boolean[] = []
      controller.state$.subscribe(v => emissions.push(v))
      controller.set(true)
      controller.set(true)
      expect(emissions).toEqual([false, true])
    })
  })

  describe('DOM side effects', () => {
    it('set(true) adds .is-fullscreen on host and .bc-table-fullscreen-lock on body', () => {
      controller.set(true)
      expect(host.classList.contains('is-fullscreen')).toBe(true)
      expect(document.body.classList.contains('bc-table-fullscreen-lock')).toBe(true)
    })

    it('set(false) removes both classes', () => {
      controller.set(true)
      controller.set(false)
      expect(host.classList.contains('is-fullscreen')).toBe(false)
      expect(document.body.classList.contains('bc-table-fullscreen-lock')).toBe(false)
    })

    it('keeps Angular DOM ownership, editability and focus across fullscreen', () => {
      const parent = document.createElement('section')
      const before = document.createElement('div')
      const editor = document.createElement('div')
      editor.contentEditable = 'true'
      parent.append(before, host)
      host.appendChild(editor)
      document.body.appendChild(parent)
      editor.focus()

      controller.set(true)
      expect(host.parentElement).toBe(parent)
      expect(host.previousElementSibling?.classList.contains('bc-table-fullscreen-placeholder')).toBe(true)
      expect(parent.classList.contains('bc-table-fullscreen-isolation-container')).toBe(true)
      expect(host.classList.contains('bc-table-fullscreen-isolation-branch')).toBe(true)
      expect(before.classList.contains('bc-table-fullscreen-isolation-branch')).toBe(false)
      expect(editor.contentEditable).toBe('true')
      expect(document.activeElement).toBe(editor)

      controller.set(false)
      expect(host.parentElement).toBe(parent)
      expect(host.previousElementSibling).toBe(before)
      expect(parent.classList.contains('bc-table-fullscreen-isolation-container')).toBe(false)
      expect(host.classList.contains('bc-table-fullscreen-isolation-branch')).toBe(false)
      expect(editor.contentEditable).toBe('true')
      expect(document.activeElement).toBe(editor)

      parent.remove()
    })

    it('uses owned path markers without taking over sibling styles or attributes', () => {
      const parent = document.createElement('section')
      const sibling = document.createElement('aside')
      const overlay = document.createElement('div')
      sibling.style.setProperty('visibility', 'collapse', 'important')
      sibling.style.setProperty('opacity', '0.4')
      sibling.style.setProperty('pointer-events', 'auto')
      sibling.setAttribute('inert', 'existing')
      sibling.setAttribute('aria-hidden', 'false')
      overlay.className = 'cdk-overlay-container'
      parent.append(sibling, host)
      document.body.append(parent, overlay)

      controller.set(true)

      expect(parent.classList.contains('bc-table-fullscreen-isolation-container')).toBe(true)
      expect(host.classList.contains('bc-table-fullscreen-isolation-branch')).toBe(true)
      expect(sibling.style.getPropertyValue('visibility')).toBe('collapse')
      expect(sibling.style.getPropertyPriority('visibility')).toBe('important')
      expect(sibling.style.getPropertyValue('opacity')).toBe('0.4')
      expect(sibling.style.getPropertyValue('pointer-events')).toBe('auto')
      expect(sibling.getAttribute('inert')).toBe('existing')
      expect(sibling.getAttribute('aria-hidden')).toBe('false')
      expect(overlay.classList.contains('bc-table-fullscreen-isolation-branch')).toBe(false)

      controller.set(false)

      expect(parent.classList.contains('bc-table-fullscreen-isolation-container')).toBe(false)
      expect(host.classList.contains('bc-table-fullscreen-isolation-branch')).toBe(false)
      expect(sibling.style.getPropertyValue('visibility')).toBe('collapse')
      expect(sibling.style.getPropertyPriority('visibility')).toBe('important')
      expect(sibling.style.getPropertyValue('opacity')).toBe('0.4')
      expect(sibling.style.getPropertyValue('pointer-events')).toBe('auto')
      expect(sibling.getAttribute('inert')).toBe('existing')
      expect(sibling.getAttribute('aria-hidden')).toBe('false')

      parent.remove()
      overlay.remove()
    })

    it('refreshes path markers if pagination reparents the table while fullscreen', async () => {
      const firstParent = document.createElement('section')
      const secondParent = document.createElement('section')
      firstParent.appendChild(host)
      document.body.append(firstParent, secondParent)

      controller.set(true)
      expect(firstParent.classList.contains('bc-table-fullscreen-isolation-container')).toBe(true)

      secondParent.appendChild(host)
      await new Promise<void>(resolve => setTimeout(resolve))

      expect(firstParent.classList.contains('bc-table-fullscreen-isolation-container')).toBe(false)
      expect(secondParent.classList.contains('bc-table-fullscreen-isolation-container')).toBe(true)
      expect(host.classList.contains('bc-table-fullscreen-isolation-branch')).toBe(true)

      controller.set(false)
      expect(secondParent.classList.contains('bc-table-fullscreen-isolation-container')).toBe(false)
      expect(host.classList.contains('bc-table-fullscreen-isolation-branch')).toBe(false)

      firstParent.remove()
      secondParent.remove()
    })

    it('cancels host document zoom only while fullscreen is open', () => {
      controller.destroy()
      host.style.zoom = '1.25'
      controller = new TableFullscreenController(host, () => null, () => 0.5)

      controller.set(true)
      expect(Number(host.style.zoom)).toBeCloseTo(2.5, 4)

      controller.set(false)
      expect(host.style.zoom).toBe('1.25')
    })

    it('removes temporary zoom when the host had no inline zoom', () => {
      controller.destroy()
      controller = new TableFullscreenController(host, () => null, () => 0.8)

      controller.set(true)
      expect(Number(host.style.zoom)).toBeCloseTo(1.25, 4)
      controller.set(false)

      expect(host.style.getPropertyValue('zoom')).toBe('')
    })

    it('keeps an inert normal-flow placeholder only while fullscreen is open', () => {
      spyOn(host, 'getBoundingClientRect').and.returnValue({
        top: 100,
        right: 520,
        bottom: 400,
        left: 20,
        width: 500,
        height: 300,
        x: 20,
        y: 100,
        toJSON: () => undefined,
      })

      controller.set(true)

      const placeholder = host.previousElementSibling as HTMLElement | null
      expect(placeholder?.classList.contains('bc-table-fullscreen-placeholder')).toBe(true)
      expect(placeholder?.style.height).toBe('300px')
      expect(placeholder?.contentEditable).toBe('false')

      controller.set(false)
      expect(document.querySelector('.bc-table-fullscreen-placeholder')).toBeNull()
    })

    it('locks only the resolved background scroller and restores its exact state', () => {
      controller.destroy()
      const scrollContainer = document.createElement('div')
      const tableScroller = document.createElement('div')
      scrollContainer.style.setProperty('overflow-x', 'auto', 'important')
      scrollContainer.style.setProperty('overflow-y', 'scroll')
      tableScroller.style.setProperty('overflow-x', 'auto')
      tableScroller.style.setProperty('overflow-y', 'hidden')
      let scrollLeft = 31
      let scrollTop = 47
      Object.defineProperty(scrollContainer, 'scrollLeft', {
        configurable: true,
        get: () => scrollLeft,
        set: value => { scrollLeft = value },
      })
      Object.defineProperty(scrollContainer, 'scrollTop', {
        configurable: true,
        get: () => scrollTop,
        set: value => { scrollTop = value },
      })
      host.appendChild(tableScroller)
      scrollContainer.appendChild(host)
      document.body.appendChild(scrollContainer)
      controller = new TableFullscreenController(host, () => scrollContainer)

      controller.set(true)

      expect(scrollContainer.style.getPropertyValue('overflow-x')).toBe('hidden')
      expect(scrollContainer.style.getPropertyPriority('overflow-x')).toBe('important')
      expect(scrollContainer.style.getPropertyValue('overflow-y')).toBe('hidden')
      expect(scrollContainer.style.getPropertyPriority('overflow-y')).toBe('important')
      expect(tableScroller.style.getPropertyValue('overflow-x')).toBe('auto')
      expect(tableScroller.style.getPropertyValue('overflow-y')).toBe('hidden')

      scrollContainer.scrollLeft = 0
      scrollContainer.scrollTop = 0
      controller.set(false)

      expect(scrollContainer.style.getPropertyValue('overflow-x')).toBe('auto')
      expect(scrollContainer.style.getPropertyPriority('overflow-x')).toBe('important')
      expect(scrollContainer.style.getPropertyValue('overflow-y')).toBe('scroll')
      expect(scrollContainer.style.getPropertyPriority('overflow-y')).toBe('')
      expect(scrollContainer.scrollLeft).toBe(31)
      expect(scrollContainer.scrollTop).toBe(47)
      scrollContainer.remove()
    })

    it('does not lock a resolved scroller inside the fullscreen table', () => {
      controller.destroy()
      const tableScroller = document.createElement('div')
      tableScroller.style.overflowX = 'auto'
      tableScroller.style.overflowY = 'auto'
      host.appendChild(tableScroller)
      controller = new TableFullscreenController(host, () => tableScroller)

      controller.set(true)

      expect(tableScroller.style.overflowX).toBe('auto')
      expect(tableScroller.style.overflowY).toBe('auto')
    })

    it('does not lock an unrelated connected scroller', () => {
      controller.destroy()
      const unrelatedScroller = document.createElement('div')
      unrelatedScroller.style.overflowX = 'auto'
      unrelatedScroller.style.overflowY = 'scroll'
      document.body.appendChild(unrelatedScroller)
      controller = new TableFullscreenController(host, () => unrelatedScroller)

      controller.set(true)

      expect(unrelatedScroller.style.overflowX).toBe('auto')
      expect(unrelatedScroller.style.overflowY).toBe('scroll')
      unrelatedScroller.remove()
    })
  })

  describe('editor scroll anchor', () => {
    let scrollContainer: HTMLElement
    let frameCallbacks: FrameRequestCallback[]
    let documentTop: number

    beforeEach(() => {
      controller.destroy()
      scrollContainer = document.createElement('div')
      scrollContainer.appendChild(host)
      document.body.appendChild(scrollContainer)
      let scrollTop = 1_000
      Object.defineProperty(scrollContainer, 'scrollTop', {
        configurable: true,
        get: () => scrollTop,
        set: value => { scrollTop = value },
      })
      documentTop = 1_200
      frameCallbacks = []

      spyOn(scrollContainer, 'getBoundingClientRect').and.returnValue({
        top: 0,
        right: 800,
        bottom: 600,
        left: 0,
        width: 800,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      })
      spyOn(host, 'getBoundingClientRect').and.callFake(() => ({
        top: host.classList.contains('is-fullscreen') ? 0 : documentTop - scrollContainer.scrollTop,
        right: 800,
        bottom: 400,
        left: 0,
        width: 800,
        height: 200,
        x: 0,
        y: host.classList.contains('is-fullscreen') ? 0 : documentTop - scrollContainer.scrollTop,
        toJSON: () => undefined,
      }))
      spyOn(window, 'requestAnimationFrame').and.callFake(callback => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      })
      spyOn(window, 'cancelAnimationFrame')
      controller = new TableFullscreenController(host, () => scrollContainer)
    })

    afterEach(() => {
      scrollContainer.remove()
    })

    it('restores the pre-fullscreen visual position after the table re-enters normal flow', () => {
      controller.set(true)
      // A very tall fixed table leaves normal flow, so the browser can clamp the
      // editor to the now much smaller scrollHeight while fullscreen is open.
      scrollContainer.scrollTop = 300

      controller.set(false)

      expect(scrollContainer.scrollTop).toBe(1_000)
    })

    it('keeps correcting the same anchor while pagination settles on later frames', () => {
      controller.set(true)
      scrollContainer.scrollTop = 300
      controller.set(false)
      expect(scrollContainer.scrollTop).toBe(1_000)

      // Pagination restores page gaps after the fullscreen class is removed.
      documentTop += 80
      frameCallbacks.shift()!(0)
      expect(scrollContainer.scrollTop).toBe(1_080)

      frameCallbacks.shift()!(16)
      frameCallbacks.shift()!(32)
      expect(frameCallbacks).toHaveSize(0)
    })
  })

  describe('destroy', () => {
    it('exits fullscreen and cleans up body class', () => {
      controller.set(true)
      controller.destroy()
      expect(document.body.classList.contains('bc-table-fullscreen-lock')).toBe(false)
    })

    it('is safe to call twice', () => {
      controller.destroy()
      expect(() => controller.destroy()).not.toThrow()
    })

    it('restores the resolved background scroller when destroyed fullscreen', () => {
      controller.destroy()
      const scrollContainer = document.createElement('div')
      scrollContainer.style.overflow = 'auto'
      scrollContainer.appendChild(host)
      document.body.appendChild(scrollContainer)
      controller = new TableFullscreenController(host, () => scrollContainer)

      controller.set(true)
      expect(getComputedStyle(scrollContainer).overflowX).toBe('hidden')

      controller.destroy()
      expect(scrollContainer.style.overflow).toBe('auto')
      expect(scrollContainer.style.getPropertyValue('overflow-x')).toBe('auto')
      expect(scrollContainer.style.getPropertyValue('overflow-y')).toBe('auto')
      scrollContainer.remove()
    })
  })

  describe('global singleton', () => {
    it('entering a new fullscreen exits the previous one', () => {
      const hostB = document.createElement('div')
      document.body.appendChild(hostB)
      const controllerB = new TableFullscreenController(hostB)

      controller.set(true)
      controllerB.set(true)

      expect(controller.isFullscreen).toBe(false)
      expect(controllerB.isFullscreen).toBe(true)
      expect(host.classList.contains('is-fullscreen')).toBe(false)
      expect(hostB.classList.contains('is-fullscreen')).toBe(true)

      controllerB.destroy()
      hostB.remove()
    })
  })

  describe('Escape key', () => {
    it('Escape while fullscreen exits', () => {
      controller.set(true)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(controller.isFullscreen).toBe(false)
    })

    it('Escape while not fullscreen does not flip state', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(controller.isFullscreen).toBe(false)
    })

    it('non-Escape key while fullscreen is ignored', () => {
      controller.set(true)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(controller.isFullscreen).toBe(true)
    })
  })

  describe('IME composing guard', () => {
    it('Escape during compositionstart-end window is ignored, post-end works', () => {
      controller.set(true)
      host.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(controller.isFullscreen).toBe(true)

      host.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(controller.isFullscreen).toBe(false)
    })

    it('composition events bubbling from a descendant are also caught', () => {
      const inner = document.createElement('span')
      host.appendChild(inner)

      controller.set(true)
      inner.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(controller.isFullscreen).toBe(true)
    })
  })

  describe('zoom', () => {
    it('default zoom is 1', () => {
      expect(controller.zoom$.value).toBe(1)
    })

    it('setZoom clamps to [ZOOM_MIN, ZOOM_MAX]', () => {
      controller.setZoom(10)
      expect(controller.zoom$.value).toBe(TableFullscreenController.ZOOM_MAX)
      controller.setZoom(-1)
      expect(controller.zoom$.value).toBe(TableFullscreenController.ZOOM_MIN)
    })

    it('zoomIn / zoomOut step by ZOOM_STEP', () => {
      const step = TableFullscreenController.ZOOM_STEP
      controller.zoomIn()
      expect(controller.zoom$.value).toBeCloseTo(1 + step, 3)
      controller.zoomOut()
      expect(controller.zoom$.value).toBeCloseTo(1, 3)
    })

    it('resetZoom returns to 1', () => {
      controller.setZoom(2)
      controller.resetZoom()
      expect(controller.zoom$.value).toBe(1)
    })

    it('setZoom with same value is a no-op (no emission)', () => {
      const emissions: number[] = []
      controller.zoom$.subscribe(v => emissions.push(v))
      controller.setZoom(1)
      controller.setZoom(1)
      expect(emissions).toEqual([1])
    })

    it('exiting fullscreen resets zoom to 1', () => {
      controller.set(true)
      controller.setZoom(2)
      expect(controller.zoom$.value).toBe(2)
      controller.set(false)
      expect(controller.zoom$.value).toBe(1)
    })

    it('Ctrl+wheel up zooms in while fullscreen', () => {
      controller.set(true)
      const evt = new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true })
      host.dispatchEvent(evt)
      expect(controller.zoom$.value).toBeCloseTo(1 + TableFullscreenController.ZOOM_STEP, 3)
    })

    it('Cmd+wheel down zooms out while fullscreen', () => {
      controller.set(true)
      controller.setZoom(1.5)
      const evt = new WheelEvent('wheel', { metaKey: true, deltaY: 100, bubbles: true, cancelable: true })
      host.dispatchEvent(evt)
      expect(controller.zoom$.value).toBeCloseTo(1.5 - TableFullscreenController.ZOOM_STEP, 3)
    })

    it('wheel without Ctrl/Cmd is ignored (normal scroll)', () => {
      controller.set(true)
      const evt = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
      host.dispatchEvent(evt)
      expect(controller.zoom$.value).toBe(1)
    })

    it('Ctrl+wheel outside fullscreen does not zoom (handler not attached)', () => {
      const evt = new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true })
      host.dispatchEvent(evt)
      expect(controller.zoom$.value).toBe(1)
    })
  })
})
