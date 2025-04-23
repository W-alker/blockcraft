import {ChangeDetectionStrategy, Component, ElementRef, ViewChild} from "@angular/core";
import {BaseBlockComponent, NativeBlockModel} from "../../framework";

export interface IBaseEmbedBlockProps {
  url: string

  [key: string]: any
}

@Component({
  selector: "div.embed-block",
  template: ``,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BaseEmbedBlockComponent<Model extends NativeBlockModel & {
  props: IBaseEmbedBlockProps
}> extends BaseBlockComponent<Model> {

  protected _iframeUrl: string = ''

  override ngOnInit() {
    super.ngOnInit();
    this.reloadIframe()
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();
  }

  getValidUrl() {
    return this.props.url
  }

  reloadIframe() {
    this._iframeUrl = this.getValidUrl()
  }

}
