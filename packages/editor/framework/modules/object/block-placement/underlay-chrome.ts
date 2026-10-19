import {DomPortal} from '@angular/cdk/portal'
import {resolvePlacementBox} from './geometry'

/** @internal Lift only the existing controls out of the under-content stacking context. */
export class UnderlayObjectChrome {
  static mount(
    doc: BlockCraft.Doc,
    block: BlockCraft.BlockComponent,
    startDrag: (event: PointerEvent) => void,
  ): (() => void) | null {
    const chrome = block.hostElement.querySelector<HTMLElement>('shape-resizer')
    const surface = chrome?.parentElement
    const scrollContainer = doc.scrollContainer
    const ownerWindow = block.hostElement.ownerDocument.defaultView
    if (!chrome || !surface || !scrollContainer || !ownerWindow || !doc.overlayService?.overlay ||
      chrome.closest('[data-block-id]') !== block.hostElement) return null
    const overlay = doc.overlayService.overlay.create({
      scrollStrategy: doc.overlayService.overlay.scrollStrategies.noop(),
    })
    const pane = overlay.overlayElement
    const viewport = overlay.hostElement
    pane.setAttribute('data-bc-underlay-chrome', block.id)
    pane.setAttribute('data-bc-placement-pick-ignore', '')
    pane.setAttribute('data-bc-selection-interaction-ignore', '')
    pane.style.pointerEvents = 'none'
    pane.style.transformOrigin = 'center'
    viewport.style.position = 'fixed'
    viewport.style.overflow = 'hidden'
    viewport.style.pointerEvents = 'none'
    const display = chrome.style.display
    chrome.style.display = 'block'
    overlay.attach(new DomPortal(chrome))
    // CDK enables pane hit-testing on attach; only the controls may intercept
    // input. The transparent frame interior must still reach the prose below.
    pane.style.pointerEvents = 'none'
    const releaseLease = doc.virtualization.acquireBlockViewLease([block.id])

    let frame = 0
    let disposed = false
    const update = () => {
      frame = 0
      if (disposed || !surface.isConnected) return
      // All geometry reads precede writes; resize/rotation previews, scroll and
      // view-scale changes share one frame, with no idle polling.
      const rect = surface.getBoundingClientRect()
      const clip = scrollContainer.getBoundingClientRect()
      const width = surface.offsetWidth
      const height = surface.offsetHeight
      const scale = resolvePlacementBox(block.hostElement)?.visualScale ?? 1
      const style = ownerWindow.getComputedStyle(surface)
      const transform = style.transform
      const matrix = new ownerWindow.DOMMatrixReadOnly(transform === 'none' ? undefined : transform)
      const colors = ['--bc-active-color', '--bc-bg-primary'].map(property =>
        [property, style.getPropertyValue(property)] as const)
      viewport.style.left = `${clip.left}px`
      viewport.style.top = `${clip.top}px`
      viewport.style.width = `${clip.width}px`
      viewport.style.height = `${clip.height}px`
      pane.style.left = `${rect.left + rect.width / 2 - width / 2 - clip.left}px`
      pane.style.top = `${rect.top + rect.height / 2 - height / 2 - clip.top}px`
      pane.style.width = `${width}px`
      pane.style.height = `${height}px`
      pane.style.transform = `matrix(${matrix.a * scale}, ${matrix.b * scale}, ${matrix.c * scale}, ${matrix.d * scale}, 0, 0)`
      for (const [property, value] of colors) pane.style.setProperty(property, value)
    }
    const schedule = () => {
      if (!disposed && !frame) frame = ownerWindow.requestAnimationFrame(update)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (block.isReadonly || doc.isReadonly) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      const target = event.target
      if (!(target instanceof Element) || !target.closest('[data-bc-object-drag-handle]')) return
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      const ids = doc.placement.getAbsoluteObjectSelectionIds()
      if (!ids || ids.length < 2 || !ids.includes(block.id)) doc.selection.selectBlock(block)
      startDrag(event)
    }
    const observer = new ownerWindow.MutationObserver(schedule)
    observer.observe(surface, {attributes: true, attributeFilter: ['style']})
    // Placement previews and group reflow move hosts rather than the surface.
    for (let ancestor: HTMLElement | null = surface.parentElement;
      ancestor && ancestor !== doc.root.hostElement.parentElement; ancestor = ancestor.parentElement) {
      observer.observe(ancestor, {attributes: true, attributeFilter: ['style']})
    }
    const resizeObserver = new ownerWindow.ResizeObserver(schedule)
    resizeObserver.observe(surface)
    resizeObserver.observe(scrollContainer)
    const scaleSub = doc.viewScale.change$.subscribe(schedule)
    const themeSub = doc.themeChange$.subscribe(schedule)
    const printMedia = ownerWindow.matchMedia('print')
    const syncPrint = () => { pane.style.visibility = printMedia.matches ? 'hidden' : '' }
    printMedia.addEventListener('change', syncPrint)
    syncPrint()
    pane.addEventListener('pointerdown', onPointerDown, true)
    ownerWindow.addEventListener('scroll', schedule, true)
    ownerWindow.addEventListener('resize', schedule)
    update()

    return () => {
      if (disposed) return
      disposed = true
      if (frame) ownerWindow.cancelAnimationFrame(frame)
      observer.disconnect()
      resizeObserver.disconnect()
      scaleSub.unsubscribe()
      themeSub.unsubscribe()
      printMedia.removeEventListener('change', syncPrint)
      pane.removeEventListener('pointerdown', onPointerDown, true)
      ownerWindow.removeEventListener('scroll', schedule, true)
      ownerWindow.removeEventListener('resize', schedule)
      // DomPortal restores the live component before its owning view detaches.
      overlay.dispose()
      chrome.style.display = display
      releaseLease()
    }
  }
}
