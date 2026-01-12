import {AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, ViewChild} from "@angular/core";
import {IBaseEmbedBlockProps} from "../base.block";
import {HostUrlPipe} from "../pipes";
import {NgIf} from "@angular/common";
import {MatIcon} from "@angular/material/icon";

@Component({
  selector: 'embed-frame-card',
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
    <a class="iframe-link" target="_blank" [href]="props.url" contenteditable="false">
      <span>{{ props.url | hostUrl }}</span>
      <i class="bc_icon bc_tiaozhuan"></i>
    </a>
  `,
  standalone: true,
  imports: [
    HostUrlPipe,
    NgIf,
    MatIcon
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.width]': 'props.width ? props.width + "px" : "100%"',
    '[style.height]': 'props.height ? props.height + "px" : "100%"',
  }
})
export class IframeCardComponent implements AfterViewInit {
  @Input({required: true})
  props!: IBaseEmbedBlockProps

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

  ngAfterViewInit() {
    this.isViewInit = true
    if(!this.url) return
    this.iframe.nativeElement.src = this._url
  }
}
