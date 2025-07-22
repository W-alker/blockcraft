import {ChangeDetectionStrategy, Component} from "@angular/core";
import {
  DeltaOperation,
  EditableBlockComponent,
  getPositionWithOffset,
  STR_LINE_BREAK
} from "../../framework";
import {CodeBlockModel, PRISM_LANGUAGE_MAP} from "./index";
import {AsyncPipe, NgForOf} from "@angular/common";
import {Subject} from "rxjs";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {LangListComponent} from "./lang-list.component";
import {CodeBlockLanguage} from "./const";
import {debounce, nextTick, performanceTest} from "../../global";
import * as Y from 'yjs'
import {CodeInlineManagerService} from "./code-inlineManager.service";

@Component({
  selector: 'div.code-block',
  template: `
    <div class="edit-container"></div>

    <div class="head-btn__group" contenteditable="false" [class.active]="isHoldHeader">
      <div class="head-btn" (mousedown)="showLangList($event)">
        <span>{{ props.lang }}</span>
        <i class="bf_icon bf_xiajaintou" [hidden]="doc.readonlySwitch$ | async"></i>
      </div>
      <div class="head-btn" (mousedown)="onCopyText($event)"><i class="bf_icon bf_fuzhi"></i> 复制</div>
    </div>
  `,
  standalone: true,
  imports: [NgForOf, AsyncPipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodeBlockComponent extends EditableBlockComponent<CodeBlockModel> {
  override plainTextOnly = true

  protected isHoldHeader = false
  private lines: string[] = []

  private _inlineManager!: CodeInlineManagerService

  override get inlineManager() {
    return this._inlineManager
  }

  override _init() {
    super._init();
    this._inlineManager = new CodeInlineManagerService(this.doc, this, {
      lang: PRISM_LANGUAGE_MAP[this.props.lang],
      withLineBreak: true
    })
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit()
    this._observer()
  }

  private _observer() {
    this.yText.observe(this._debounce_highlight)
    this._yProps.observe(this._obsProp)
  }

  private _unObserver() {
    this.yText.unobserve(this._debounce_highlight)
    this._yProps.unobserve(this._obsProp)
  }

  override detach() {
    super.detach();
    this._unObserver()
  }

  override reattach() {
    super.reattach();
    this._observer()
  }

  private _setLines() {
    this.lines = this.textContent().split(STR_LINE_BREAK).map(line => line += STR_LINE_BREAK)
  }

  private _obsProp = (ev: Y.YMapEvent<unknown>) => {
    if (ev.keysChanged.has('lang')) {
      this.inlineManager.setLang(PRISM_LANGUAGE_MAP[this.props.lang])
      this.rerender()
    }
  }

  private _debounce_highlight = debounce((e: Y.YTextEvent) => {
    nextTick().then(() => {
      this.inlineManager.diffHighLight(e.delta as DeltaOperation[])
    })
  }, 200)

  @performanceTest('code block render')
  override rerender() {
    this.inlineManager.renderCode()
  }

  getLineRangeByCharacter(start: number, end: number) {
    this._setLines()
    let startLine = 0, endLine = 0
    let i = 0
    while (i < end) {
      i += this.lines[startLine].length
      if (i > start) {
        break
      }
      startLine++
    }
    endLine = startLine
    while (i < end) {
      i += this.lines[endLine].length
      if (i > end) {
        break
      }
    }
    return [startLine, endLine]
  }

  changeLanguage(lang: CodeBlockLanguage) {
    if (this.props.lang === lang) return
    this.props.lang = lang
    this.changeDetectorRef.markForCheck()
  }

  showLangList(e: Event) {
    if (this.doc.isReadonly) return
    e.preventDefault()
    e.stopPropagation()

    this.isHoldHeader = true

    const closeList$ = new Subject()
    const {componentRef: cpr} = this.doc.overlayService.createConnectedOverlay<LangListComponent>({
      target: e.target as HTMLElement,
      component: LangListComponent,
      positions: [getPositionWithOffset('bottom-center'), getPositionWithOffset('top-center')],
      backdrop: true
    }, closeList$, () => {
      this.isHoldHeader = false
    })
    cpr.setInput('activeLang', this.props.lang)

    cpr.instance.langChange.pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe(lang => {
      closeList$.next(true)
      this.setInlineRange(0)
      this.changeLanguage(lang)
    })
  }

  onCopyText(e: Event) {
    e.stopPropagation()
    e.preventDefault()
    this.doc.clipboard.copyText(this.textContent()).then(() => {
      const el = e.target as HTMLElement
      el.childNodes[1].textContent = '已复制'
      setTimeout(() => {
        el.childNodes[1].textContent = '复制'
      }, 2000)
    })
  }
}
