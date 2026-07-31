import { ChangeDetectionStrategy, Component } from '@angular/core'

/**
 * 模板装饰自有的多色 SVG symbol。挂在编辑、使用两个 surface 上，保证任何消费
 * schema.svgIcon 的控件（插入面板、BlockController 等）都能解析同一个 symbol id。
 * bc_* 单色图标仍由全局 iconfont sprite 提供。
 */
@Component({
  selector: 'template-svg-sprite',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg aria-hidden="true" class="template-svg-sprite">
      <symbol id="tpl-weather" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="5" fill="#FBBF24"/>
        <g stroke="#FBBF24" stroke-width="2" stroke-linecap="round">
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8"/>
        </g>
      </symbol>
    </svg>
  `,
  styles: [`
    :host,
    .template-svg-sprite {
      position: absolute;
      width: 0;
      height: 0;
      overflow: hidden;
      pointer-events: none;
    }
  `],
})
export class TemplateSvgSpriteComponent {}
