import {ChangeDetectionStrategy, Component} from "@angular/core";
import {RootBlockModel} from "../../../blocks/root-block";
import {BaseBlockComponent, IBlockSchemaOptions} from "../../../framework";
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
    '[style.font-family]': 'props.ff',
  }
})
export class DemoRootComponent extends BaseBlockComponent<RootBlockModel>{
}

export const DemoRootBlockSchema: IBlockSchemaOptions<RootBlockModel> = {
  ...RootBlockSchema,
  // The public root flavour maps to RootBlockComponent globally, while this
  // private presentation surface deliberately supplies a BaseBlock-compatible
  // root without editor-root interaction behavior.
  component: DemoRootComponent as unknown as IBlockSchemaOptions<RootBlockModel>['component'],
}
