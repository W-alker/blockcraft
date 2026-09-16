import {ChangeDetectionStrategy, Component} from '@angular/core'
import {
  BLOCK_OBJECT_GROUP_PADDING,
  BaseBlockComponent,
  normalizeBlockObjectGroupProps,
} from '../../framework'
import type {ObjectGroupBlockModel} from './index'

@Component({
  selector: 'div.object-group-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.contenteditable]': "'false'",
    '[attr.data-bc-object-group]': "''",
    '[style.width.px]': 'groupProps.width',
    '[style.height.px]': 'groupProps.height',
    '[style.box-sizing]': "'border-box'",
    '[style.padding.px]': '0',
    '[style.--bc-object-group-padding.px]': 'groupPadding',
    '[style.overflow]': "'visible'",
  },
  template: `
    <div class="object-group-block__children children-render-container">
    </div>
    @if (!isReadonly) {
      @for (edge of moveEdges; track edge) {
        <span
          class="object-group-block__move-edge"
          [attr.data-move-edge]="edge"
          contenteditable="false"
          aria-hidden="true">
        </span>
      }
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    .object-group-block__children {
      position: relative;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      isolation: isolate;
      overflow: visible;
    }

    :host(.selected),
    :host(.bc-object-group--selection-within) {
      background: transparent !important;
      outline: 2px solid var(--bc-active-color, #4857e2);
      outline-offset: var(--bc-object-group-padding);
    }

    /* Keep drag hit areas outside the content plane so member resize handles
       at its boundary remain reachable with the 4px frame outset. */
    .object-group-block__move-edge {
      position: absolute;
      z-index: 5;
      display: none;
      pointer-events: auto;
      touch-action: none;
      cursor: move;
    }

    :host([data-bc-placement='absolute'].selected) >
      /* Keep drag hit areas outside the content plane so member resize handles
       at its boundary remain reachable with the 4px frame outset. */
    .object-group-block__move-edge {
      display: block;
    }

    .object-group-block__move-edge[data-move-edge='north'] {
      top: calc(-3px - var(--bc-object-group-padding));
      right: calc(-3px - var(--bc-object-group-padding));
      left: calc(-3px - var(--bc-object-group-padding));
      height: 6px;
    }

    .object-group-block__move-edge[data-move-edge='east'] {
      top: calc(-3px - var(--bc-object-group-padding));
      right: calc(-3px - var(--bc-object-group-padding));
      bottom: calc(-3px - var(--bc-object-group-padding));
      width: 6px;
    }

    .object-group-block__move-edge[data-move-edge='south'] {
      right: calc(-3px - var(--bc-object-group-padding));
      bottom: calc(-3px - var(--bc-object-group-padding));
      left: calc(-3px - var(--bc-object-group-padding));
      height: 6px;
    }

    .object-group-block__move-edge[data-move-edge='west'] {
      top: calc(-3px - var(--bc-object-group-padding));
      bottom: calc(-3px - var(--bc-object-group-padding));
      left: calc(-3px - var(--bc-object-group-padding));
      width: 6px;
    }
  `],
})
export class ObjectGroupBlockComponent
  extends BaseBlockComponent<ObjectGroupBlockModel> {
  readonly groupPadding = BLOCK_OBJECT_GROUP_PADDING
  readonly moveEdges = ['north', 'east', 'south', 'west'] as const

  get groupProps() {
    return normalizeBlockObjectGroupProps(this.props)
  }
}
