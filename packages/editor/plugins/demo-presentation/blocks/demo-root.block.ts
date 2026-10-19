import {ChangeDetectionStrategy, Component} from "@angular/core";
import {RootBlockModel} from "../../../blocks/root-block";
import {
  BaseBlockComponent,
  IBlockSchemaOptions,
  normalizeDocumentFontSize,
  normalizeTypographyLineHeight,
  resolveTypographyFontFamily,
} from "../../../framework";
import {RootBlockSchema} from "../../../blocks";

@Component({
  selector: `div.demo-root[data-blockcraft-root="true"][data-bc-surface="presentation"]`,
  template: `
    <div class="children-render-container"></div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  host: {
    'contenteditable': 'false',
    'aria-readonly': 'true',
    '[style.font-family]': 'documentFontFamily',
    '[style.--bc-fs]': 'documentFontSize',
    '[style.--bc-lh]': 'documentLineHeight',
    '[style.color]': 'props.color',
    '[style.--bc-color]': 'props.color',
  }
})
export class DemoRootComponent extends BaseBlockComponent<RootBlockModel>{
  get documentFontFamily(): string | null {
    return resolveTypographyFontFamily(this._native?.props?.ff)
  }

  get documentFontSize(): string | null {
    const fontSize = normalizeDocumentFontSize(this._native?.props?.fs)
    return fontSize === null ? null : `${fontSize}px`
  }

  get documentLineHeight(): string | null {
    const lineHeight = normalizeTypographyLineHeight(this._native?.props?.lh)
    return lineHeight === null ? null : `${lineHeight}`
  }
}

export const DemoRootBlockSchema: IBlockSchemaOptions<RootBlockModel> = {
  ...RootBlockSchema,
  // The public root flavour maps to RootBlockComponent globally, while this
  // private presentation surface deliberately supplies a BaseBlock-compatible
  // root without editor-root interaction behavior.
  component: DemoRootComponent as unknown as IBlockSchemaOptions<RootBlockModel>['component'],
}
