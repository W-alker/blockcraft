import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef, ElementRef,
  EventEmitter,
  Input,
  Output, ViewChild
} from "@angular/core";
import {CodeBlockLanguage, LANGUAGE_LIST, loadPrismLangComponent} from "./const";
import {NgForOf} from "@angular/common";

@Component({
  selector: 'lang-list',
  template: `
    <input (input)="onSearch($event)" #input (keydown)="onKeydown($event)"/>
    <div class="lang-list" (mouseover)="onMouseEnter($event)" (mousedown)="onMouseDown($event)" #langList>
      @for (item of languageList; track item; let index = $index) {
        <div class="lang-list_item" [class.active]="item === activeLang"
             [attr.data-value]="item" [class.hover]="hoverIdx === index">
          {{ item }}
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      background-color: #fff;
      border: 1px solid #f5f2f0;
      box-shadow: 0 0 4px rgba(0, 0, 0, .1);
      border-radius: 4px;
      padding: 4px;

      > input {
        margin: 0 auto;
        width: 120px;
        height: calc(var(--bf-lh) * 1.5);
        line-height: calc(var(--bf-lh) * 1.5);
        font-size: var(--bf-fs);
        border: 1px solid #f5f2f0;
        border-radius: 4px;
        padding: 0 4px;

        &:focus {
          outline: 1px solid #4857E2;
        }
      }

      .lang-list {
        margin-top: 4px;
        max-height: 40vh;
        overflow-y: auto;
      }

      .lang-list_item {
        margin-top: 4px;
        padding: 0 4px;
        height: calc(var(--bf-lh) * 1.5);
        line-height: calc(var(--bf-lh) * 1.5);
        text-align: center;
        font-size: calc(var(--bf-fs) * .8);
        color: #999;
        cursor: pointer;
        border-radius: 4px;

        &.active, &.hover {
          background-color: rgba(153, 153, 153, .1);
        }
      }
    }
  `],
  imports: [NgForOf],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LangListComponent {
  @Input() activeLang: string = 'JavaScript';
  @Output() langChange = new EventEmitter<CodeBlockLanguage>();
  @Output() destroy = new EventEmitter<void>()

  @ViewChild('input', {read: ElementRef}) input!: ElementRef<HTMLInputElement>
  @ViewChild('langList', {read: ElementRef}) langList!: ElementRef<HTMLElement>

  protected languageList = LANGUAGE_LIST;

  protected hoverIdx = -1;

  constructor(
    private cdr: ChangeDetectorRef,
    public readonly destroyRef: DestroyRef
  ) {
  }

  ngOnInit() {
    this.setHoverIdx(this.activeLang)
  }

  ngAfterViewInit() {
    this.input.nativeElement.focus();
    this.viewHoverLang()
  }

  onMouseEnter(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains('lang-list_item')) {
      this.setHoverIdx(target.dataset["value"]!)
    }
  }

  onMouseDown(e: MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    const target = e.target as HTMLElement;
    if (target.classList.contains('lang-list_item')) {
      this.emitLang(this.languageList.find(item => item === target.dataset["value"])!)
    }
  }

  setHoverIdx(v: string) {
    this.hoverIdx = this.languageList.findIndex(item => item === v)
  }

  viewHoverLang() {
    this.langList.nativeElement.children[this.hoverIdx]?.scrollIntoView({behavior: 'smooth', block: 'nearest'})
  }

  onSearch(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    if (!v) this.languageList = LANGUAGE_LIST;
    else this.languageList = LANGUAGE_LIST.filter(item => item.toLowerCase().includes(v.toLowerCase()));
    this.hoverIdx = [0, this.hoverIdx, this.languageList.length].sort((a, b) => a - b)[1]
    this.cdr.markForCheck();
  }

  onKeydown($event: KeyboardEvent) {
    switch ($event.key) {
      case 'Escape':
        $event.preventDefault()
        this.destroy.emit();
        break
      case 'ArrowDown':
        $event.preventDefault()
        this.hoverIdx = this.hoverIdx < this.languageList.length - 1 ? this.hoverIdx + 1 : 0;
        this.cdr.detectChanges();
        this.viewHoverLang()
        break;
      case 'ArrowUp':
        $event.preventDefault()
        this.hoverIdx = this.hoverIdx > 0 ? this.hoverIdx - 1 : this.languageList.length - 1;
        this.cdr.detectChanges();
        this.viewHoverLang()
        break;
      case 'Enter':
        if(!this.languageList.length || !this.languageList[this.hoverIdx]) return;
        $event.preventDefault()
        this.emitLang(this.languageList[this.hoverIdx])
        break;
      default:
        break;
    }
  }

  async emitLang(lang: CodeBlockLanguage) {
    await loadPrismLangComponent(lang)
    this.langChange.emit(lang)
  }
}
