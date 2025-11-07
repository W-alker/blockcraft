import {Component, ElementRef, Input, ViewChild} from "@angular/core";
import {BaseBlockComponent} from "../../../framework";
import {HostUrlPipe} from "../pipes";
import {MatIcon} from "@angular/material/icon";
import {NgIf} from "@angular/common";
import {EmbedBlockModel} from "./index";

@Component({
  selector: "div.embed-block",
  template: `
    <div class="iframe-wrapper">
      <iframe loading="lazy" allowfullscreen #iframeEle
              sandbox="allow-scripts allow-same-origin allow-presentation allow-forms allow-popups allow-downloads allow-storage-access-by-user-activation"
              draggable="false"
              allow="encrypted-media;clipboard-read *;clipboard-write *;" referrerpolicy=""
              data-iframe-will-auto-focus="1"
              frameborder="0" data-aha-samesite=""></iframe>
      <div class="iframe-mask"></div>
    </div>
    <div class="iframe-brand" *ngIf="brand">
      <mat-icon [svgIcon]="brand.icon"></mat-icon>
      <span spellcheck="false">{{ brand.title }}</span>
    </div>
    <a class="iframe-link" target="_blank" [href]="props.url">
      <span>{{ props.url | hostUrl }}</span>
      <i class="bc_icon bc_tiaozhuan"></i>
    </a>
  `,
  standalone: true,
  imports: [
    HostUrlPipe,
    MatIcon,
    NgIf
  ]
})
export class EmbedBlockComponent extends BaseBlockComponent<EmbedBlockModel> {

  private _url = ''
  @Input()
  set url(value: string) {
    this._url = value
    if (!value || !this.isViewInit) return
    this.iframe.nativeElement.src = value
  }

  get url() {
    return this._url
  }

  @ViewChild('iframeEle', {read: ElementRef})
  iframe!: ElementRef<HTMLIFrameElement>

  isViewInit = false

  @Input()
  brand?: {
    icon: string
    title: string
  }

  protected _iframeUrl: string = ''

  override ngOnInit() {
    super.ngOnInit();
    this._iframeUrl = this.getValidUrl()
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.isViewInit = true
    if (!this.url) return
    this.iframe.nativeElement.src = this._url
    this.changeDetectorRef.markForCheck()
  }

  getValidUrl() {
    return this.props.url
  }

  reloadIframe() {
    this.hostElement.querySelector('iframe')!.src = this._iframeUrl = this.getValidUrl()
  }

}
