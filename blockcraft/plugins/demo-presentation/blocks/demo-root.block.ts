import {ChangeDetectionStrategy, Component} from "@angular/core";
import {RootBlockComponent} from "../../../blocks/root-block/root.block";

@Component({
  selector: `div.root-block[data-blockcraft-root="true"]`,
  template: `
    <div class="children-render-container"></div>
  `,
  styles: [`
    :host {
      width: 100%;
      --bc-segments-gap: 24px;
      --bc-fs: 22px;
      --bc-lh: 30px;

      margin: 0 auto;
      min-height: calc(100% - 20vh);
      display: flex;
      flex-direction: column;
      justify-content: center;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;

      @keyframes slideIn {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      ::ng-deep * {
        cursor: default !important;
      }

      ::ng-deep > [data-block-id] {
        opacity: 0;
        transform: translateY(20px);
        animation: slideIn 600ms ease forwards;
      }

      ::ng-deep .page-divider-block {
        display: none;
      }

      ::ng-deep [data-node-type='editable'] {
        &[data-heading] {
          font-weight: bolder;
        }

        &[data-heading='1'] {
          font-size: calc(var(--bc-fs) * 2);
          line-height: calc(var(--bc-lh) * 2);
        }

        &[data-heading='2'] {
          font-size: calc(var(--bc-fs) * 1.8);
          line-height: calc(var(--bc-lh) * 1.8);
        }

        &[data-heading='3'] {
          font-size: calc(var(--bc-fs) * 1.6);
          line-height: calc(var(--bc-lh) * 1.6);
        }

        &[data-heading='4'] {
          font-size: calc(var(--bc-fs) * 1.4);
          line-height: calc(var(--bc-lh) * 1.4);
        }
      }
    }
  `],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  host: {
    '[style.font-family]': 'props.ff',
  }
})
export class DemoRootComponent extends RootBlockComponent{
}
