import {ChangeDetectionStrategy, Component, HostBinding} from "@angular/core";
import {EditableBlockComponent} from "../../framework";
import {BulletBlockModel} from "./index";

@Component({
  selector: "div.bullet-block",
  template: `
    <span class="bullet-block-prefix" contenteditable="false">
      @switch (bulletType) {
        @case (2) {
          <span class="square"></span>
        }
        @case (1) {
          <span class="circle"></span>
        }
        @default {
          <span class="point"></span>
        }
      }
    </span>
    <div class="edit-container"></div>
  `,
  styles: [`
    :host {
      display: flex;
    }
  `],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BulletBlockComponent extends EditableBlockComponent<BulletBlockModel> {
  @HostBinding('style.justify-content')
  get listJustifyContent() {
    const align = this.props.textAlign
    return align === 'center' || align === 'right' ? align : undefined
  }

  get bulletType() {
    return (this.props.depth + 1) % 3 === 0 ? 2 : (this.props.depth & 1)
  }
}
