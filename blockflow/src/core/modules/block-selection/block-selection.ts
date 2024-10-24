import {fromEvent, Subscription, throttleTime} from "rxjs";
import {Config} from "./config";

export class BlockSelection {

  private host: HTMLElement = this.config.host
  private document: Document = this.config.document

  private baseHostRect!: DOMRect

  private mouseStartPos!: { x: number, y: number } | null
  private mousePos!: { x: number, y: number } | null
  private triggerElement!: HTMLElement | null

  private store = new Set<Element>()

  private selectionAreaEle: HTMLElement | null = null
  private onSelectingSub!: Subscription | null

  private selectableElements: NodeListOf<Element> | HTMLCollection | null = null

  get storeSize() {
    return this.store.size
  }

  get selectedElements() {
    return this.store
  }

  private readonly eventListeners: {
    start: ((elements: Set<Element>) => void)[]
    move: ((elements: Set<Element>) => void)[]
    end: ((elements: Set<Element>) => void)[]
  } = {} as any

  private isSelecting = false

  constructor(public config: Config) {
    this.bindEvents()
  }

  selectElement(element: Element) {
    this.store.add(element)
    this.config.onItemSelect(element)
  }

  on(event: 'start' | 'move' | 'end', callback: (elements: Set<Element>) => void) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = []
    }
    this.eventListeners[event].push(callback)
  }

  private bindEvents() {
    this.host.addEventListener('mousedown', this.onMousedown)
  }

  onMousedown = (event: MouseEvent) => {
    if (this.config.enable) return
    this.baseHostRect = this.host.getBoundingClientRect()
    // clear previous selection
    this.store.forEach(element => this.config.onItemUnselect(element))
    this.store.clear()
    // if the button is not left button, return
    if (event.button !== 0 && this.config.onlyLeftButton) return

    const target = event.target as HTMLElement
    // if the target is input or textarea, return
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    // if the target is content editable, bind the special mousemove event to the target
    if (target.isContentEditable) {
      this.triggerElement = target
      this.host.addEventListener('mousemove', this.onContentEditableMouseMove)
    } else {
      this.document.body.addEventListener('mousemove', this.onMousemove)
    }
    this.document.body.addEventListener('mouseup', this.onMouseup)
    this.mouseStartPos = {x: event.clientX, y: event.clientY - this.baseHostRect.y}
  }

  onContentEditableMouseMove = (event: MouseEvent) => {
    if (!this.triggerElement) {
      this.host.removeEventListener('mousemove', this.onContentEditableMouseMove)
      return
    }
    const triggerRect = this.triggerElement.getBoundingClientRect()

    if (event.target !== this.triggerElement && (event.clientY < triggerRect.top - 20 || event.clientY > triggerRect.bottom + 20)) {
      this.host.removeEventListener('mousemove', this.onContentEditableMouseMove)
      this.startSelecting()
    }
  }

  onMousemove = (event: MouseEvent) => {
    // if the mouse button is not pressed or the mouseStartPos is not set, return
    if (!event.buttons || !this.mouseStartPos) return
    event.preventDefault()
    // sensitivity
    if (Math.abs(event.clientX - this.mouseStartPos.x) < this.config.sensitivity || Math.abs(event.clientY - this.mouseStartPos.y) < this.config.sensitivity) return
    this.startSelecting()
    this.document.body.removeEventListener('mousemove', this.onMousemove)
  }

  private startSelecting() {
    this.host.style.pointerEvents = 'none'
    this.createSelectionArea()
    this.document.getSelection()!.removeAllRanges()
    this.host.focus({preventScroll: true})
    this.isSelecting = true

    this.onSelectingSub =
      fromEvent(this.document.body, 'mousemove').pipe(throttleTime(20))
        .subscribe((event) => {
          this.onMouseMovePicking(event as MouseEvent)
        })

    this.selectableElements = this.config.selectable ? this.host.querySelectorAll(this.config.selectable) : this.host.children
    if (this.eventListeners.start?.length) {
      this.eventListeners.start.forEach(callback => callback(this.selectedElements))
    }
  }

  onMouseMovePicking = (event: MouseEvent) => {
    const eleRect = this.host.getBoundingClientRect()
    this.mousePos = {x: event.clientX, y: event.clientY - eleRect.y}
    this.repaintSelectionArea()
    this.calculateSelectionAreaContain()
    if (this.eventListeners.move?.length) {
      this.eventListeners.move.forEach(callback => callback(this.selectedElements))
    }
  }

  onMouseup = (event: MouseEvent) => {
    event.preventDefault()
    this.mouseStartPos = null
    this.document.body.removeEventListener('mouseup', this.onMouseup)
    this.document.body.removeEventListener('mousemove', this.onMousemove)
    if (this.triggerElement) {
      this.triggerElement = null
      this.host.removeEventListener('mousemove', this.onContentEditableMouseMove)
    }
    if (this.isSelecting) this.endSelect()
  }

  private lastCalculateIndex = 0

  calculateSelectionAreaContain() {
    // console.time('calculateSelectionAreaContain')
    let flag = 2
    let i = 0
    this.store.clear()
    while (flag > 0) {
      const element = this.selectableElements![i]
      if(i >= this.selectableElements!.length) break
      i++
      if (!element) continue
      const rect = (element as HTMLElement).getBoundingClientRect()
      if (isIntersect(this.selectionAreaEle!.getBoundingClientRect(), rect)) {
        this.config.onItemSelect(element)
        this.store.add(element)
        if (flag === 2) flag--
      } else {
        if (flag === 1) flag--
        this.config.onItemUnselect(element)
      }
    }
    // unselect the elements that are selected before but not selected now
    if(i < this.lastCalculateIndex) {
      for(let j = i; j < this.lastCalculateIndex; j++) {
        const element = this.selectableElements![j]
        if (!element) continue
        this.config.onItemUnselect(element)
      }
    }
    this.lastCalculateIndex = i
    // console.timeEnd('calculateSelectionAreaContain')
  }

  endSelect() {
    // @ts-ignore
    this.host.style.pointerEvents = null
    this.onSelectingSub?.unsubscribe()
    this.removeSelectionArea()
    this.selectableElements = null

    if (this.eventListeners.end?.length) {
      this.eventListeners.end.forEach(callback => callback(this.selectedElements))
    }
  }

  createSelectionArea() {
    const area = this.document.createElement('div')
    area.className = this.config.selectionAreaClass
    area.style.position = 'absolute'
    this.host.appendChild(area)
    this.selectionAreaEle = area
  }

  repaintSelectionArea() {
    if (!this.selectionAreaEle || !this.mousePos || !this.mouseStartPos) return
    this.selectionAreaEle.style.cssText = `
      position: absolute;
      width: ${Math.abs(this.mousePos.x - this.mouseStartPos.x)}px;
      height: ${Math.abs(this.mousePos.y - this.mouseStartPos.y)}px;
      left: ${Math.min(this.mousePos.x, this.mouseStartPos.x) - this.baseHostRect.left}px;
      top: ${Math.min(this.mousePos.y, this.mouseStartPos.y)}px;`
  }

  removeSelectionArea() {
    this.selectionAreaEle?.remove()
  }
}

const isIntersect = (rect1: DOMRect, rect2: DOMRect) => {
  return !(rect1.right < rect2.left || rect1.left > rect2.right || rect1.bottom < rect2.top || rect1.top > rect2.bottom)
}
