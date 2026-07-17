import { ChangeDetectionStrategy, Component } from "@angular/core";
import {
  DeltaOperation,
  EditableBlockComponent,
  getPositionWithOffset, ORIGIN_SKIP_SYNC,
  normalizeRange,
  STR_LINE_BREAK
} from "../../framework";
import { CodeBlockModel } from "./index";
import { isLanguageSupported, loadLanguage, SHIKI_LANGUAGE_MAP } from "./shiki-config";
import { fromEvent, Subject, take, throttleTime } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { LangListComponent } from "./lang-list.component";
import { CodeBlockLanguage } from "./const";
import { debounce, nextTick } from "../../global";
import { CodeInlineRuntime } from "./code-inline-runtime";
import { CodeBlockNameInputComponent } from "./block-name-input.component";
import { isFormatOnlyDelta } from "./color-merge";

@Component({
  selector: 'div.code-block',
  template: `
    <div class="code-block__head" contenteditable="false">
      <span class="head-btn btn-collapse" (mousedown)="onToggleCollapse($event)">
          <i class="bc_icon bc_a-sanjiao-jinru6"></i>
      </span>
      <span class="block-name" spellcheck="false" (mousedown)="showBlockNameInput($event)">{{ blockName }}</span>

      <div class="head-btn__group">
        <div class="head-btn" (mousedown)="showLangList($event)">
          <span class="lang">{{ props.lang }}</span>
          <i class="bc_icon bc_xiajaintou" [hidden]="isReadonly"></i>
        </div>
        <div class="head-btn" (mousedown)="onCopyText($event)"><i class="bc_icon bc_fuzhi"></i> 复制</div>
      </div>
    </div>

    <div class="edit-container-wrapper bc-scrollable-container" [style.height.px]="props.h">
      <pre class="edit-container"></pre>
    </div>

    @if (!isReadonly && !props.collapse) {
      <div class="resize-bar-btm" contenteditable="false" (mousedown)="onResizeMouseDown($event)">
        <div class="bar-drag"></div>
      </div>
    }
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-collapse]': 'props.collapse'
  }
})
export class CodeBlockComponent extends EditableBlockComponent<CodeBlockModel> {
  override plainTextOnly = true

  private lines: string[] = []

  private _codeRuntime!: CodeInlineRuntime

  get blockName() {
    return this.props.blockName?.trim() || '代码块'
  }

  /**
   * Override _initRuntime to create CodeInlineRuntime instead of InlineRuntime.
   */
  protected override _initRuntime() {
    const embedConverters = new Map(this.doc.config.embeds || [])
    this._codeRuntime = new CodeInlineRuntime(this._containerElement, embedConverters, {
      lang: SHIKI_LANGUAGE_MAP[this.props.lang],
      withLineBreak: true,
      theme: this.doc.theme.includes('light') ? 'github-light' : 'github-dark',
    })
    this._runtime = this._codeRuntime
  }

  override _init() {
    super._init();
    this.doc.themeChange$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this._codeRuntime.setTheme(this.doc.theme.includes('light') ? 'github-light' : 'github-dark')
      this.rerender()
    })
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit()
    this.onPropsChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
      if (e.has('lang')) {
        this._codeRuntime.setLang(SHIKI_LANGUAGE_MAP[this.props.lang])
        this.rerender()
        return
      }
      this.changeDetectorRef.markForCheck()
    })
    this.onTextChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
      if(e.tr.origin === ORIGIN_SKIP_SYNC) return
      // 纯格式变更（如选区染色）不改变文本/语法高亮；跳过重渲，避免 diffHighLight 把选区塌缩成光标
      if (isFormatOnlyDelta(e.op)) return
      this._debounce_highlight(e.op)
    })
  }

  private _setLines() {
    this.lines = this.textContent().split(STR_LINE_BREAK).map(line => line += STR_LINE_BREAK)
  }

  private _debounce_highlight = debounce((e: DeltaOperation[]) => {
    if (this.doc.event.status.isComposing) return
    nextTick().then(() => {
      this._codeRuntime.diffHighLight(e, {
        block: this,
        selectionValue: this.doc.selection.value,
        normalizeRange: (range: Range) => normalizeRange(
          range,
          id => this.doc.getBlockById(id) as any,
        )
      })
    })
  }, 200)

  override rerender() {
    // Synchronous blot tree build first (plain text, no colors).
    // This ensures the blot tree is immediately available for cursor positioning
    // (e.g. after compositionEnd which calls rerender then setInlineRange).
    super.rerender()

    // Defer async Shiki highlighting to next microtask.
    // This ensures setInlineRange() (called after rerender in compositionEnd)
    // has already set the DOM cursor before renderCode captures/restores it.
    const shikiLang = SHIKI_LANGUAGE_MAP[this.props.lang]
    if (!isLanguageSupported(shikiLang)) {
      loadLanguage(this.props.lang).then(() => {
        this._codeRuntime.renderCode(() => this.textContent(), () => this.textDeltas())
      })
    } else {
      queueMicrotask(() => {
        this._codeRuntime.renderCode(() => this.textContent(), () => this.textDeltas())
      })
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
    this.updateProps({lang})
    this.changeDetectorRef.markForCheck()
  }

  showLangList(e: Event) {
    if (this.isReadonly) return
    e.preventDefault()
    e.stopPropagation()

    const closeList$ = new Subject()
    const { componentRef: cpr } = this.doc.overlayService.createConnectedOverlay<LangListComponent>({
      target: e.target as HTMLElement,
      component: LangListComponent,
      positions: [getPositionWithOffset('bottom-center'), getPositionWithOffset('top-center')],
      backdrop: true
    }, closeList$, () => {
    })
    cpr.setInput('activeLang', this.props.lang)

    cpr.instance.langChange.pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe(lang => {
      closeList$.next(true)
      if (this.isReadonly) return
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

  showBlockNameInput(event: MouseEvent) {
    if (this.isReadonly) return
    event.stopPropagation()
    event.preventDefault()

    const close$ = new Subject<void>()
    const close = () => close$.next()

    const { componentRef } = this.doc.overlayService.createConnectedOverlay<CodeBlockNameInputComponent>({
      target: event.currentTarget as HTMLElement,
      component: CodeBlockNameInputComponent,
      positions: [getPositionWithOffset('bottom-left', 0, 6), getPositionWithOffset('top-left', 0, 6)],
      backdrop: true
    }, close$, () => {
    })

    componentRef.setInput('value', this.props.blockName?.trim() || '')

    requestAnimationFrame(() => {
      componentRef.instance.focus()
    })

    componentRef.instance.cancel.pipe(takeUntilDestroyed(componentRef.instance.destroyRef)).subscribe(() => {
      close()
    })

    componentRef.instance.valueChange.pipe(takeUntilDestroyed(componentRef.instance.destroyRef)).subscribe(value => {
      if (this.isReadonly) {
        close()
        return
      }
      this.updateProps({
        blockName: value || null
      })
      close()
    })
  }

  onResizeMouseDown(evt: MouseEvent) {
    if (this.isReadonly) return
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
          if (dy < 0) {
            dy *= 2
          }

          newHeight = Math.max(50, startHeight + dy);
          this.containerElement.parentElement!.style.height = newHeight + 'px';
        })

      fromEvent<MouseEvent>(document, 'mouseup', { capture: true }).pipe(take(1)).subscribe((e) => {
        mouseMove$.unsubscribe()
        if (this.isReadonly) return
        this.updateProps({ h: newHeight })
      })

    })
  }

  onToggleCollapse($event: MouseEvent) {
    $event.stopPropagation()
    if (this.isReadonly) {
      this.hostElement.classList.toggle('is-collapse')
      return
    }
    this.updateProps({
      collapse: this.props.collapse ? null : true
    })
  }
}
