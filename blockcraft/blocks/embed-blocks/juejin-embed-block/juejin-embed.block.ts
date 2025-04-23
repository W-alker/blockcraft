import {ChangeDetectionStrategy, Component} from "@angular/core";
import {JuejinEmbedBlockModel} from "./index";
import {BaseEmbedBlockComponent} from "../base.block";
import {IframeCardComponent} from "../components/iframe-card";
import {MatIcon} from "@angular/material/icon";

@Component({
  selector: 'div.juejin-embed-block.embed-frame-block',
  template: `
    <embed-frame-card [props]="props" [url]="_iframeUrl">
      <mat-icon svgIcon="bc_juejin"></mat-icon>
      <span spellcheck="false">掘金</span>
    </embed-frame-card>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IframeCardComponent, MatIcon],
})
export class JuejinEmbedBlockComponent extends BaseEmbedBlockComponent<JuejinEmbedBlockModel> {
}
