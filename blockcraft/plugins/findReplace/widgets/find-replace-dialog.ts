import {Component, DestroyRef, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild} from '@angular/core'
import {FormsModule} from "@angular/forms";
import {NgIf} from "@angular/common";
import {debounce, deltaToString, nextTick, performanceTest} from "../../../global";
import {
  BlockNodeType,
  DeltaOperation,
  EditableBlockComponent,
  FakeRange,
  STR_ZERO_WIDTH_SPACE
} from "../../../framework";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";

interface IMatched {
  block: BlockCraft.BlockComponent,
  index: number,
  length: number,
  fakeRange: FakeRange
}

@Component({
  selector: 'find-replace',
  templateUrl: './find-replace-dialog.html',
  styleUrls: ['./find-replace-dialog.scss'],
  standalone: true,
  imports: [
    FormsModule,
    NgIf
  ],
})
export class FindReplaceDialog {
  @Input()
  doc!: BlockCraft.Doc

  @Output()
  onClose = new EventEmitter<void>()

  @ViewChild('findInput', {read: ElementRef}) findInput!: ElementRef<HTMLInputElement>
  @ViewChild('wrapper', {read: ElementRef}) wrapper!: ElementRef<HTMLInputElement>

  findText = ''
  replaceText = ''

  matchIndex = 0
  matchedList: IMatched[] = []

  matchedBlockMap = new Map<string, IMatched[]>()

  constructor(
    private destroyRef: DestroyRef
  ) {
  }

  ngOnInit() {
    // 检测新增和删除节点变化
    this.doc.onChildrenUpdate$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(evt => {
      if (!this.findText) return
      this.cancelHighlight()

      nextTick().then(() => {

        evt.transactions.forEach(t => {
          if (t.deleted) {
            const parentBlock = t.block
            const childIds = parentBlock.childrenIds
            // 如果有已匹配的block的父block是有删除操作的block, 需要删除已匹配的
            for (const m of this.matchedBlockMap.values()) {
              if (m[0].block.parentId === parentBlock.id && !childIds.includes(m[0].block.id)) {
                this.clearOldMatchesMark(m[0].block.id)
              }
            }
          }

          if (t.inserted) {
            t.inserted.forEach(block => {
              if (!this.doc.isEditable(block)) return;

              // 如果是新增的元素，需要重新查找
              const matches = this._matchBlockText(block)
              if (!matches?.length) return
              this.matchedBlockMap.set(block.id, matches)
            })
          }
        })

        this.resortMatches()
        this.highlightCurrent(false)

      })

    })

    // 检测文本变化
    this.doc.onTextUpdate$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(evt => {
      if (!this.findText) return

      if (!this.matchedList.length && !this.matchedBlockMap.size) {
        this.findAll()
        return
      }

      this.cancelHighlight()
      nextTick().then(() => {
        evt.transactions.forEach(t => {
          const block = t.block
          this.clearOldMatchesMark(block.id)
          this._matchBlockText(block)
        })
        this.resortMatches()
        this.highlightCurrent(false)
      })
    })
  }

  ngAfterViewInit() {
    this.findInput.nativeElement.focus()
  }

  ngOnDestroy() {
    this.clearAll()
  }

  private _matchBlockText = (block: EditableBlockComponent) => {
    const text = deltaToString(block.textDeltas(), STR_ZERO_WIDTH_SPACE)
    if (!text) return null
    const matches = text.matchAll(new RegExp(this.findText, 'g'))
    const res: typeof this.matchedList[number][] = []
    for (const match of matches) {
      const fakeRange = this.doc.selection.createFakeRange({
        from: {
          blockId: block.id,
          index: match.index,
          length: this.findText.length,
          type: 'text'
        },
        to: null
      }, {bgColor: 'rgba(255, 198, 10, 0.4)'})

      res.push({
        fakeRange,
        index: match.index,
        length: this.findText.length,
        block: block,
      })
    }
    if (res.length) {
      this.matchedBlockMap.set(block.id, res)
    }
    return res
  }

  clearOldMatchesMark(id: string) {
    const matches = this.matchedBlockMap.get(id)
    if (!matches) return
    matches.forEach(m => m.fakeRange.destroy())
    this.matchedBlockMap.delete(id)
  }

