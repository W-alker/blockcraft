import {ChangeDetectionStrategy, Component} from "@angular/core";
import {RootBlockComponent} from "../../../blocks/root-block/root.block";
import {BlockNodeType, IBlockSchemaOptions} from "../../../framework";
import {RootBlockSchema} from "../../../blocks";

@Component({
  selector: `div.root-block.demo-root[data-blockcraft-root="true"]`,
  template: `
    <div class="children-render-container"></div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  host: {
    '[style.font-family]': 'props.ff',
  }
})
export class DemoRootComponent extends RootBlockComponent{
}

export const DemoRootBlockSchema: IBlockSchemaOptions = {
  ...RootBlockSchema,
  component: DemoRootComponent,
}
