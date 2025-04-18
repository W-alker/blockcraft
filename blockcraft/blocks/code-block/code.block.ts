import {ChangeDetectionStrategy, Component, ElementRef, ViewChild} from "@angular/core";
import {EditableBlockComponent, STR_LINE_BREAK} from "../../framework";
import {CodeBlockModel} from "./index";
import * as Prism from "prismjs";
import {AsyncPipe, NgForOf} from "@angular/common";
import {merge, take} from "rxjs";
import {ComponentPortal} from "@angular/cdk/portal";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {Overlay} from "@angular/cdk/overlay";
import {LangListComponent} from "./lang-list.component";
import {PRISM_LANGUAGE_MAP} from "./const";
import {performanceTest} from "../../framework/decorators";
import {DeltaInsertText} from "../../framework/types";
import * as Y from 'yjs'
import {Token} from "prismjs";
import {nextTick} from "../../global";

@Component({
  selector: 'div.code-block',
  template: `
    <div class="edit-container"></div>

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
  override plainTextOnly = true

  @ViewChild('highlighter', {read: ElementRef}) highlighter!: ElementRef<HTMLPreElement>

  private lines: string[] = []

  constructor(private overlay: Overlay) {
    super();
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit()
    this._observer()
  }

  private _observer() {
    this.yText.observe(this.highlight)
    this._yProps.observe(this._obsProp)
  }

  private _unObserver() {
    this.yText.unobserve(this.highlight)
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
    this.lines = this.textContent().split('\n').map(line => line += '\n')
  }

  private _obsProp = (ev: Y.YMapEvent<unknown>) => {
    if (ev.keysChanged.has('lang')) {
      this.rerender()
    }
  }

  private highlight = (ev: Y.YEvent<Y.Text>, tr: Y.Transaction) => {
    nextTick().then(() => {
      this.diffHighlight()
    })
  }

  @performanceTest()
  diffHighlight() {
    const isHere = this.doc.selection.value?.from.blockId === this.id
    let pos = 0
    if (isHere) {
      const sel = this.doc.selection.normalizeRange(document.getSelection()!.getRangeAt(0))
      pos = sel?.from.type === 'text' ? sel.from.index : 0
    }
    this.rerender()
    isHere && this.setInlineRange(pos)
  }

  private _flatTokens(tokens: Array<string | Token>, res: DeltaInsertText[] = [], parentType?: string) {
    for (const token of tokens) {
      if (typeof token === 'string') {
        const attrs: Record<string, any> | undefined = parentType ? {'a:type': parentType} : undefined
        if (token.includes(STR_LINE_BREAK)) {
          let i = 0, j = 0
          while (i < token.length) {
            if (token[i] === STR_LINE_BREAK) {
              res.push({
                attributes: {...attrs, 'd:lineBreak': true}, insert: token.slice(j, i + 1)
              })
              j = i + 1
            }
            i++
          }
          const rest = token.slice(j)
          rest && res.push({attributes: {...attrs}, insert: rest})
          continue
        } else {
          res.push({attributes: attrs, insert: token})
        }
        continue
      }
      if (typeof token.content === 'string') {
        res.push({
          attributes: {'a:type': token.type || parentType || 'text'},
          insert: token.content
        })
      } else {
        this._flatTokens(Array.isArray(token.content) ? token.content : [token.content], res, token.type)
      }
    }
    return res
  }

  @performanceTest('code block render')
  override rerender() {
    const tokens = Prism.tokenize(this.textContent(), Prism.languages[PRISM_LANGUAGE_MAP[this.props.lang]])
    this.doc.inlineManager.render(this._flatTokens(tokens), this.containerElement)
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
    this.doc.clipboard.copyText(this.textContent()).then(() => {
      const el = e.target as HTMLElement
      el.childNodes[1].textContent = '已复制'
      setTimeout(() => {
        el.childNodes[1].textContent = '复制'
      }, 2000)
    })
  }
}
