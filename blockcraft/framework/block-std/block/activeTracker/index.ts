import {performanceTest} from "../../../../global";
import {fromEvent} from "rxjs";

export class BlockActiveTracker {
  constructor(
    public readonly vm: BlockCraft.ViewManager
  ) {
    this.vm.doc.afterInit(() => {
      this._init()
    })
  }

  get root() {
    return this.vm.doc.root
  }

  get rootElement() {
    return this.root.hostElement
  }

  private _virtualTop = document.createElement('div')
  private _virtualBottom = document.createElement('div')

  private _activeBlockIds: string[] = []
  private _ids: string[] = []
  private topIndex = 0
  private _heightArray: number[] = []
  private _heightMap: Record<string, number> = {}

  private _mutationObserver = new MutationObserver(records => {
  })

  private _resizeObserver = new ResizeObserver(entries => {
    this._handlerResize(entries)
  })

  // private _intersectionObserver = new IntersectionObserver(records => {
  //   console.log(records)
  // })

  private _init() {
    this._ids = this.root.childrenIds

    fromEvent(this.rootElement, 'scroll').subscribe(() => {
      this._handlerScroll()
    })

    this.root.yBlock.get('children').observe(event => {
      let r = 0
      event.changes.delta.forEach(delta => {
        if (delta.retain) {
          r += delta.retain
        } else if (delta.insert) {
          this._ids.splice(r, 0, ...delta.insert)
          r += delta.insert.length
        } else {
          this._ids.splice(r, delta.delete)
        }
      })
    })

    this.rootElement.prepend(this._virtualTop)
    this.rootElement.appendChild(this._virtualBottom)

    this._mutationObserver.observe(this.rootElement, {childList: true})

    Array.from(this.rootElement.children).forEach(el => {
      this._resizeObserver.observe(el, {box: 'border-box'})
    })
  }

  @performanceTest()
  private _handlerResize(entries: ResizeObserverEntry[]) {
    entries.forEach(entry => {
      const id = entry.target.getAttribute('data-block-id')!
      this._heightMap[id] = entry.borderBoxSize[0].blockSize
      // console.log(id, entry.borderBoxSize[0])
    })
  }

  @performanceTest()
  private _handlerScroll() {
    const top = this.rootElement.scrollTop

  }


}