  resortMatches() {
    // 重新排序，先DFS排出已匹配节点顺序
    const ids: string[] = []
    const find = (b: BlockCraft.BlockComponent) => {
      const childIds = b.childrenIds
      for (const childId of childIds) {
        if (this.matchedBlockMap.has(childId)) {
          ids.push(childId)
          continue
        }
        const b = this.doc.getBlockById(childId)
        if (b.nodeType === BlockNodeType.block) {
          find(b)
        }
      }
    }
    find(this.doc.root)

    const matchedList: IMatched[] = [];
    for (const id of ids) {
      const list = this.matchedBlockMap.get(id);
      if (list) matchedList.push(...list);
    }
    this.matchedList = matchedList;
  }

  clearAll() {
    this.matchIndex = 0
    this.matchedList.forEach(m => {
      m.fakeRange.destroy()
    })
    this.matchedList = []
  }

  @performanceTest()
  findAll() {
    this.clearAll()
    if (!this.findText) return

    const find = (b: BlockCraft.BlockComponent) => {
      b.getChildrenBlocks().forEach(b => {
        if (b.nodeType === 'void') return
        if (b.nodeType === 'editable') {
          const matches = this._matchBlockText(b as EditableBlockComponent)
          matches?.length && this.matchedList.push(...matches)
        } else {
          find(b)
        }
      })
    }
    find(this.doc.root)

    if (this.matchedList.length) {
      this.highlightCurrent()
    }
  }

  findNext() {
    this.findByStep(1)
  }

  findPrev() {
    this.findByStep(-1)
  }

  findByStep(step: 1 | -1) {
    if (!this.matchedList.length) return
    this.cancelHighlight()
    this.matchIndex += step
    if (this.matchIndex >= this.matchedList.length) {
      this.matchIndex = 0
    }
    if (this.matchIndex < 0) {
      this.matchIndex = this.matchedList.length - 1
    }
    this.highlightCurrent()
  }

  cancelHighlight() {
    this.matchedList[this.matchIndex]?.fakeRange.setColor({bgColor: 'rgba(255, 198, 10, 0.4)'})
  }

  highlightCurrent(withScroll = true) {
    if (!this.matchedList.length) return
    if (this.matchIndex >= this.matchedList.length) {
      this.matchIndex = this.matchedList.length - 1
    }
    const match = this.matchedList[this.matchIndex]
    match.fakeRange.setColor({bgColor: 'rgba(245, 74, 69, .4)'})
    withScroll && match.block.hostElement.scrollIntoView({behavior: 'smooth', block: 'nearest', inline: 'center'})
  }

  replaceOne() {
    const match = this.matchedList[this.matchIndex]
    this._replace(match)
    // this.matchedList.splice(this.matchIndex, 1)
    // if (this.matchedList.length) {
    //   this.highlightCurrent()
    // }
  }

  private _replace(match: IMatched) {
    if (!this.doc.isEditable(match.block)) return
    match.block.replaceText(match.index, match.length, this.replaceText)
    // match.fakeRange.destroy()
  }

  replaceAll() {
    this.doc.crud.transact(() => {
      this.matchedBlockMap.forEach((matched, bid) => {
        const delta: DeltaOperation[] = []
        let r = 0
        // 将不连续匹配组装成delta
        matched.forEach(m => {
          delta.push({
            retain: m.index - r,
          })
          delta.push({
            delete: m.length,
          })
          delta.push({
            insert: this.replaceText,
          })
          r = m.index + m.length
        })
        const block = this.doc.getBlockById(bid)
        if (!this.doc.isEditable(block)) return
        block.applyDeltaOperations(delta)
      })
      this.matchedList.forEach(v => {
        v.fakeRange.destroy()
      })
      this.matchedList = []
      this.matchedBlockMap.clear()
    })
  }

  onFindTextChange = debounce(() => {
    this.findAll()
  }, 500)

  private _transformX = 0
  private _transformY = 0

  private _x = 0
  private _y = 0

  @HostListener('mousedown', ['$event'])
  onMouseDown(e: MouseEvent) {
    if (e.target !== this.wrapper.nativeElement) return
    e.preventDefault()
    this._x = e.clientX
    this._y = e.clientY
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('mouseup', this.onMouseUp)
  }

  onMouseMove = (e: MouseEvent) => {
    e.preventDefault()
    this._transformX += e.clientX - this._x
    this._transformY += e.clientY - this._y
    this._x = e.clientX
    this._y = e.clientY
    this.wrapper.nativeElement.style.transform = `translate(${this._transformX}px, ${this._transformY}px)`
  }

  onMouseUp = () => {
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('mouseup', this.onMouseUp)
  }

}
