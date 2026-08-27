import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from "@angular/core";
import { CsTabComponent, CsTabsComponent, CsTooltipDirective } from "@cses/ui";
import {
  getTextBoxPresetsFor,
  TEXT_BOX_PRESET_CATEGORIES,
  resolveTextBoxArtworkSrc,
  normalizeTextBoxProps,
  type TextBoxPresetId,
} from "../../blocks/text-box-block";
import { getShapeDefinition } from "../../blocks/shape-block/shape-definitions";
import { resolveShapeAdjustmentProjection } from "../../blocks/shape-block/shape-adjustments";
import { resolveWordArtPresentation } from "../../blocks/word-art-block";
import { storeObjectTextFrame, storeObjectTextStyle } from "../../framework";

@Component({
  selector: "bc-text-box-preset-picker",
  standalone: true,
  imports: [CsTabComponent, CsTabsComponent, CsTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "[class.text-box-preset-picker-host--embedded]": "embedded",
  },
  template: `
    <div
      class="text-box-preset-picker"
      contenteditable="false"
      role="menu"
      aria-label="选择文本框样式"
    >
      <div class="text-box-preset-picker__title">文本框样式</div>
      <cs-tabs
        class="text-box-preset-picker__tabs"
        csSize="small"
        [csAnimated]="false"
        [csDestroyInactiveTabPane]="true"
        (mousedown)="preserveSelection($event)"
        (wheel)="scrollCategoryTabs($event)"
      >
        @for (group of categoryGroups; track group.id) {
          <cs-tab [csTitle]="group.label">
            <div class="text-box-preset-picker__grid">
              @for (item of group.items; track item.id) {
                <button
                  type="button"
                  class="text-box-preset-picker__item"
                  role="menuitemradio"
                  [class.active]="current === item.id"
                  [attr.aria-checked]="current === item.id"
                  [attr.data-preset-id]="item.id"
                  [attr.aria-label]="item.label"
                  [csTooltip]="item.label"
                  (mousedown)="preserveSelection($event)"
                  (click)="pick.emit(item.id)"
                >
                  <span
                    class="text-box-preset-picker__preview"
                    aria-hidden="true"
                  >
                    <!-- Three layers, in the same order the live Block paints them:
                   shape fill, then the surface image, then the outline. Drawing
                   fill and outline in one pass buries the image under an opaque
                   fill, which blanks out every entry that pairs a fill opacity
                   with a decorated surface. -->
                    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
                      <!-- The picker panel is the same near-white as a white fill,
                     so a fill-less entry and 默认白框 would render identical
                     thumbnails. The graphics-app transparency checkerboard,
                     clipped to the shape, is what tells them apart. -->
                      @if (item.checker) {
                        <defs>
                          <pattern
                            [attr.id]="checkerPatternId(item.id)"
                            patternUnits="userSpaceOnUse"
                            width="250"
                            height="250"
                          >
                            <rect
                              class="text-box-preset-picker__checker-cell"
                              width="125"
                              height="125"
                            ></rect>
                            <rect
                              class="text-box-preset-picker__checker-cell"
                              x="125"
                              y="125"
                              width="125"
                              height="125"
                            ></rect>
                          </pattern>
                        </defs>
                        <path
                          [attr.d]="item.path"
                          [attr.fill]="
                            'url(#' + checkerPatternId(item.id) + ')'
                          "
                          [attr.fill-rule]="item.fillRule"
                          stroke="none"
                        ></path>
                      }
                      <path
                        [attr.d]="item.path"
                        [attr.fill]="item.props.backColor"
                        [attr.fill-opacity]="item.props.fo"
                        [attr.fill-rule]="item.fillRule"
                        stroke="none"
                      ></path>
                    </svg>
                    @if (item.artworkSrc) {
                      <img
                        class="text-box-preset-picker__bg"
                        [src]="item.artworkSrc"
                        [style.object-fit]="item.backgroundFit"
                        alt=""
                        loading="eager"
                        decoding="async"
                      />
                    }
                    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
                      <path
                        [attr.d]="item.path"
                        fill="none"
                        [attr.stroke]="item.previewStroke"
                        [attr.stroke-width]="item.previewStrokeWidth"
                        [attr.stroke-dasharray]="
                          item.props.bs === 'dashed' ? '24 16' : null
                        "
                        vector-effect="non-scaling-stroke"
                      ></path>
                      @if (item.detailPath) {
                        <path
                          [attr.d]="item.detailPath"
                          fill="none"
                          [attr.stroke]="item.previewStroke"
                          [attr.stroke-width]="item.previewStrokeWidth"
                          [attr.stroke-dasharray]="
                            item.props.bs === 'dashed' ? '24 16' : null
                          "
                          vector-effect="non-scaling-stroke"
                        ></path>
                      }
                    </svg>
                    <span
                      class="text-box-preset-picker__sample"
                      [style.font-family]="item.wordArt?.fontFamily"
                      [style.font-weight]="item.wordArt?.props?.fontWeight"
                      [style.font-style]="item.wordArt?.props?.fontStyle"
                      [style.color]="
                        item.wordArt?.textColor ??
                        sampleColor(item.props.backColor)
                      "
                      [style.-webkit-text-fill-color]="item.wordArt?.textColor"
                      [style.background-image]="item.wordArt?.backgroundImage"
                      [style.-webkit-text-stroke]="item.wordArt?.textStroke"
                      [style.text-shadow]="item.wordArt?.textShadow"
                      [style.transform]="
                        item.wordArt?.effectTransform || 'none'
                      "
                    >
                      Aa
                    </span>
                  </span>
                  <span class="text-box-preset-picker__label">{{
                    item.label
                  }}</span>
                </button>
              }
            </div>
          </cs-tab>
        }
      </cs-tabs>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: calc(100vw - 24px);
      }

      :host(.text-box-preset-picker-host--embedded) {
        max-width: none;
      }

      :host(.text-box-preset-picker-host--embedded) .text-box-preset-picker {
        width: auto;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
      }

      /* Embedded hosts supply their own heading, so the standalone one would
       duplicate it. */
      :host(.text-box-preset-picker-host--embedded)
        .text-box-preset-picker__title {
        display: none;
      }

      .text-box-preset-picker {
        box-sizing: border-box;
        width: min(430px, calc(100vw - 16px));
        padding: 8px;
        overflow: visible;
        border: 1px solid var(--bc-float-toolbar-divider-color);
        border-radius: 10px;
        background: var(--bc-float-toolbar-bg);
        color: var(--bc-float-toolbar-item-color);
        box-shadow: var(
          --bc-fixed-toolbar-shadow,
          0 6px 16px rgba(15, 15, 15, 0.08)
        );
      }

      .text-box-preset-picker__title {
        margin-bottom: 7px;
        font-size: 11px;
        font-weight: 600;
        line-height: 16px;
      }

      .text-box-preset-picker__tabs {
        display: block;
      }

      /* The category strip is the only scroll boundary. Style cards and the
       * popup itself expand to their natural height, so previews are never
       * clipped by a nested vertical scroller. */
      :host ::ng-deep .text-box-preset-picker__tabs > .cs-tabs-bar {
        width: 100%;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
      }

      :host
        ::ng-deep
        .text-box-preset-picker__tabs
        > .cs-tabs-bar
        > .cs-tabs-nav {
        width: 100%;
        max-width: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        overscroll-behavior-inline: contain;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      :host
        ::ng-deep
        .text-box-preset-picker__tabs
        > .cs-tabs-bar
        > .cs-tabs-nav::-webkit-scrollbar {
        display: none;
        width: 0;
        height: 0;
      }

      :host ::ng-deep .text-box-preset-picker__tabs .cs-tabs-tab {
        flex: 0 0 auto;
      }

      .text-box-preset-picker__grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
      }

      .text-box-preset-picker__item {
        min-width: 0;
        padding: 5px;
        border: 1px solid transparent;
        border-radius: 7px;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }

      .text-box-preset-picker__item:hover,
      .text-box-preset-picker__item:focus-visible,
      .text-box-preset-picker__item.active {
        border-color: var(--bc-active-color-light);
        background: var(--bc-float-toolbar-item-hover-bg);
        outline: none;
      }

      .text-box-preset-picker__preview {
        position: relative;
        display: block;
        height: 58px;
      }

      .text-box-preset-picker__checker-cell {
        fill: var(--bc-float-toolbar-divider-color);
        opacity: 0.55;
      }

      .text-box-preset-picker__preview svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
      }

      .text-box-preset-picker__bg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
      }

      .text-box-preset-picker__sample {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        font-size: 19px;
        font-weight: 700;
        line-height: 1;
        background-clip: text;
        -webkit-background-clip: text;
        transform-origin: center;
        pointer-events: none;
      }

      .text-box-preset-picker__label {
        display: block;
        margin-top: 2px;
        overflow: hidden;
        font-size: 10px;
        line-height: 14px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `,
  ],
})
export class TextBoxPresetPickerComponent {
  private static patternSeq = 0;

