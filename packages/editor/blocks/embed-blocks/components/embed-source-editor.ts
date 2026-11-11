import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
  ViewChild
} from "@angular/core";
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {take} from 'rxjs';
import {CS_MODAL_DATA, CsButtonComponent, CsInputDirective, CsModalRef} from '@cses/ui';
import {IBlockSchemaOptions} from "../../../framework/block-std/schema/block-schema";
import {figmaUrlRegex, jueJinUrlRegex, urlRegex} from "../../../global";

import {normalizeEmbedUrl} from '../embed-block/source';

@Component({
  selector: 'embed-frame-creator',
  template: `
    <div class="desc">{{ schema.metadata.description }}</div>

    <input cs-input type="text" aria-label="网页链接" [placeholder]="schema.flavour === 'embed' ? 'https://...' : EMBED_FRAME_URL_START_MAP[schema.flavour] + '/...'" (input)="verifyUrl()"
           (keydown.enter)="trySubmit($event)" (keydown.escape)="onCancel.emit()" #inputElement/>
    <!-- @cses/ui 4.29 的按钮会覆盖 disabled 属性，用原生 fieldset 保留禁用语义。 -->
    <fieldset [disabled]="isDisabled">
      <button cs-button csType="primary" type="button" [attr.aria-disabled]="isDisabled" (click)="trySubmit($event)">确定</button>
    </fieldset>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--cs-ref-space-sm);

      .desc {
        margin: 0;
        color: var(--cs-color-text-light);
      }

      input {
        width: 100%;
        box-sizing: border-box;
      }
      fieldset { display: flex; min-width: 0; margin: 0; padding: 0; border: 0; }
      button { width: 100%; }
    }
  `],
  standalone: true,
  imports: [CsInputDirective, CsButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmbedFrameCreator {
  private readonly modalRef = inject(CsModalRef, {optional: true})
  private readonly modalData = inject(CS_MODAL_DATA, {optional: true}) as
    {schema: IBlockSchemaOptions; initialUrl?: string} | null
  @Input()
  schema!: IBlockSchemaOptions

  @Output()
  onSubmit = new EventEmitter<string>()

  @Output()
  onCancel = new EventEmitter<void>()

  @Input() initialUrl = ''

  isDisabled = true

  @ViewChild('inputElement', {read: ElementRef}) inputElement!: ElementRef<HTMLInputElement>

  constructor(
    public readonly destroyer: DestroyRef
  ) {
  }

  ngAfterViewInit() {
    this.inputElement.nativeElement.value = this.initialUrl
    const focusInput = () => this.inputElement.nativeElement.focus({preventScroll: true})
    if (this.modalRef) {
      // 等 Modal 建立初始焦点后再聚焦，避免焦点被容器抢回。
      this.modalRef.afterOpen.pipe(take(1), takeUntilDestroyed(this.destroyer)).subscribe(focusInput)
    } else {
      focusInput()
    }
  }

  ngOnInit() {
    if (this.modalData) {
      this.schema = this.modalData.schema
      this.initialUrl = this.modalData.initialUrl ?? ''
    }
    this.isDisabled = !this.isValidUrl(this.initialUrl)
  }

  private isValidUrl(value: string) {
    return this.schema.flavour === 'embed'
      ? !!normalizeEmbedUrl(value)
      : !!EMBED_FRAME_URL_REG_MAP[this.schema.flavour]?.test(value)
  }

  verifyUrl() {
    const value = this.inputElement.nativeElement.value
    this.isDisabled = !this.isValidUrl(value)
  }

  trySubmit(e: Event) {
    e.preventDefault()
    e.stopPropagation()
    this.verifyUrl()
    if (this.isDisabled) return
    const value = this.inputElement.nativeElement.value
    this.onSubmit.emit(this.schema.flavour === 'embed' ? normalizeEmbedUrl(value)! : value)
  }

  protected readonly EMBED_FRAME_URL_START_MAP = EMBED_FRAME_URL_START_MAP
}


const EMBED_FRAME_URL_REG_MAP: Record<string, RegExp> = {
  'figma-embed': figmaUrlRegex,
  'juejin-embed': jueJinUrlRegex,
  'bookmark': urlRegex
}

const EMBED_FRAME_URL_START_MAP: Record<string, string> = {
  'figma-embed': 'https://www.figma.com',
  'github-embed': 'https://github.com',
  'juejin-embed': 'https://juejin.cn',
  'bookmark': 'https://'
}
