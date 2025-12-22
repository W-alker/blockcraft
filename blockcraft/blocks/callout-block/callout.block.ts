import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent, getPositionWithOffset} from "../../framework";
import {CalloutBlockModel} from "./index";
import {EmojiPickerComponent} from "../../components";
import {Subject, takeUntil} from "rxjs";

@Component({
  selector: 'div.callout-block',
  template: `
    <span class="callout-block-prefix" (mousedown)="onPickEmoji($event)"
          contenteditable="false">{{ props.prefix }}</span>
    <div>
<!--    <div class="children-render-container"></div>-->
<!--      <ng-container #childrenContainer></ng-container>-->
<!--    </div>-->
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.background-color]': 'props.backColor',
    '[style.color]': 'props.color',
    '[style.border-color]': 'props.borderColor',
  }
})
export class CalloutBlockComponent extends BaseBlockComponent<CalloutBlockModel> {

  // override ngAfterViewInit() {
  //   super.ngAfterViewInit();
  // this.hostElement.prepend(createBlockGapSpace())
  // this.hostElement.appendChild(createBlockGapSpace())
  // }
  private _closePicker$ = new Subject()

  override detach() {
    super.detach();
    this._closePicker$.next(true)
  }

  onPickEmoji(e: Event) {
    if(this.doc.isReadonly) return
    e.preventDefault();
    e.stopPropagation();

    const {componentRef} = this.doc.overlayService.createConnectedOverlay<EmojiPickerComponent>({
      component: EmojiPickerComponent,
      target: e.target as HTMLElement,
      backdrop: true,
      positions: [getPositionWithOffset('bottom-left', 0, 4), getPositionWithOffset('top-right', 0, 4)],
    }, this._closePicker$, () => {

    })

    componentRef.instance.emojiSelected.pipe(takeUntil(this._closePicker$)).subscribe(emoji => {
      this.updateProps({
        prefix: emoji
      })
    })

  }
}
