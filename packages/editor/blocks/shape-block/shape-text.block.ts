import {ChangeDetectionStrategy, Component} from '@angular/core'
import {EditableBlockComponent} from '../../framework'
import type {ShapeTextBlockModel} from './index'

@Component({
  selector: 'div.shape-text-block',
  template: '',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.edit-container]': 'true',
    // shape-text lives inside the object shell (`contenteditable=false`).
    // Re-enable editing at the actual text boundary while still respecting
    // document/block readonly state.
    '[attr.contenteditable]': "isReadonly ? 'false' : 'true'",
  },
})
export class ShapeTextBlockComponent
  extends EditableBlockComponent<ShapeTextBlockModel> {}
