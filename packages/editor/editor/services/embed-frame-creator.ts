import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild
} from "@angular/core";
import {IBlockSchemaOptions} from "../../framework/block-std/schema/block-schema";
import {figmaUrlRegex, jueJinUrlRegex, urlRegex} from "../../global";

@Component({
  selector: 'embed-frame-creator',
  template: `
    <h3>{{ schema.metadata.label }}</h3>
    <div class="desc">{{ schema.metadata.description }}</div>

    <input type="text" [placeholder]="EMBED_FRAME_URL_START_MAP[schema.flavour] + '/...'" (input)="verifyUrl()"
           (keydown.enter)="trySubmit($event)" (keydown.escape)="onCancel.emit()" #inputElement/>
    <button [disabled]="isDisabled" (mousedown)="trySubmit($event)">确定</button>
  `,
  styles: [`
    :host {
      width: 300px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-radius: 4px;
      border: 1px solid #E6E6E6;
      background: #FFF;
      box-shadow: 0px 0px 20px 0px rgba(0, 0, 0, 0.10);
      font-size: 14px;
      color: #333;
      padding: 12px;

      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: bold;
      }

      .desc {
        margin: 0;
        color: #999;
      }

      input {
        width: 100%;
        border-radius: 4px;
        border: 1px solid #E6E6E6;
        padding: 4px 8px;
        margin: 0;
      }

      button {
        border: 1px solid var(--bc-border-color);
        border-radius: 4px;
        padding: 4px 8px;
        outline: none;
        cursor: pointer;
        background: var(--bc-active-color);
        color: #fff;

        &[disabled] {
          color: #999;
          cursor: not-allowed;
          border-color: var(--bc-border-color-light);
          background: transparent;
        }
      }
    }
  `],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmbedFrameCreator {
  @Input()
  schema!: IBlockSchemaOptions

  @Output()
  onSubmit = new EventEmitter<string>()

  @Output()
  onCancel = new EventEmitter<void>()

  isDisabled = true

  @ViewChild('inputElement', {read: ElementRef}) inputElement!: ElementRef<HTMLInputElement>

  constructor(
    public readonly destroyer: DestroyRef
  ) {
  }

  ngAfterViewInit() {
    this.inputElement.nativeElement.focus()
  }

  verifyUrl() {
    // @ts-ignore
    this.isDisabled = !EMBED_FRAME_URL_REG_MAP[this.schema.flavour].test(this.inputElement.nativeElement.value)
  }

  trySubmit(e: Event) {
    e.preventDefault()
    e.stopPropagation()
    this.verifyUrl()
    if (this.isDisabled) return
    this.onSubmit.emit(this.inputElement.nativeElement.value)
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