  /**
   * SVG pattern ids are document-global, and this picker mounts in two places
   * that can coexist (the fixed toolbar's insert popup and the text-box
   * toolbar rail). Without a per-instance salt both emit the same id, url(#…)
   * resolves to whichever comes first in document order, and destroying that
   * one leaves the survivor's fill-less thumbnail with a dangling reference —
   * visually identical to 默认白框, the exact confusion the checkerboard exists
   * to prevent.
   */
  private readonly patternScope = TextBoxPresetPickerComponent.patternSeq++;

  protected checkerPatternId(presetId: string): string {
    return `bc-text-box-checker-${this.patternScope}-${presetId}`;
  }

  /** Removes standalone popup chrome when hosted inside a settings panel. */
  @Input()
  embedded = false;

  @Input()
  current?: TextBoxPresetId;

  @Output()
  readonly pick = new EventEmitter<TextBoxPresetId>();

  protected readonly categoryGroups = TEXT_BOX_PRESET_CATEGORIES.map(
    (category) => ({
      ...category,
      items: getTextBoxPresetsFor(
        category.id === "vertical" ? "v" : "h",
        category.id,
      ).map((preset) => {
        // Presets persist only the unified object-format sections. Resolve the
        // render aliases at this preview boundary instead of reading removed
        // catalog fields such as backColor/bw/bgi directly from persisted props.
        const props = normalizeTextBoxProps(preset.props);
        const definition = getShapeDefinition(props.shapeType);
        return {
          ...preset,
          props,
          path:
            resolveShapeAdjustmentProjection(
              props.shapeType,
              props.adjustments,
            )?.path ?? definition.path,
          // Without these two the double-line frames and rings collapse into a
          // plain rectangle or a solid disc in the thumbnail.
          detailPath: definition.detailPath ?? null,
          fillRule: definition.fillRule ?? null,
          // `artwork` holds a `bc:` catalog reference rather than a user fill,
          // so the
          // thumbnail resolves it the same way the Block does — handing the raw
          // value to `<img>` renders every decorated entry as a broken image.
          artworkSrc: props.artwork
            ? resolveTextBoxArtworkSrc(props.artwork)
            : null,
          // Decorated presets carry their whole appearance in the surface image
          // and set `bw: 0` / `fo: 0`, so a shape-only thumbnail renders blank.
          backgroundFit:
            props.bgs === "stretch"
              ? "fill"
              : props.bgs === "contain"
                ? "contain"
                : "cover",
          // Fill-less and undecorated: nothing would distinguish this thumbnail
          // from a white-filled one on the picker's near-white panel, so the
          // preview marks the transparent surface with a checkerboard. Decorated
          // entries also zero `fo`, but their artwork already fills the tile.
          checker: !props.artwork && !props.bgi && props.fo === 0,
          // `bw: 0` means the entry draws its own outline inside the surface
          // image. Forcing a minimum hairline here would ring every such preset
          // with an unwanted border in its default color.
          previewStroke: props.bw > 0 ? props.borderColor : "none",
          previewStrokeWidth: Math.max(1, props.bw),
          wordArt: resolveWordArtPresentation({
            depth: 0,
            width: props.width,
            height: props.height,
            rotation: 0,
            textFrame: storeObjectTextFrame(props.textFrame),
            textStyle: storeObjectTextStyle(props.textStyle),
          }),
        };
      }),
    }),
  );

  protected preserveSelection(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  protected scrollCategoryTabs(event: WheelEvent): void {
    const tabs = event.currentTarget as HTMLElement | null;
    const nav = tabs?.querySelector<HTMLElement>(".cs-tabs-nav");
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (!delta) return;
    const before = nav.scrollLeft;
    nav.scrollLeft += delta;
    if (nav.scrollLeft !== before) event.preventDefault();
  }

  protected sampleColor(background: unknown): string {
    return background === "#0F172A" || background === "#18181B"
      ? "#F8FAFC"
      : "#0F172A";
  }
}
