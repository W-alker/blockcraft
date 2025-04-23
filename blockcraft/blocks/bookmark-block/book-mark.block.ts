import {ChangeDetectionStrategy, Component, ElementRef, ViewChild} from "@angular/core";
import {BaseBlockComponent, DOC_LINK_PREVIEWER_SERVICE_TOKEN} from "../../framework";
import {BookmarkBlockModel} from "./index";
import {JsonPipe} from "@angular/common";
import {HostUrlPipe} from "../embed-blocks";

@Component({
  selector: 'div.bookmark-block',
  template: `
    <div class="bookmark-content">
      <div class="bookmark-title">
        <div class="bookmark-icon">
          @if (props.icon) {
            <object draggable="false" type="image/png" #iconEle>
              <i class="bc_icon bc_wangluo"></i>
            </object>
          } @else {
            <i class="bc_icon bc_wangluo"></i>
          }
        </div>

        <h3 class="title" spellcheck="false">{{ props.title }}</h3>
      </div>

      <p class="bookmark-description" spellcheck="false">{{ props.description || '暂无更多信息' }}</p>
      <a class="bookmark-link" target="_blank" [href]="props.url">
        <span>{{ props.url | hostUrl }}</span>
        <i class="bc_icon bc_tiaozhuan"></i>
      </a>
    </div>

    <div class="bookmark-banner">
      @if (props.image) {
        <object type="image/webp" draggable="false" #bannerEle></object>
      } @else {
        <svg width="340" height="170" viewBox="0 0 340 170" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M0.000108291 4C4.84837e-05 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4L340.005 170H0.00460238L0.000108291 4Z"
            fill="#F4F4F5"></path>
          <path
            d="M47.4226 181.578L133.723 53.5251C136.164 49.904 141.057 48.9089 144.718 51.2892L345.111 181.578H47.4226Z"
            fill="#C0BFC1"></path>
          <path
            d="M0.00305283 184.375L71.1716 78.1816C73.6115 74.5409 78.5267 73.5413 82.195 75.9397L248.044 184.375H0.00305283Z"
            fill="#E3E2E4"></path>
          <ellipse cx="19.6135" cy="19.8036" rx="19.6135" ry="19.8036" transform="matrix(1 0 2.70729e-05 1 38 17)"
                   fill="#C0BFC1"></ellipse>
        </svg>
        <!--        <svg width="340" height="170" viewBox="0 0 340 170" fill="none" xmlns="http://www.w3.org/2000/svg">-->
          <!--          <path-->
          <!--            d="M0.000108291 4C4.84837e-05 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4L340.005 170H0.00460238L0.000108291 4Z"-->
          <!--            fill="#252525"></path>-->
          <!--          <path-->
          <!--            d="M47.4226 181.578L133.723 53.5251C136.164 49.904 141.057 48.9089 144.718 51.2892L345.111 181.578H47.4226Z"-->
          <!--            fill="#3E3E3F"></path>-->
          <!--          <path-->
          <!--            d="M0.00305283 184.375L71.1716 78.1816C73.6115 74.5409 78.5267 73.5413 82.195 75.9397L248.044 184.375H0.00305283Z"-->
          <!--            fill="#727272"></path>-->
          <!--          <ellipse cx="19.6135" cy="19.8036" rx="19.6135" ry="19.8036" transform="matrix(1 0 2.70729e-05 1 38 17)"-->
          <!--                   fill="#3E3E3F"></ellipse>-->
          <!--        </svg>-->
      }
    </div>
  `,
  standalone: true,
  imports: [
    JsonPipe,
    HostUrlPipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookMarkBlockComponent extends BaseBlockComponent<BookmarkBlockModel> {
  @ViewChild('iconEle', {read: ElementRef})
  iconEle?: ElementRef<HTMLObjectElement>;

  @ViewChild('bannerEle', {read: ElementRef})
  bannerEle?: ElementRef<HTMLObjectElement>;

  override ngAfterViewInit() {
    super.ngAfterViewInit();

    // 没有初始化过数据
    if (!this.props.title) {
      const linkPreviewerService = this.doc.injector.get(DOC_LINK_PREVIEWER_SERVICE_TOKEN)
      linkPreviewerService.query(this.props.url)
        .then((res) => {
          console.log('%c[BookMarkBlockComponent] query', 'color: #00b0ff', res)

          this.setInitProps({
            ...res,
            title: res.title ?? new HostUrlPipe().transform(this.props.url),
          })
          this.setIconAndBanner()
          this.changeDetectorRef.markForCheck()
          requestAnimationFrame(() => this.setIconAndBanner())
        })
        .catch(() => {
          this.doc.messageService.error('获取网页信息失败')
          this.setInitProps({
            title: this.props.url,
          })
        })
      return
    }

    this.setIconAndBanner()
  }

  setIconAndBanner() {
    if (this.iconEle && this.props.icon) {
      this.iconEle.nativeElement.data = this.props.icon
    }
    if (this.bannerEle && this.props.image) {
      this.bannerEle.nativeElement.data = this.props.image
    }

  }


}
