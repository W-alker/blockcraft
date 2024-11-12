import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  TemplateRef,
  ViewChild,
  ViewContainerRef
} from "@angular/core";
import { DeltaOperation, EditableBlock } from "../../core";
import { ICodeBlockModel } from "./type";
import { Overlay, OverlayModule } from "@angular/cdk/overlay";
import { fromEventPattern, take } from "rxjs";
import { AsyncPipe, NgForOf, NgIf } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import * as Prism from 'prismjs';
// 可选：导入其他语言支持
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-java';
import { languageList } from "./const";
import { TemplatePortal } from "@angular/cdk/portal";
import { LangNamePipe } from "./langName.pipe";

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

  @ViewChild('highlighter', { read: ElementRef }) highlighter!: ElementRef<HTMLDivElement>
  @ViewChild('langListTpl', { read: TemplateRef }) langListTpl!: TemplateRef<any>

  protected readonly languageList = languageList;
  protected lines: string[] = []
  private resizeSub?: ResizeObserver

  constructor(
    private overlay: Overlay,
    private vcr: ViewContainerRef,
  ) {
    super();
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.highlight()

    this.yText.observe(e => {
      this.applyDeltaToView(e.delta as DeltaOperation[], false, this.highlighter.nativeElement)
      Promise.resolve().then(() => {
        this.highlight()
      })
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

  highlight = (text: string = this.getTextContent()) => {
    // const token = hljs.highlight('javascript', text.endsWith('\n') ? text.slice(0, -1) : text)
    // console.log(token)
    // this.highlighter.nativeElement.innerHTML = token.value;
    const tokens = Prism.tokenize(text, Prism.languages[this.props.lang]);
    this.highlighter.nativeElement.innerHTML = this.tokensToHTML(tokens);
  }

  tokensToHTML(tokens: Array<string | Prism.Token>): string {
    return tokens
      .map(token => {
        if (typeof token === 'string') {
          return `<span>${token}</span>`;
        } else {
          const content = Array.isArray(token.content)
            ? this.tokensToHTML(token.content)
            : token.content;
          return `<span class="${token.type}">${content}</span>`;
        }
      })
      .join('');
  }

  // formatCode() {
  //   // 使用 Prettier 格式化代码
  //   format(this.getTextContent(), {
  //     tabWidth: 2,
  //     useTabs: false,
  //   }).then((formattedCode) => {
  //     this.yText.delete(0, this.yText.length)
  //     this.yText.insert(0, formattedCode)
  //     this.highlight(formattedCode)
  //   })
  // }

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
      { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' }
    ])
    console.log(this.langListTpl, this.vcr)
    const portal = new TemplatePortal(this.langListTpl, this.vcr)
    const ovr = this.overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    })
    ovr.attach(portal)
    ovr.backdropClick().pipe(take(1)).subscribe(() => {
      ovr.dispose()
    })
  }

}
