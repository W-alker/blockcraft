import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent, closetBlockId, UIEventStateContext} from "../../framework";
import {RootBlockModel} from "./index";
import {BehaviorSubject, fromEvent, skip, take, takeUntil} from "rxjs";
import {BlockNodeType} from "../../framework";

@Component({
  selector: 'div.root-block[data-blockcraft-root="true"]',
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.font-family]': 'props.ff',
    '(contextmenu)': 'onContextMenu($event)',
    '(mousedown)': 'onMouseDown($event)',
  }
})
export class RootBlockComponent extends BaseBlockComponent<RootBlockModel> {
  onContextMenu(event: MouseEvent) {
    if (!(this.doc as BlockCraft.Doc | undefined)) return
    event.preventDefault()
  }

  onMouseDown(event: MouseEvent) {
    if (!(this.doc as BlockCraft.Doc | undefined)) return
    if (event.target === this.hostElement) {
      event.preventDefault()
    }
  }

  private selecting$ = new BehaviorSubject<'end' | 'start' | 'moving'>("end")
  private selectingBlock: BlockCraft.BlockComponent | null = null

  override ngAfterViewInit() {
    super.ngAfterViewInit();

    const doc = this.doc as BlockCraft.Doc | undefined
    if (!doc) {
      const readonly = this.renderContext?.readonly ?? true
      this.hostElement.setAttribute('contenteditable', readonly ? 'false' : 'true')
      readonly ? this.hostElement.classList.add('readonly') : this.hostElement.classList.remove('readonly')
      return
    }

    doc.readonlySwitch$.pipe(takeUntil(this.onDestroy$)).subscribe(v => {
      this.hostElement.setAttribute('contenteditable', v ? 'false' : 'true')
      v ? this.hostElement.classList.add('readonly') : this.hostElement.classList.remove('readonly')
    })

    doc.event.add('selectStart', this.onSelectstart)
    doc.event.add('selectEnd', this.onSelectEnd)
  }

  onSelectstart = (ctx: UIEventStateContext) => {
    const doc = this.doc as BlockCraft.Doc | undefined
    if (!doc) return

    const selectState = ctx.get('selectState')
    if (selectState.trigger !== 'mouse') return;

    const event = ctx.getDefaultEvent<Event>()
    const id = closetBlockId(event.target as HTMLElement)
    if (!id) return
    const selectStartBlock = doc.getBlockById(id)
    this.selecting$.next('start')

    const leaveListen = (block: BlockCraft.BlockComponent) => {
      this.selectingBlock = block
      block.hostElement.classList.add('selecting')

      if (block.nodeType !== BlockNodeType.root) {
        fromEvent(block.hostElement, 'pointerleave').pipe(take(1), takeUntil(this.selecting$.pipe(skip(1)))).subscribe(e => {
          block.hostElement.classList.remove('selecting')
          document.getSelection()!.selectAllChildren(block.hostElement)

          // TODO 这样实现不太好
          if (block.flavour === 'table-cell') return
          const parentBlock = block.parentBlock!
          leaveListen(parentBlock)
        })
      }
    }

    // TODO
    fromEvent(selectStartBlock.hostElement, 'pointerleave').pipe(take(1), takeUntil(this.selecting$.pipe(skip(1))))
      .subscribe(() => {
        if (this.selecting$.value !== 'start') return

        leaveListen(selectStartBlock!.parentBlock!)
      })
  }

  onSelectEnd = () => {
    this.selecting$.next('end')
    if (!this.selectingBlock) return
    this.selectingBlock.hostElement.classList.remove('selecting')
    this.selectingBlock = null
  }

}
