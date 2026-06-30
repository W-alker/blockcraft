import { ChangeDetectionStrategy, Component } from "@angular/core";
import { BaseBlockComponent, getPositionWithOffset } from "../../framework";
import { CalloutBlockModel } from "./index";
import { EmojiPickerComponent } from "../../components";
import { Subject, takeUntil } from "rxjs";

@Component({
  selector: 'div.callout-block',
  template: `
    <!-- Gap-cursor PoC: prefix + content live inside .bc-block-content (the STANDARD
         wrapper the uniform base.scss rule keys off via :has(> .bc-block-content)).
         The host becomes a flex COLUMN [leading gap] / .bc-block-content / [trailing
         gap]; the gap fillers are prepended/appended to the HOST (see
         BaseBlockComponent.ngAfterViewInit), i.e. siblings of .bc-block-content.
         children-render-container is found via querySelector, so wrapping is safe. -->
    <div class="bc-block-content">
      <span class="callout-block-prefix" (mousedown)="onPickEmoji($event)"
            contenteditable="false">{{ props.prefix }}
      </span>
      <div class="callout-content children-render-container">
      </div>
    </div>
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
    if (this.doc.isReadonly) return
    e.preventDefault();
    e.stopPropagation();

    const { componentRef } = this.doc.overlayService.createConnectedOverlay<EmojiPickerComponent>({
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
