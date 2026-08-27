import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import {
  CsColorPickerComponent,
  CsInputNumberComponent,
  CsOptionComponent,
  CsSelectComponent,
  CsTooltipDirective,
} from "@cses/ui";
import {
  createObjectPaint,
  type ObjectPaint,
  type ObjectPaintType,
} from "../../framework";
import {
  DEFAULT_SHAPE_GRADIENT,
  shapeGradientToCss,
  SHAPE_FILL_GRADIENT_PRESETS,
  type ShapeFillGradientPreset,
  type ShapeGradientFill,
} from "../../blocks/shape-block";

/**
 * The established Shape fill surface, now backed by the unified ObjectPaint
 * value. It remains internal to ObjectFormatToolbarPlugin; the removed legacy
 * ShapeToolbar public action contract is not restored.
 */
@Component({
  selector: "bc-shape-fill-panel",
  standalone: true,
  imports: [
    CsColorPickerComponent,
    CsInputNumberComponent,
    CsOptionComponent,
    CsSelectComponent,
    CsTooltipDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="shape-fill-panel" aria-label="对象填充">
      <label class="shape-fill-panel__row">
        <span class="shape-fill-panel__label">填充方式</span>
        <cs-select
          class="shape-fill-panel__control"
          csSize="sm"
          csVariant="outlined"
          [csValue]="paint.type"
          (csValueChange)="setFillType($event)"
        >
          <cs-option csValue="none" csLabel="无填充" />
          <cs-option csValue="solid" csLabel="纯色填充" />
          <cs-option csValue="linear-gradient" csLabel="渐变填充" />
          <cs-option
            csValue="picture"
            csLabel="图片填充"
            [csDisabled]="!pictureEnabled"
          />
        </cs-select>
      </label>

      @if (paint.type === "solid") {
        <div class="shape-fill-panel__row">
          <span class="shape-fill-panel__label">颜色</span>
          <cs-color-picker
            csMode="palette"
            csSize="sm"
            [csValue]="paint.color"
            [csAllowClear]="false"
            [csShowText]="true"
            [csShowAlpha]="false"
            (csChangeComplete)="setSolidColor($event.value)"
          />
        </div>
      } @else if (paint.type === "linear-gradient") {
        <div
          class="shape-fill-panel__presets"
          role="listbox"
          aria-label="内置渐变"
        >
          @for (preset of presets; track preset.id) {
            <button
              type="button"
              role="option"
              class="shape-fill-panel__preset"
              [class.active]="isPresetActive(preset)"
              [attr.aria-selected]="isPresetActive(preset)"
              [attr.aria-label]="preset.label"
              [csTooltip]="preset.label"
              [style.background]="presetCss(preset)"
              (click)="applyPreset(preset)"
            ></button>
          }
        </div>

        <div class="shape-fill-panel__row">
          <span class="shape-fill-panel__label">起始颜色</span>
          <cs-color-picker
            csMode="palette"
            csSize="sm"
            [csValue]="gradientStart"
            [csAllowClear]="false"
            [csShowText]="true"
            [csShowAlpha]="false"
            (csChangeComplete)="setGradientEdgeColor('start', $event.value)"
          />
        </div>
        <div class="shape-fill-panel__row">
          <span class="shape-fill-panel__label">结束颜色</span>
          <cs-color-picker
            csMode="palette"
            csSize="sm"
            [csValue]="gradientEnd"
            [csAllowClear]="false"
            [csShowText]="true"
            [csShowAlpha]="false"
            (csChangeComplete)="setGradientEdgeColor('end', $event.value)"
          />
        </div>
        <label class="shape-fill-panel__row">
          <span class="shape-fill-panel__label">渐变角度</span>
          <cs-input-number
            csSize="sm"
            [csMin]="0"
            [csMax]="360"
            [csStep]="15"
            [csValue]="gradient.angle"
            (csValueChange)="setGradientAngle($event)"
          />
          <span class="shape-fill-panel__unit">°</span>
        </label>
      }
    </section>
  `,
  styles: [
    `
      /* Established embedded fill fragment; its host owns the outer card. */
      .shape-fill-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
        box-sizing: border-box;
        color: var(--bc-color, #1f2937);
        font-size: 12px;
      }

      .shape-fill-panel__row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .shape-fill-panel__label {
        flex: none;
        width: 52px;
        color: var(--bc-color-secondary, #64748b);
      }

      .shape-fill-panel__control {
        flex: 1;
        min-width: 0;
      }

      .shape-fill-panel__unit {
        color: var(--bc-color-secondary, #64748b);
      }

      .shape-fill-panel__presets {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 6px;
      }

      .shape-fill-panel__preset {
        box-sizing: border-box;
        aspect-ratio: 1;
        padding: 0;
        border: 1px solid var(--bc-border-color, #e2e8f0);
        border-radius: 6px;
        cursor: pointer;
      }

      .shape-fill-panel__preset:hover {
        border-color: var(--bc-active-color, #4857e2);
      }

      .shape-fill-panel__preset.active {
        border-color: var(--bc-active-color, #4857e2);
        box-shadow: 0 0 0 2px
          var(--bc-active-color-lighter, rgba(72, 87, 226, 0.18));
      }
    `,
  ],
})
export class ShapeFillPanelComponent {
  @Input({ required: true }) paint!: ObjectPaint;
  @Input() pictureEnabled = true;

  @Output() readonly paintChange = new EventEmitter<ObjectPaint>();

  readonly presets = SHAPE_FILL_GRADIENT_PRESETS;

  get gradient(): ShapeGradientFill {
    return this.paint.type === "linear-gradient" && this.paint.stops.length >= 2
      ? {
          angle: this.paint.angle,
          colors: this.paint.stops.map(stop => stop.color),
          stops: this.paint.stops.map(stop => stop.offset),
        }
      : {
          angle: DEFAULT_SHAPE_GRADIENT.angle,
          colors: [...DEFAULT_SHAPE_GRADIENT.colors],
          stops: [...DEFAULT_SHAPE_GRADIENT.stops],
        };
  }

  get gradientStart(): string {
    return this.gradient.colors[0];
  }

  get gradientEnd(): string {
    return this.gradient.colors[this.gradient.colors.length - 1];
  }

  presetCss(preset: ShapeFillGradientPreset): string {
    return shapeGradientToCss(preset);
  }

  isPresetActive(preset: ShapeFillGradientPreset): boolean {
    const current = this.gradient;
    return (
      current.angle === preset.angle &&
      current.colors.length === preset.colors.length &&
      current.colors.every((color, index) => color === preset.colors[index]) &&
      current.stops.every((stop, index) => stop === preset.stops[index])
    );
  }

  setFillType(value: unknown): void {
    if (!isPaintType(value) || value === this.paint.type) return;
    if (value === "linear-gradient") {
      this.emitGradient(this.gradient);
      return;
    }
    this.paintChange.emit(createObjectPaint(value, this.paint));
  }

  setSolidColor(value: string | null): void {
    if (!value) return;
    this.paintChange.emit({
      type: "solid",
      color: value,
      opacity: this.paint.type === "solid" ? this.paint.opacity : 1,
    });
  }

  applyPreset(preset: ShapeFillGradientPreset): void {
    this.emitGradient(preset);
  }

  setGradientEdgeColor(edge: "start" | "end", value: string | null): void {
    if (!value) return;
    const current = this.gradient;
    const colors = [...current.colors];
    colors[edge === "start" ? 0 : colors.length - 1] = value;
    this.emitGradient({ ...current, colors });
  }

  setGradientAngle(value: number | null): void {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    this.emitGradient({ ...this.gradient, angle: value });
  }

  private emitGradient(gradient: ShapeGradientFill): void {
    const currentStops = this.paint.type === "linear-gradient"
      ? this.paint.stops
      : [];
    this.paintChange.emit({
      type: "linear-gradient",
      opacity: this.paint.type === "linear-gradient" ? this.paint.opacity : 1,
      angle: gradient.angle,
      stops: gradient.colors.map((color, index) => ({
        color,
        offset: gradient.stops[index] ?? index / Math.max(1, gradient.colors.length - 1),
        opacity: currentStops[index]?.opacity ?? 1,
      })),
    });
  }
}

function isPaintType(value: unknown): value is ObjectPaintType {
  return (
    value === "none" ||
    value === "solid" ||
    value === "linear-gradient" ||
    value === "picture"
  );
}
