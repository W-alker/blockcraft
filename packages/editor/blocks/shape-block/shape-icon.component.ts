import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core'

@Component({
  selector: 'bc-shape-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false">
      <path
        [attr.d]="path()"
        vector-effect="non-scaling-stroke">
      </path>
      @if (detailPath()) {
        <path
          [attr.d]="detailPath()"
          vector-effect="non-scaling-stroke">
        </path>
      }
    </svg>
  `,
  styles: [`
    :host {
      display: inline-flex;
      width: 1em;
      height: 1em;
      flex: 0 0 auto;
      color: inherit;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    path {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `],
})
export class ShapeIconComponent {
  readonly path = input.required<string>()
  readonly detailPath = input<string>()
}
