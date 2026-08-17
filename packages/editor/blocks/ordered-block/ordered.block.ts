import {ChangeDetectionStrategy, Component, HostBinding} from "@angular/core";
import {EditableBlockComponent} from "../../framework";
import {OrderedBlockModel} from "./index";
import {resolveOrderedMarker, resolveOrderedMarkerDigitScale} from "./utils";

@Component({
  selector: 'div.ordered-block',
  template: `
    <button type="button" class="ordered-block-prefix" contenteditable="false"
            [attr.data-bc-marker-enclosure]="marker.enclosure">
      <span class="ordered-block-prefix__text"
            [style.font-size]="markerDigitScale">{{ marker.text }}</span>
    </button>
    <div class="edit-container"></div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderedBlockComponent extends EditableBlockComponent<OrderedBlockModel> {

  @HostBinding('style.justify-content')
  override get textAlign() {
    return this._native.props['textAlign']
  }

  get marker() {
    return resolveOrderedMarker(
      this.props.order || 0,
      this.props.depth || 0,
      this.props.ms,
    )
  }

  get markerDigitScale() {
    const marker = this.marker
    return resolveOrderedMarkerDigitScale(marker.text, marker.enclosure)
  }
}
