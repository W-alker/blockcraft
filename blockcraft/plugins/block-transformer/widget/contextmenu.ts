import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component, DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  Output
} from "@angular/core";
import { NgForOf, NgTemplateOutlet } from "@angular/common";
import { MatIcon } from "@angular/material/icon";
import { BLOCK_CREATOR_SERVICE_TOKEN, BlockNodeType, EditableBlockComponent } from "../../../framework";
import { debounce } from "../../../global";

interface IContextMenuOption {
  flavour: string
  type: 'block' | 'tool' | 'heading'
  metadata: {
    label: string
    icon?: string
    svgIcon?: string
    [key: string]: any
  }
}

const HEADING_LIST: IContextMenuOption[] = [
  { metadata: { label: '一级标题', icon: 'bc_icon bc_biaoti_1', heading: 1 }, flavour: 'heading-one', type: "heading" },
  { metadata: { label: '二级标题', icon: 'bc_icon bc_biaoti_2', heading: 2 }, flavour: 'heading-two', type: "heading" },
  { metadata: { label: '三级标题', icon: 'bc_icon bc_biaoti_3', heading: 3 }, flavour: 'heading-three', type: "heading" },
  { metadata: { label: '四级标题', icon: 'bc_icon bc_biaoti_4', heading: 4 }, flavour: 'heading-four', type: "heading" },
]
const TransformReg = /^[\/、].*/

@Component({
  selector: 'block-transformer-contextmenu',
  template: `
    <ul class="list" (mousedown)="onMouseDown($event)" (mousemove)="onMouseMove()" (mouseover)="onMouseOver($event)">
      @for (item of list; track item.flavour; let idx = $index) {
        <li class="list__item" [class.active]="activeIdx === idx" [attr.data-index]="idx">
          @if (item.metadata.svgIcon) {
            <mat-icon [svgIcon]="item.metadata.svgIcon" style="width: 1em; height: 1em"></mat-icon>
          } @else {
            <i [class]="item.metadata.icon"></i>
          }
          <span>{{ item.metadata.label }}</span>
        </li>
      }
    </ul>
  `,
  styleUrls: ['contextmenu.scss'],
  standalone: true,
  imports: [
    NgForOf,
    NgTemplateOutlet,
    MatIcon
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': `'bc-scrollable-container'`
  }
})
export class BlockTransformContextMenu {
  @Input() doc!: BlockCraft.Doc
  @Input() activeBlock!: EditableBlockComponent

  @Output() close$ = new EventEmitter<boolean>()

  list: IContextMenuOption[] = []
  protected activeIdx = 0;
  private isKeyboardNavigating = false;

  constructor(
    public readonly cdr: ChangeDetectorRef,
    public readonly host: ElementRef<HTMLElement>,
    public readonly destroyRef: DestroyRef
  ) {
  }

  ngOnInit() {
    const parentBlockSchema = this.doc.schemas.get(this.activeBlock.parentBlock!.flavour)!
    const blocks: IContextMenuOption[] = this.doc.schemas.getSchemaList()
      .filter(v => !v.metadata.isLeaf && !['paragraph', 'root'].includes(v.flavour)
        && this.doc.schemas.isValidChildren(v.flavour, parentBlockSchema))
      .map(v => ({ flavour: v.flavour, metadata: v.metadata, type: 'block' }))
    const listAll = HEADING_LIST.concat(blocks)

    this.list = listAll

    const textObserver = debounce(() => {
      if (this.doc.event.status.isComposing) return;
      const text = this.activeBlock.textContent()
      if (!text || !TransformReg.test(text)) {
        this.close$.next(true)
        return
      }
      const searchText = text.slice(1).toLowerCase()
      const matchedItems = listAll.filter(v => v.metadata.label.startsWith(searchText) || v.flavour.toLowerCase().startsWith(searchText))
      if (!matchedItems.length) {
        this.close$.next(true)
        return
      }
      this.list = matchedItems
      this.activeIdx = 0
      this.cdr.markForCheck()
    }, 300)

    this.activeBlock.yText.observe(textObserver)

    const hotKeyEvents = [
      this.doc.event.bindHotkey({ key: 'Escape', }, evt => {
        evt.preventDefault()
        this.close$.next(true)
        return true
      }, { blockId: this.activeBlock.id }),
      this.doc.event.bindHotkey({ key: 'Enter', }, evt => {
        evt.preventDefault()
        this.select()
        return true
      }, { blockId: this.activeBlock.id }),
      this.doc.event.bindHotkey({ key: 'ArrowUp', }, evt => {
        evt.preventDefault()
        this.selectUp()
        return true
      }, { blockId: this.activeBlock.id }),
      this.doc.event.bindHotkey({ key: 'ArrowDown' }, evt => {
        evt.preventDefault()
        this.selectDown()
        return true
      }, { blockId: this.activeBlock.id })
    ]

    this.destroyRef.onDestroy(() => {
      hotKeyEvents.forEach(v => v())
      this.activeBlock.yText?.unobserve(textObserver)
    })
  }

