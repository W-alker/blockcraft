import {ChangeDetectionStrategy, Component, HostListener} from "@angular/core";
import {BaseBlock, USER_CHANGE_SIGNAL} from "../../core";
import {ILinkBlockModel} from "./type";
import {ComponentPortal} from "@angular/cdk/portal";
import {take} from "rxjs";
import {LinkBlockFloatDialog} from "./edit-dialog";
import {Overlay} from "@angular/cdk/overlay";
import {NgIf} from "@angular/common";
import {FloatToolbar, IToolbarItem} from "../../components";

const TOOLBAR_LIST: IToolbarItem[] = [
  {
    icon: 'bf_icon bf_open-link',
    text: '打开',
    title: '打开链接',
    name: 'open',
  },
  {
    name: '|',
  },
  {
    icon: 'bf_icon bf_bianji_1',
    title: '编辑',
    name: 'edit',
  },
  // {
  //   icon: 'bf_icon bf_fuzhi',
  //   title: '复制',
  //   name: 'copy',
  // },
  {
    icon: 'bf_icon bf_jiebang',
    title: '解除链接',
    name: 'unlink',
  },
]
@Component({
  selector: 'link-block',
  template: `
    <ng-container *ngIf="props.text else empty">
      <ng-container *ngIf="props.appearance === 'text' else card">
        <div class="text">
          <i class="bf_icon bf_lianjie"></i>
          <span>{{props.text}}</span>
        </div>
      </ng-container>

      <ng-template #card>
        <div class="card">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none">
            <path
              d="M9.5999 16.8004C11.5095 16.8004 13.3408 16.0418 14.6911 14.6916C16.0413 13.3413 16.7999 11.5099 16.7999 9.60039C16.7999 7.69083 16.0413 5.85948 14.6911 4.50922C13.3408 3.15896 11.5095 2.40039 9.5999 2.40039C7.69034 2.40039 5.859 3.15896 4.50873 4.50922C3.15847 5.85948 2.3999 7.69083 2.3999 9.60039C2.3999 11.5099 3.15847 13.3413 4.50873 14.6916C5.859 16.0418 7.69034 16.8004 9.5999 16.8004ZM29.9999 8.40039C30.3151 8.40043 30.6272 8.33838 30.9184 8.21778C31.2096 8.09719 31.4743 7.92041 31.6971 7.69755C31.92 7.47469 32.0968 7.2101 32.2175 6.9189C32.3381 6.6277 32.4002 6.31559 32.4002 6.00039C32.4002 5.68519 32.3381 5.37308 32.2175 5.08188C32.0968 4.79068 31.92 4.5261 31.6971 4.30323C31.4743 4.08037 31.2096 3.90359 30.9184 3.783C30.6272 3.6624 30.3151 3.60035 29.9999 3.60039C29.3634 3.60047 28.7531 3.85336 28.303 4.30344C27.853 4.75352 27.6002 5.36392 27.6002 6.00039C27.6002 6.63686 27.853 7.24726 28.303 7.69734C28.7531 8.14742 29.3634 8.40031 29.9999 8.40039Z"
              fill="url(#paint0_linear_4241_86575)"/>
            <path
              d="M7.7112 12.131C8.94702 10.5906 10.5133 9.34769 12.2942 8.4942C14.0751 7.64072 16.0251 7.19848 18 7.2002C19.9749 7.19848 21.9249 7.64072 23.7058 8.4942C25.4867 9.34769 27.053 10.5906 28.2888 12.131C29.0064 12.3386 29.6844 12.5678 30.318 12.8162C31.92 13.4462 33.2988 14.225 34.296 15.1514C35.2956 16.0802 36 17.2442 36 18.6002C36 19.9562 35.2956 21.1202 34.296 22.049C33.2988 22.9754 31.92 23.7542 30.318 24.3842C27.1056 25.6442 22.752 26.4002 18 26.4002C13.2492 26.4002 8.8944 25.6454 5.682 24.3842C4.08 23.7542 2.7012 22.9754 1.704 22.049C0.7044 21.1202 0 19.9562 0 18.6002C0 17.2442 0.7044 16.0802 1.704 15.1514C2.7012 14.225 4.08 13.4462 5.682 12.8162C6.3471 12.5567 7.02382 12.3281 7.71 12.131H7.7112ZM5.7912 15.3746C4.7304 15.8558 3.9072 16.3802 3.3372 16.9106C2.6364 17.561 2.4 18.1346 2.4 18.6002C2.4 19.067 2.6364 19.6394 3.336 20.2898C3.79183 20.6993 4.29453 21.0533 4.8336 21.3446C4.68514 19.3072 5.013 17.2633 5.7912 15.3746ZM31.1664 21.3446C31.7051 21.0532 32.2073 20.6992 32.6628 20.2898C33.3636 19.6394 33.6 19.0658 33.6 18.6002C33.6 18.1334 33.3636 17.561 32.664 16.9106C32.0916 16.3802 31.2696 15.8558 30.21 15.3746C30.9878 17.2634 31.3152 19.3073 31.1664 21.3446ZM18 33.6002C15.6252 33.601 13.2942 32.961 11.2528 31.7476C9.21131 30.5343 7.53508 28.7926 6.4008 26.7062C9.708 28.0358 13.7124 28.8002 18 28.8002C22.2876 28.8002 26.292 28.0358 29.5992 26.7062C28.4649 28.7926 26.7887 30.5343 24.7472 31.7476C22.7058 32.961 20.3748 33.601 18 33.6002Z"
              fill="url(#paint1_linear_4241_86575)"/>
            <path
              d="M5.87988 25.6377C6.90281 28.0027 8.59539 30.0167 10.749 31.4315C12.9026 32.8463 15.4231 33.6 17.9999 33.5997C23.4287 33.5997 28.0919 30.3225 30.1199 25.6377C26.6639 26.8761 22.4915 27.5997 17.9999 27.5997C13.5071 27.5997 9.33588 26.8761 5.87988 25.6377Z"
              fill="url(#paint2_linear_4241_86575)"/>
            <path
              d="M22.8 15.5998C23.1152 15.5998 23.4274 15.5378 23.7186 15.4172C24.0098 15.2966 24.2744 15.1198 24.4973 14.897C24.7202 14.6741 24.897 14.4095 25.0176 14.1183C25.1383 13.8271 25.2003 13.515 25.2003 13.1998C25.2003 12.8846 25.1383 12.5725 25.0176 12.2813C24.897 11.9901 24.7202 11.7255 24.4973 11.5026C24.2744 11.2798 24.0098 11.103 23.7186 10.9824C23.4274 10.8618 23.1152 10.7998 22.8 10.7998C22.1636 10.7999 21.5532 11.0528 21.1032 11.5029C20.6532 11.9529 20.4003 12.5633 20.4003 13.1998C20.4003 13.8363 20.6532 14.4467 21.1032 14.8968C21.5532 15.3468 22.1636 15.5997 22.8 15.5998ZM14.4 22.7998C15.3548 22.7998 16.2705 22.4205 16.9456 21.7454C17.6208 21.0703 18 20.1546 18 19.1998C18 18.245 17.6208 17.3294 16.9456 16.6542C16.2705 15.9791 15.3548 15.5998 14.4 15.5998C13.4453 15.5998 12.5296 15.9791 11.8545 16.6542C11.1793 17.3294 10.8 18.245 10.8 19.1998C10.8 20.1546 11.1793 21.0703 11.8545 21.7454C12.5296 22.4205 13.4453 22.7998 14.4 22.7998Z"
              fill="white"/>
            <defs>
              <linearGradient id="paint0_linear_4241_86575" x1="17.4" y1="2.40039" x2="17.4" y2="16.8004"
                              gradientUnits="userSpaceOnUse">
                <stop stop-color="#BDCCFF"/>
                <stop offset="0.945" stop-color="#79BFFF"/>
              </linearGradient>
              <linearGradient id="paint1_linear_4241_86575" x1="18" y1="7.2002" x2="18" y2="33.6002"
                              gradientUnits="userSpaceOnUse">
                <stop stop-color="#BDCCFF"/>
                <stop offset="0.945" stop-color="#79BFFF"/>
              </linearGradient>
              <linearGradient id="paint2_linear_4241_86575" x1="17.9999" y1="25.6377" x2="17.9999" y2="33.5997"
                              gradientUnits="userSpaceOnUse">
                <stop stop-color="#BDCCFF"/>
                <stop offset="0.945" stop-color="#79BFFF"/>
              </linearGradient>
            </defs>
          </svg>
          <div class="info">
            <p>{{props.text}}</p>
            <p>{{props.href}}</p>
          </div>
        </div>
      </ng-template>
    </ng-container>

    <ng-template #empty>
      <div class="empty">插入链接</div>
    </ng-template>
  `,
  styles: [`
      :host {
          display: block;
          cursor: pointer;
          font-size: 16px;
      }

      :host .text {
          display: flex;
          align-items: center;
          gap: 4px;
          height: 36px;
          color: #4857E2;
      }

      :host .text:hover {
          text-decoration: underline;
      }

      :host .card {
          position: relative;
          padding: 10px 8px 10px 50px;
          border-radius: 8px;
          background: #EAF3FE;
      }

      :host .card > svg {
          position: absolute;
          left: 8px;
          top: 50%;
          transform: translateY(-50%);
      }

      :host .card .info > p {
          margin: 0;
          color: #999;
          line-height: 20px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
      }

      :host .card .info > p:first-child {
          margin-bottom: 4px;
          color: #333;
          font-weight: bold;
      }

      :host .empty {
          flex: 1;
          padding: 0 8px;
          line-height: 36px;
          color: #999;
          height: 36px;
          border-radius: 4px;
          border: 1px solid #4857E2;
      }
  `],
  standalone: true,
  imports: [
    NgIf
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LinkBlock extends BaseBlock<ILinkBlockModel> {

  constructor(
    private readonly ovr: Overlay,
  ) {
    super();
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    // this.onSetLink()
  }

  @HostListener('click', ['$event'])
  onClick(e: MouseEvent) {
    e.stopPropagation()
    const portal = new ComponentPortal(FloatToolbar)
    const ovr = this.createOverlay()
    const cpr = ovr.attach(portal)
    cpr.setInput('toolbarList', TOOLBAR_LIST)
    cpr.instance.itemClick.pipe(take(1)).subscribe(({item, event}) => {
      switch (item.name) {
        case 'open':
          this.props.href && window.open(this.props.href)
          break
        case 'edit':
          this.onSetLink()
          break
        case 'unlink':
          this.unLink()
          break
      }
      ovr.dispose()
    })
  }

  createOverlay() {
    const positionStrategy = this.ovr.position().flexibleConnectedTo(this.hostEl.nativeElement).withPositions([
      {originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top'},
      {originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom'},
    ])
    const overlayRef = this.ovr.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop'
    })
    overlayRef.backdropClick().pipe(take(1)).subscribe(() => {
      overlayRef.dispose()
    })
    return overlayRef
  }

  onSetLink() {
    const overlayRef = this.createOverlay()
    const portal = new ComponentPortal(LinkBlockFloatDialog)
    const cpr = overlayRef.attach(portal)
    cpr.instance.close.pipe(take(1))
      .subscribe(() => {
        overlayRef.dispose()
      })
    cpr.setInput('attrs', this.props)
    cpr.instance.update.pipe(take(1)).subscribe(v => {
      this.controller.transact(() => {
        v.text !== this.props.text && this.setProp('text', v.text)
        v.href !== this.props.href && this.setProp('href', v.href)
        v.appearance !== this.props.appearance && this.setProp('appearance', v.appearance)
      }, USER_CHANGE_SIGNAL)
      overlayRef.dispose()
      this.cdr.markForCheck()
    })
  }

  unLink() {
    const deltas = [{insert: this.props.text}]
    const block = this.controller.createBlock('paragraph', [deltas])
    this.controller.replaceWith(this.id, block).then(() => {
      this.controller.setSelection(block.id, 0)
    })
  }

}
