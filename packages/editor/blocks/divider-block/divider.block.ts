import {ChangeDetectionStrategy, Component} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {DividerBlockModel, DividerLength, DividerThickness} from "./index";

@Component({
  selector: 'div.divider-block',
  template: `
    <!-- Gap-cursor PoC: content wrapped in .bc-block-content so the host becomes a
         flex [leading gap] / .bc-block-content / [trailing gap] column (see the
         uniform rule in base.scss). Gap fillers are prepended/appended to the HOST. -->
    <div class="bc-block-content"
         [style.--bc-divider-line-color]="props.lineColor || null">
      @if (props.text) {
        @if (isTape) {
          <div [class]="['divide-line', 'divide-tape', resolvedStyle]"
               [attr.data-length]="resolvedLength"
               [attr.data-thickness]="resolvedThickness"
               [attr.data-align]="align"
               [style.opacity]="dividerOpacity"
               contenteditable="false">
            <span class="divide-label"
                  [style.color]="props.color || null"
                  [style.font-size.px]="labelFontSize"
                  [style.font-weight]="labelFontWeight"
                  [style.font-style]="labelFontStyle"
                  [style.letter-spacing.px]="labelLetterSpacing">{{ props.text }}</span>
          </div>
        } @else {
          <div class="divide-line-text"
               [attr.data-length]="resolvedLength"
               [attr.data-thickness]="resolvedThickness"
               [attr.data-align]="align"
               [style.opacity]="dividerOpacity"
               contenteditable="false">
            <span [class]="['divide-seg', resolvedStyle]"></span>
            <span class="divide-label"
                  [style.color]="props.color || null"
                  [style.font-size.px]="labelFontSize"
                  [style.font-weight]="labelFontWeight"
                  [style.font-style]="labelFontStyle"
                  [style.letter-spacing.px]="labelLetterSpacing">{{ props.text }}</span>
            <span [class]="['divide-seg', resolvedStyle]"></span>
          </div>
        }
      } @else {
        <div [class]="['divide-line', resolvedStyle]"
             [attr.data-length]="resolvedLength"
             [attr.data-thickness]="resolvedThickness"
             [style.opacity]="dividerOpacity"
             contenteditable="false"></div>
      }
    </div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DividerBlockComponent extends BaseBlockComponent<DividerBlockModel> {
  get resolvedStyle(): string {
    return this.props.style || 'solid';
  }

  get isTape(): boolean {
    return this.resolvedStyle.startsWith('tape');
  }

  get align(): string {
    return this.props.align ?? 'center';
  }

  get resolvedLength(): DividerLength {
    if (this.props.length === 'short' || this.props.length === 'medium'
      || this.props.length === 'long' || this.props.length === 'full') {
      return this.props.length;
    }

    switch (this.props.size) {
      case 'thin':
        return 'short';
      case 'small':
        return 'medium';
      case 'large':
        return 'full';
      default:
        return 'long';
    }
  }

  get resolvedThickness(): DividerThickness {
    if (this.props.thickness === 'thin' || this.props.thickness === 'regular'
      || this.props.thickness === 'thick') {
      return this.props.thickness;
    }

    if (this.props.size === 'thin' || this.props.size === 'small') {
      return 'thin';
    }
    return this.props.size === 'large' ? 'thick' : 'regular';
  }

  get dividerOpacity(): number {
    const value = Number(this.props.opacity);
    return Number.isFinite(value) ? Math.min(1, Math.max(0.1, value)) : 1;
  }

  get labelFontSize(): number {
    const value = Number(this.props.fontSize);
    return Number.isFinite(value) ? Math.min(32, Math.max(10, value)) : 14;
  }

  get labelFontWeight(): string {
    return this.props.fontWeight === 'bold' ? '700' : '400';
  }

  get labelFontStyle(): string {
    return this.props.fontStyle === 'italic' ? 'italic' : 'normal';
  }

  get labelLetterSpacing(): number {
    const value = Number(this.props.letterSpacing);
    return Number.isFinite(value) ? Math.min(8, Math.max(0, value)) : 0;
  }
}
