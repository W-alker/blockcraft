import {ChangeDetectionStrategy, Component} from "@angular/core";
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {BaseBlockComponent, NativeBlockModel} from "../../framework";

export interface IBaseEmbedBlockProps {
  url: string

  [key: string]: any
}

@Component({
  selector: "div.embed-block",
  template: ``,
  standalone: true,
})
export class BaseEmbedBlockComponent<Model extends NativeBlockModel & {
  props: IBaseEmbedBlockProps
}> extends BaseBlockComponent<Model> {

  protected _iframeUrl: string = ''

  override ngOnInit() {
    super.ngOnInit();
    this._iframeUrl = this.getValidUrl()
    this.onPropsChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(changes => {
      if (!changes.has('url')) return
      this._iframeUrl = this.getValidUrl()
      this.changeDetectorRef.markForCheck()
    })
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.changeDetectorRef.markForCheck()
  }

  getValidUrl() {
    return this.props.url
  }

  reloadIframe() {
    this.hostElement.querySelector('iframe')!.src = this._iframeUrl = this.getValidUrl()
  }

}
