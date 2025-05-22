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
  private selectStartBlock: BlockCraft.BlockComponent | null = null

  @HostListener('selectstart', ['$event'])
  onSelectstart(event: Event) {
    const id = closetBlockId(event.target as HTMLElement)
    if (!id) return
    this.selectStartBlock = this.doc.getBlockById(id)
    this.selecting$.next('start')

    const leaveListen = (block: BlockCraft.BlockComponent) => {
      block.hostElement.classList.add('selecting')

      if (block.nodeType !== BlockNodeType.root) {
        fromEvent(block.hostElement, 'mouseleave').pipe(take(1), takeUntil(this.selecting$.pipe(skip(1)))).subscribe(() => {
          // this.doc.selection.selectBlock(block)
          document.getSelection()!.selectAllChildren(block.hostElement)
          // block.hostElement.classList.add('selected')

          fromEvent(this.hostElement, 'selectstart').pipe(take(1)).subscribe(evt => {
            if(!evt.defaultPrevented) block.hostElement.classList.remove('selected')
          })

          // this.doc.selection.nextChangeObserve().subscribe(() => {
          //   block.hostElement.classList.remove('selected')
          // })
          // block.hostElement.classList.remove('selecting')
          // document.getSelection()!.setPosition(block.hostElement, 0)

          // const parentBlock = block.parentBlock!
          // parentBlock.hostElement.classList.add('selecting')
          //
          // if (parentBlock.nodeType !== BlockNodeType.root) {
          //   fromEvent(parentBlock.hostElement, 'mouseleave').pipe(take(1), takeUntil(this.selecting$.pipe(skip(1)))).subscribe(() => {
          //     leaveListen(parentBlock)
          //   })
          // }
        })
      }
    }

    // TODO
    fromEvent(this.selectStartBlock.hostElement, 'mouseleave').pipe(take(1), takeUntil(this.selecting$.pipe(skip(1))))
      .subscribe(() => {
        if (this.selecting$.value !== 'start') return
        this.selecting$.next('moving')

        leaveListen(this.selectStartBlock!.parentBlock!)
      })
  }

  @HostListener('document:mouseup', ['$event'])
  onSelectEnd(event: MouseEvent) {
    this.selecting$.next('end')
    if (!this.selectStartBlock) return
    this.selectStartBlock!.parentBlock?.hostElement.classList.remove('selecting')
    this.selectStartBlock = null
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();

    this.doc.readonlySwitch$.pipe(takeUntil(this.onDestroy$)).subscribe(v => {
      this.hostElement.setAttribute('contenteditable', v ? 'false' : 'true')
      v ? this.hostElement.classList.add('readonly') : this.hostElement.classList.remove('readonly')
    })
  }

}
