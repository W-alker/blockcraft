import {ChangeDetectionStrategy, Component, ElementRef, ViewChild} from "@angular/core";
import {EditableBlockComponent} from "../../framework";
import {CodeBlockModel} from "./index";
import * as Prism from "prismjs";
import {_Token, updateHighlightedTokens} from "./code-differ";
import {AsyncPipe, NgForOf} from "@angular/common";
import {merge, take} from "rxjs";
import {ComponentPortal} from "@angular/cdk/portal";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {Overlay} from "@angular/cdk/overlay";
import {LangListComponent} from "./lang-list.component";
import {PRISM_LANGUAGE_MAP} from "./const";
import {performanceTest} from "../../framework/decorators";

@Component({
  selector: 'div.code-block',
  template: `
    <div class="code-block-line-numbers" contenteditable="false">
      <div>
        <span *ngFor="let line of lines; let i = index">
          {{ i + 1 }}
        </span>
      </div>
    </div>

    <div class="edit-container"></div>
    <div class="code-block-highlighter" #highlighter contenteditable="false"></div>

    <div class="head-btn__group" contenteditable="false">
      <div class="head-btn" (mousedown)="showLangList($event)">
        <span>{{ props.lang }}</span> <i class="bf_icon bf_xiajaintou"></i>
      </div>
      <div class="head-btn" (mousedown)="onCopyText($event)"><i class="bf_icon bf_fuzhi"></i> 复制</div>
    </div>
  `,
  standalone: true,
  imports: [NgForOf, AsyncPipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodeBlockComponent extends EditableBlockComponent<CodeBlockModel> {

  @ViewChild('highlighter', {read: ElementRef}) highlighter!: ElementRef<HTMLPreElement>

  protected lines: string[] = []
  private resizeSub?: ResizeObserver

  constructor(private overlay: Overlay) {
    super();
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit()
    this.highlight()

    this.resizeSub = new ResizeObserver(() => {
      this.lines = this.textContent().split('\n')
      this.changeDetectorRef.markForCheck()
    })
    this._observer()
  }

  private _observer() {
    this.resizeSub?.observe(this.hostElement)
    this.yText.observe(this.highlight)
    this._yProps.observe(this.highlight)
  }

  private _unObserver() {
    this.resizeSub?.disconnect()
    this.yText.unobserve(this.highlight)
    this._yProps.unobserve(this.highlight)
  }

  override detach() {
    super.detach();
    this._unObserver()
  }

  override reattach() {
    super.reattach();
    this._observer()
  }

  override ngOnDestroy() {
    super.ngOnDestroy();
    this.resizeSub?.disconnect()
    // @ts-expect-error
    this.resizeSub = null
  }

  protected oldTokens: _Token[] = []

  private highlight = () => {
    this._diffHighlight()
  }

  @performanceTest()
  private _diffHighlight() {
    const tokens = Prism.tokenize(this.textContent(), Prism.languages[PRISM_LANGUAGE_MAP[this.props.lang]]);
    updateHighlightedTokens(this.highlighter.nativeElement, this.oldTokens, tokens)
    this.oldTokens = tokens
  }

  getLinesByRange(from: number, to: number) {
    const text = this.textContent()
    to > text.length && (to = text.length)
    this.lines = text.split('\n').map(line => line += '\n')
    const res: {
      before: string[]
      current: string[]
      after: string[]
    } = {
      before: [],
      current: [],
      after: []
    }
    let i = 0
    let lineCnt = 0
    while (i < to) {
      i += this.lines[lineCnt].length
      if (i > from) {
        res.current.push(this.lines[lineCnt])
      } else {
        res.before.push(this.lines[lineCnt])
      }
      lineCnt++
    }
    res.after = this.lines.slice(lineCnt)
    return res
  }

  changeLanguage(lang: string) {
    if (this.props.lang === lang) return
    this.props.lang = lang
    this.changeDetectorRef.markForCheck()
  }

  showLangList(e: Event) {
    e.preventDefault()
    e.stopPropagation()
    const positionStrategy = this.overlay.position().flexibleConnectedTo(e.target as HTMLElement).withPositions([
      {originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top'}
    ])
    const portal = new ComponentPortal(LangListComponent)
    const ovr = this.overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    })
    const cpr = ovr.attach(portal)
    cpr.setInput('activeLang', this.props.lang)

    merge(cpr.instance.destroy, ovr.backdropClick(), this.onDestroy$).pipe(take(1)).subscribe(() => {
      ovr.dispose()
    })
    cpr.instance.langChange.pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe((lang: string) => {
      this.changeLanguage(lang)
      ovr.dispose()
    })
  }

  onCopyText(e: Event) {
    e.stopPropagation()
    e.preventDefault()
    this.doc.clipboard.writeText(this.textContent()).then(() => {
      const el = e.target as HTMLElement
      el.childNodes[1].textContent = '已复制'
      setTimeout(() => {
        el.childNodes[1].textContent = '复制'
      }, 2000)
    })
  }
}
