import {ChangeDetectionStrategy, Component} from "@angular/core";
import {
  DeltaOperation,
  EditableBlockComponent,
  getPositionWithOffset,
  STR_LINE_BREAK
} from "../../framework";
import {CodeBlockModel, isLanguageSupported, loadPrismLangComponent, PRISM_LANGUAGE_MAP} from "./index";
import {AsyncPipe, NgForOf} from "@angular/common";
import {fromEvent, Subject, Subscription, take, throttleTime} from "rxjs";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {LangListComponent} from "./lang-list.component";
import {CodeBlockLanguage} from "./const";
import {debounce, nextTick, performanceTest} from "../../global";
import * as Y from 'yjs'
import {CodeInlineManagerService} from "./code-inlineManager.service";

@Component({
  selector: 'div.code-block',
  template: `
    <div class="code-block__head" contenteditable="false">
        <span class="head-btn btn-collapse" (mousedown)="onToggleCollapse($event)">
            <i class="bc_icon bc_a-sanjiao-jinru6"></i>
        </span>

      <div class="head-btn__group">
        <div class="head-btn" (mousedown)="showLangList($event)">
          <span class="lang">{{ props.lang }}</span>
          <i class="bf_icon bf_xiajaintou" [hidden]="doc.readonlySwitch$ | async"></i>
        </div>
        <div class="head-btn" (mousedown)="onCopyText($event)"><i class="bf_icon bf_fuzhi"></i> 复制</div>
      </div>
    </div>

    <div class="edit-container-wrapper" [style.height.px]="props.h">
      <div class="edit-container"></div>
    </div>

    @if (!(doc.readonlySwitch$ | async) && !props.collapse) {
      <div class="resize-bar-btm" contenteditable="false" (mousedown)="onResizeMouseDown($event)">
        <div class="bar-drag"></div>
      </div>
    }
  `,
  standalone: true,
  imports: [NgForOf, AsyncPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-collapse]': 'props.collapse'
  }
})
export class CodeBlockComponent extends EditableBlockComponent<CodeBlockModel> {
  override plainTextOnly = true

  private lines: string[] = []

  private _inlineManager!: CodeInlineManagerService

  override get inlineManager() {
    return this._inlineManager
  }

  override async _init() {
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
      return
    }
    this.changeDetectorRef.markForCheck()
  }

  private _debounce_highlight = debounce((e: Y.YTextEvent) => {
    if (this.doc.event.status.isComposing) return
    nextTick().then(() => {
      this.inlineManager.diffHighLight(e.delta as DeltaOperation[])
    })
  }, 200)

  override rerender() {
    if (!isLanguageSupported(PRISM_LANGUAGE_MAP[this.props.lang])) {
      loadPrismLangComponent(this.props.lang).then(() => {
        this.inlineManager.renderCode()
      })
    } else {
      this.inlineManager.renderCode()
    }
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

    const closeList$ = new Subject()
    const {componentRef: cpr} = this.doc.overlayService.createConnectedOverlay<LangListComponent>({
      target: e.target as HTMLElement,
      component: LangListComponent,
      positions: [getPositionWithOffset('bottom-center'), getPositionWithOffset('top-center')],
      backdrop: true
    }, closeList$, () => {
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

  onResizeMouseDown(evt: MouseEvent) {
    evt.stopPropagation()
    evt.preventDefault()
    let startY = evt.clientY;
    let startHeight = this.props.h ?? this.containerElement.getBoundingClientRect().height
    let newHeight = startHeight

    this.doc.ngZone.runOutsideAngular(() => {
      const mouseMove$ = fromEvent<MouseEvent>(document, 'mousemove')
        .pipe(throttleTime(32))
        .subscribe((e) => {
          let dy = 0
          dy = e.clientY - startY
          // 如果是向上滚动，更快点
          if (dy < 0) {
            dy *= 2
          }

          newHeight = Math.max(50, startHeight + dy);
          this.containerElement.parentElement!.style.height = newHeight + 'px';
        })

      fromEvent<MouseEvent>(document, 'mouseup', {capture: true}).pipe(take(1)).subscribe((e) => {
        mouseMove$.unsubscribe()
        this.updateProps({h: newHeight})
      })

    })
  }

  onToggleCollapse($event: MouseEvent) {
    $event.stopPropagation()
    if (this.doc.isReadonly) {
      this.hostElement.classList.toggle('is-collapse')
      return
    }
    this.updateProps({
      collapse: this.props.collapse ? null : true
    })
  }
}
