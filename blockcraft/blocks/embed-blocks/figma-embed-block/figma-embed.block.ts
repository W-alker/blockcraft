import {ChangeDetectionStrategy, Component} from "@angular/core";
import {FigmaEmbedBlockModel} from "./index";
import {MatIcon} from "@angular/material/icon";
import {BaseEmbedBlockComponent} from "../base.block";
import {IframeCardComponent} from "../components/iframe-card";

@Component({
  selector: 'div.figma-embed-block.embed-frame-block',
  template: `
    <embed-frame-card [props]="props" [url]="_iframeUrl">
      <mat-icon svgIcon="bc_Figma"></mat-icon>
      <span spellcheck="false">Figma</span>
    </embed-frame-card>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, IframeCardComponent],
})
export class FigmaEmbedBlockComponent extends BaseEmbedBlockComponent<FigmaEmbedBlockModel> {

  override getValidUrl() {
    return 'https://www.figma.com/embed?embed_host=share&url=' + this.props.url
  }
}
