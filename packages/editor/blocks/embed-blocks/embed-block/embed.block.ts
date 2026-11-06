import {ChangeDetectionStrategy, Component, ViewChild} from '@angular/core'
import {takeUntilDestroyed} from '@angular/core/rxjs-interop'
import {BaseBlockComponent} from '../../../framework'
import type {EmbedBlockModel} from './index'
import {resolveEmbedUrl} from './source'
import {IframeCardComponent} from '../components/iframe-card'

@Component({
  selector: 'div.embed-block.embed-frame-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IframeCardComponent],
  template: `<embed-frame-card [block]="this" [props]="props" [isolateUrl]="isolateUrl" [url]="iframeUrl"
    [brand]="brand" [fontIcon]="true"></embed-frame-card>`,
})
export class EmbedBlockComponent extends BaseBlockComponent<EmbedBlockModel> {
  @ViewChild(IframeCardComponent) private card?: IframeCardComponent
  iframeUrl = ''
  isolateUrl = false
  brand = {icon: 'bc_wangluo', title: '网页'}

  override ngOnInit() {
    super.ngOnInit()
    this.syncSource()
    this.onPropsChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(changes => {
      if (changes.has('url')) this.syncSource()
    })
  }

  private syncSource() {
    const resolved = resolveEmbedUrl(this.props.url)
    this.iframeUrl = resolved?.iframeUrl ?? ''
    this.isolateUrl = !!resolved && new URL(resolved.iframeUrl).origin === window.location.origin
    this.brand = {icon: 'bc_wangluo', title: resolved?.platform ?? '网页'}
    this.changeDetectorRef.markForCheck()
  }

  getValidUrl() { return this.iframeUrl }
  reloadIframe() { this.card?.reload() }
}
