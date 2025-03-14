import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
} from "@angular/core";
import {EditableBlock} from "../../core";
import {ICodeBlockModel, IModeItem} from "./type";
import {Overlay, OverlayModule} from "@angular/cdk/overlay";
import {fromEventPattern, merge} from "rxjs";
import {AsyncPipe, NgForOf, NgIf} from "@angular/common";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import * as Prism from 'prismjs';
// import 'prismjs/components/prism-javascript';
// import 'prismjs/components/prism-typescript';
// import 'prismjs/components/prism-css';
// import 'prismjs/components/prism-markup';
// import 'prismjs/components/prism-php';
// import 'prismjs/components/prism-python';
// import 'prismjs/components/prism-sql';
// import 'prismjs/components/prism-java';
// import 'prismjs/components/prism-go';
// import 'prismjs/components/prism-c';
// import 'prismjs/components/prism-cpp';
// import 'prismjs/components/prism-csharp';
// import 'prismjs/components/prism-rust';
// import 'prismjs/components/prism-json';
// import 'prismjs/components/prism-bash';
// import 'prismjs/components/prism-git';
// import 'prismjs/components/prism-kotlin';
// import 'prismjs/components/prism-ruby';
// import 'prismjs/components/prism-swift';
// import 'prismjs/components/prism-scala';
// import 'prismjs/components/prism-dart';
// import 'prismjs/components/prism-mongodb';
// import 'prismjs/components/prism-nginx';
// import 'prismjs/components/prism-markdown';

import {ComponentPortal} from "@angular/cdk/portal";
import {LangNamePipe} from "./langName.pipe";
import {LangListComponent} from "./lang-list.component";
import {_Token, updateHighlightedTokens} from "./code-differ";

@Component({
  selector: 'div.code-block',
  templateUrl: './code.block.html',
  styleUrls: ['./code.block.scss'],
  standalone: true,
  imports: [
    NgForOf,
    NgIf,
    OverlayModule,
    AsyncPipe,
    LangNamePipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodeBlock extends EditableBlock<ICodeBlockModel> {

  @ViewChild('highlighter', {read: ElementRef, static: true}) highlighter!: ElementRef<HTMLDivElement>

  protected lines: string[] = []
  private resizeSub?: ResizeObserver

  constructor(
    private overlay: Overlay
  ) {
    super();
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.highlight()

    this.yText.observe(e => {
      this.highlight()
    })

    this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
      if (e.type === 'props') {
        this.highlight()
      }
    })

    fromEventPattern(
      (handler) => {
        this.resizeSub = new ResizeObserver(handler)
        this.resizeSub.observe(this.hostEl.nativeElement)
      },
      (handler) => {
        this.resizeSub?.disconnect()
      }
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      // 高度变化时
      this.setLines()
    })
  }

  protected oldTokens: _Token[] = []
  highlight = (text: string = this.getTextContent()) => {
    // console.time('highlight')
    const tokens = Prism.tokenize(text, Prism.languages[this.props.lang]);
    updateHighlightedTokens(this.highlighter.nativeElement, this.oldTokens, tokens)
    this.oldTokens = tokens
    // console.timeEnd('highlight')
  }

  onKeydown(e: KeyboardEvent) {
    // if((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
    //   e.preventDefault()
    //   e.stopPropagation()
    //
    // }
  }

  setLines() {
    this.lines = this.getTextContent().replace(/\n$/, '').split('\n')
    this.cdr.markForCheck()
  }

  changeLanguage(mode: string) {
    this.setProp('lang', mode)
    this.cdr.markForCheck()
  }

  showLangList(e: Event) {
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

    const ls = this.destroyRef.onDestroy(() => {
      ovr.dispose()
    })

    const close = () => {
      ovr.dispose()
      this.setSelection(0)
      ls()
    }
    merge(cpr.instance.destroy, ovr.backdropClick()).pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe(() => {
      close()
    })
    cpr.instance.langChange.pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe((lang: IModeItem) => {
      this.changeLanguage(lang.value)
      close()
    })
  }

  onCopyText(e: Event) {
    e.stopPropagation()
    e.preventDefault()
    const text = this.getTextContent()
    this.controller.clipboard.writeText(text).then(() => {
      const el = e.target as HTMLElement
      el.childNodes[1].textContent = '已复制'
      setTimeout(() => {
        el.childNodes[1].textContent = '复制'
      }, 2000)
    })
  }

}
