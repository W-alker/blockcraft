import {
  hasOpenOwnedSubOverlay,
  isObjectToolbarOwnedTarget,
} from './object-toolbar-interaction'

describe('isObjectToolbarOwnedTarget', () => {
  let toolbar: HTMLElement
  let attached: HTMLElement[]

  const attach = (element: HTMLElement): HTMLElement => {
    document.body.appendChild(element)
    attached.push(element)
    return element
  }

  beforeEach(() => {
    attached = []
    toolbar = attach(document.createElement('div'))
  })

  afterEach(() => {
    attached.forEach(element => element.remove())
  })

  it('owns targets inside the toolbar element', () => {
    const child = document.createElement('button')
    toolbar.appendChild(child)
    expect(isObjectToolbarOwnedTarget(toolbar, child)).toBeTrue()
  })

  it('rejects null targets and missing toolbars', () => {
    expect(isObjectToolbarOwnedTarget(toolbar, null)).toBeFalse()
    expect(isObjectToolbarOwnedTarget(undefined, toolbar)).toBeFalse()
    expect(isObjectToolbarOwnedTarget(toolbar, document.body)).toBeFalse()
  })

  it('owns a sibling color-picker pane only while its control is open', () => {
    const pane = attach(document.createElement('div'))
    pane.className = 'cs-color-picker-overlay-pane'
    const panel = document.createElement('div')
    panel.className = 'cs-color-picker-panel'
    pane.appendChild(panel)

    expect(isObjectToolbarOwnedTarget(toolbar, panel)).toBeFalse()

    const picker = document.createElement('cs-color-picker')
    picker.className = 'cs-color-picker-open'
    toolbar.appendChild(picker)
    expect(isObjectToolbarOwnedTarget(toolbar, panel)).toBeTrue()
  })

  it('owns overlays that share a float-binding id with the toolbar', () => {
    const trigger = document.createElement('div')
    trigger.setAttribute('data-float-binding', 'true')
    trigger.setAttribute('data-float-id', 'chain-1')
    toolbar.appendChild(trigger)

    const overlay = document.createElement('div')
    overlay.setAttribute('data-float-binding', 'true')
    overlay.setAttribute('data-float-id', 'chain-1')
    const item = document.createElement('button')
    overlay.appendChild(item)
    attach(overlay)

    expect(isObjectToolbarOwnedTarget(toolbar, item)).toBeTrue()

    overlay.setAttribute('data-float-id', 'other-chain')
    expect(isObjectToolbarOwnedTarget(toolbar, item)).toBeFalse()
  })

  it('reports an open owned sub-overlay only for a matching float chain', () => {
    const trigger = document.createElement('div')
    trigger.setAttribute('data-float-binding', 'true')
    trigger.setAttribute('data-float-id', 'chain-9')
    toolbar.appendChild(trigger)

    expect(hasOpenOwnedSubOverlay(toolbar)).toBeFalse()

    const container = attach(document.createElement('div'))
    container.className = 'cdk-overlay-container'
    const pane = document.createElement('div')
    pane.setAttribute('data-float-binding', 'true')
    pane.setAttribute('data-float-id', 'chain-9')
    container.appendChild(pane)

    expect(hasOpenOwnedSubOverlay(toolbar)).toBeTrue()

    pane.setAttribute('data-float-id', 'other-chain')
    expect(hasOpenOwnedSubOverlay(toolbar)).toBeFalse()
  })
})
