import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef, ElementRef,
  EventEmitter,
  Input,
  Output, ViewChild
} from "@angular/core";
import { CodeBlockLanguage, LANGUAGE_LIST } from "./const";
import { loadLanguage } from "./shiki-config";
import { NgForOf } from "@angular/common";
import { debounce } from "../../global";

@Component({
  selector: 'lang-list',
  template: `
    <input (compositionstart)="isComposing = true" (compositionend)="isComposing = false"
           (input)="onSearch($event)" #input (keydown)="onKeydown($event)"
           placeholder="搜索语言"
    />
    <div class="lang-list bc-scrollable-container" (mouseover)="onMouseEnter($event)" (mousedown)="onMouseDown($event)" #langList>
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
      background-color: var(--bc-bg-primary);
      border: 1px solid var(--bc-border-color);
      box-shadow: var(--bc-shadow-md);
      border-radius: 4px;
      padding: 4px;

      > input {
        margin: 0 auto;
        width: 120px;
        height: calc(var(--bc-lh) * 1.5);
        line-height: calc(var(--bc-lh) * 1.5);
        font-size: var(--bc-fs);
        border: 1px solid var(--bc-border-color);
        border-radius: 4px;
        padding: 0 4px;
        color: var(--bc-color);
        background: unset;

        &:focus {
          outline: 1px solid var(--bc-active-color);
        }

        &::placeholder {
          color: var(--bc-color-lighter);
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
        height: calc(var(--bc-lh) * 1.5);
        line-height: calc(var(--bc-lh) * 1.5);
        text-align: center;
        font-size: calc(var(--bc-fs) * .8);
        color: var(--bc-color-lighter);
        cursor: pointer;
        border-radius: 4px;

        &.active, &.hover {
          background-color: var(--bc-bg-hover);
        }

        &.active {
          color: var(--bc-active-color);
        }
      }

    }
  `],
  imports: [NgForOf],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LangListComponent {
  @Input() activeLang: string = 'PlainText';
  @Output() langChange = new EventEmitter<CodeBlockLanguage>();
  @Output() destroy = new EventEmitter<void>()

  @ViewChild('input', { read: ElementRef }) input!: ElementRef<HTMLInputElement>
  @ViewChild('langList', { read: ElementRef }) langList!: ElementRef<HTMLElement>

  // 使用 LANGUAGE_LIST 作为语言列表（已排序的语言名称数组）
  protected languageList: string[] = LANGUAGE_LIST;
  // 保存初始完整列表用于搜索恢复
  private readonly fullLanguageList = LANGUAGE_LIST;

  protected hoverIdx = -1;

  protected isComposing = false

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
    this.langList.nativeElement.children[this.hoverIdx]?.scrollIntoView({ block: 'nearest' })
  }

  onSearch = debounce((e: Event) => {
    if (this.isComposing) return
    const v = (e.target as HTMLInputElement).value;
    if (!v) {
      this.languageList = this.fullLanguageList;
    } else {
      this.languageList = this.fullLanguageList.filter(item =>
        item.toLowerCase().includes(v.toLowerCase())
      );
    }
    this.hoverIdx = [0, this.hoverIdx, this.languageList.length].sort((a, b) => a - b)[1]
    this.cdr.markForCheck();
  }, 300)

  onKeydown($event: KeyboardEvent) {
    if (this.isComposing) return;
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
        if (!this.languageList.length || !this.languageList[this.hoverIdx]) return;
        $event.preventDefault()
        this.emitLang(this.languageList[this.hoverIdx])
        break;
      default:
        break;
    }
  }

  async emitLang(lang: CodeBlockLanguage) {
    await loadLanguage(lang)
    this.langChange.emit(lang)
  }
}