  onMouseDown(evt: MouseEvent) {
    evt.preventDefault()
    if (evt.eventPhase === Event.AT_TARGET) {
      return
    }

    this.select()
  }

  onMouseOver(event: MouseEvent) {
    if (this.isKeyboardNavigating) return;

    const li = (event.target as HTMLElement).closest('.list__item');
    if (!li) return;

    const dataIdx = li.getAttribute('data-index');
    if (!dataIdx) return;
    const idx = parseInt(dataIdx, 10);
    if (idx === -1 || idx === this.activeIdx) return;

    this.activeIdx = idx;
  }

  onMouseMove() {
    // 一旦鼠标真的移动，说明用户正在用鼠标导航
    if (this.isKeyboardNavigating) {
      this.isKeyboardNavigating = false;
    }
  }

  selectUp() {
    this.enterKeyboardNavigation();
    this.activeIdx = (this.activeIdx - 1 + this.list.length) % this.list.length;
    this.cdr.detectChanges();
    this.scrollToActive();
  }

  selectDown() {
    this.enterKeyboardNavigation();
    this.activeIdx = (this.activeIdx + 1) % this.list.length;
    this.cdr.detectChanges();
    this.scrollToActive();
  }

  enterKeyboardNavigation() {
    this.isKeyboardNavigating = true;
  }

  scrollToActive() {
    this.host.nativeElement.querySelector('.list__item.active')?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    })
  }

  select() {
    if (this.activeIdx === -1) return
    const item = this.list[this.activeIdx]
    if (!item) return;

    switch (item.type) {
      case 'block':
        this.transform2Block(item.flavour as any);
        break;
      case 'heading':
        this.activeBlock.deleteText(0, this.activeBlock.textLength)
        this.activeBlock.updateProps({
          heading: item.metadata['heading']
        })
        break;
    }

    this.close$.next(true)
  }

  transform2Block(flavour: BlockCraft.BlockFlavour) {
    const schema = this.doc.schemas.get(flavour)!
    if (schema.nodeType === BlockNodeType.editable) {
      const snapshot = this.doc.schemas.createSnapshot(schema.flavour, [[], this.activeBlock.props])
      this.doc.crud.replaceWithSnapshots(this.activeBlock.id, [snapshot])
        .then(() => {
          this.doc.selection.setCursorAtBlock(snapshot.id, true)
        })
      return
    }

    // TODO
    const blockCreator = this.doc.injector.get(BLOCK_CREATOR_SERVICE_TOKEN)
    blockCreator.getParamsByScheme(schema).then(params => {
      if (!params) return
      const newBlock = this.doc.schemas.createSnapshot(schema.flavour, params as any)
      newBlock.props.depth = this.activeBlock.props.depth
      this.doc.crud.replaceWithSnapshots(this.activeBlock.id, [newBlock])
        .then(() => {
          this.doc.selection.setCursorAtBlock(newBlock.id, true)
        })
    })
  }

}
