import { ChangeDetectionStrategy, Component } from '@angular/core'
import { PlaceableDecoBase } from '../_shared/placeable-deco.base'
import type { LogoModel } from './logo.deco'

// 三态排版的 host 绑定继承自 PlaceableDecoBase（与编辑组件同一份规则）；使用态只渲染、不拖
@Component({
  selector: 'div.logo-template-render-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (props.src) { <img class="tpl-img" [src]="props.src" alt="logo" /> } @else { <span class="tpl-empty" contenteditable="false">[Logo]</span> }`,
})
export class LogoTemplateRenderComponent extends PlaceableDecoBase<LogoModel> {}
