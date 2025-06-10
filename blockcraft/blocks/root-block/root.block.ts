import {ChangeDetectionStrategy, Component, HostListener} from "@angular/core";
import {BaseBlockComponent, closetBlockId} from "../../framework";
import {RootBlockModel} from "./index";
import {BehaviorSubject, fromEvent, skip, take, takeUntil} from "rxjs";
import {BlockNodeType} from "../../framework";

@Component({
  selector: 'div.root-block[data-blockcraft-root="true"]',
  template: `
    <ng-container #childrenContainer></ng-container>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RootBlockComponent extends BaseBlockComponent<RootBlockModel> {
  @HostListener('contextmenu', ['$event'])
  onContextMenu(event: MouseEvent) {
    event.preventDefault()
  }

  @HostListener('mousedown', ['$event'])
  onSelectStart(event: MouseEvent) {
    if (event.target === this.hostElement) {
      event.preventDefault()
    }
  }

  private selecting$ = new BehaviorSubject<'end' | 'start' | 'moving'>("end")
  private selectingBlock: BlockCraft.BlockComponent | null = null

  @HostListener('selectstart', ['$event'])
  onSelectstart(event: Event) {
    const id = closetBlockId(event.target as HTMLElement)
    if (!id) return
    const selectStartBlock = this.doc.getBlockById(id)
    this.selecting$.next('start')

    const leaveListen = (block: BlockCraft.BlockComponent) => {
      this.selectingBlock = block
      block.hostElement.classList.add('selecting')

      if (block.nodeType !== BlockNodeType.root) {
        fromEvent(block.hostElement, 'mouseleave').pipe(take(1), takeUntil(this.selecting$.pipe(skip(1)))).subscribe(e => {
          document.getSelection()!.selectAllChildren(block.hostElement)
          const parentBlock = block.parentBlock!
          leaveListen(parentBlock)
        })
      }
    }

    // TODO
    fromEvent(selectStartBlock.hostElement, 'mouseleave').pipe(take(1), takeUntil(this.selecting$.pipe(skip(1))))
      .subscribe(() => {
        if (this.selecting$.value !== 'start') return
        this.selecting$.next('moving')

        leaveListen(selectStartBlock!.parentBlock!)
      })
  }

  @HostListener('document:pointerup', ['$event'])
  onSelectEnd(event: MouseEvent) {
    this.selecting$.next('end')
    if (!this.selectingBlock) return
    this.selectingBlock.hostElement.classList.remove('selecting')
    this.selectingBlock = null
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();

    this.doc.readonlySwitch$.pipe(takeUntil(this.onDestroy$)).subscribe(v => {
      this.hostElement.setAttribute('contenteditable', v ? 'false' : 'true')
      v ? this.hostElement.classList.add('readonly') : this.hostElement.classList.remove('readonly')
    })

    this.doc.event.add('keyDown', ctx => {
      if (!this.selectingBlock) return
      const evt = ctx.getDefaultEvent<KeyboardEvent>()
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(evt.key)) {
        this.selectingBlock.hostElement.classList.remove('selecting')
      }
    }, {flavour: "root"})
  }

}
