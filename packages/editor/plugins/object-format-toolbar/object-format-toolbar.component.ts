import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  CsButtonComponent,
  CsColorPickerComponent,
  CsInputDirective,
  CsInputNumberComponent,
  CsOptionComponent,
  CsSelectComponent,
  CsSegmentedComponent,
  CsSliderComponent,
  CsSwitchComponent,
  CsTooltipDirective,
} from "@cses/ui";
import type { CsSegmentedOptions, CsSliderValue } from "@cses/ui";
import type {
  BlockObjectFormatSelectionState,
  BlockObjectLayout,
  ObjectLineArrow,
  ObjectLineCap,
  ObjectFormatPatch,
  ObjectLineDash,
  ObjectLineJoin,
  ObjectEffects,
  ObjectPaint,
  ObjectPictureFit,
  ObjectTextDirection,
  ObjectTextHorizontalAlign,
  ObjectTextStyle,
  ObjectTextTransform,
  ObjectTextVerticalAlign,
} from "../../framework";
import {
  BLOCK_OBJECT_LAYOUT_OPTIONS,
  BLOCK_OBJECT_PLANE_ALIGNMENT_OPTIONS,
  createObjectPaint,
  TYPOGRAPHY_FONT_FAMILIES,
} from "../../framework";
import { getShapeDefinition, type ShapeKind } from "../../blocks/shape-block";
import { WORD_ART_FONT_OPTIONS } from "../../blocks/word-art-block";
import { ShapeFillPanelComponent } from "../shape-toolbar/shape-fill-panel.component";

export type ObjectFormatPanel = "layout" | "shape" | "text";

type ObjectFormatSection =
  | "shape-type"
  | "shape-fill"
  | "shape-outline"
  | "shape-effects"
  | "text-frame"
  | "text-typography"
  | "text-effects";

type ObjectFormatSliderKey =
  | "shape-fill-position-x"
  | "shape-fill-position-y"
  | "shape-fill-opacity"
  | "shape-outline-opacity"
  | "text-fill-position-x"
  | "text-fill-position-y"
  | "text-fill-opacity";

const OBJECT_TEXT_FONT_OPTIONS = [
  ...TYPOGRAPHY_FONT_FAMILIES.map((font) => ({
    id: font.id,
    label: font.label,
    css: font.css,
    value: font.css,
  })),
  ...WORD_ART_FONT_OPTIONS.filter(
    (font) => !TYPOGRAPHY_FONT_FAMILIES.some((item) => item.id === font.id),
  ).map((font) => ({
    id: font.id,
    label: font.label,
    css: font.stack,
    value: font.stack,
  })),
] as const;

function resolveObjectTextFontValue(value: string): string {
  return (
    OBJECT_TEXT_FONT_OPTIONS.find(
      (font) => font.id === value || font.value === value,
    )?.value ?? value
  );
}

export type ObjectFormatToolbarAction =
  | { name: "patch"; patch: ObjectFormatPatch }
  | { name: "preview"; patch: ObjectFormatPatch }
  | { name: "restore-preview" }
  | { name: "upload-picture"; target: "shape" | "text" }
  | { name: "layout"; value: string }
  | { name: "delete" };

@Component({
  selector: "bc-object-format-toolbar",
  imports: [
    FormsModule,
    CsButtonComponent,
    CsColorPickerComponent,
    CsInputDirective,
    CsInputNumberComponent,
    CsOptionComponent,
    CsSelectComponent,
    CsSegmentedComponent,
    CsSliderComponent,
    CsSwitchComponent,
    CsTooltipDirective,
    ShapeFillPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="object-format"
      [class.object-format--left]="side === 'left'"
      contenteditable="false"
      data-bc-object-format-toolbar
    >
      <nav class="object-format__rail" aria-label="对象快捷工具">
        @for (item of panels; track item.value) {
          @if (isPanelVisible(item.value)) {
            <button
              cs-button
              csType="text"
              csSize="sm"
              type="button"
              [class.active]="activePanel === item.value"
              [attr.aria-expanded]="activePanel === item.value"
              [attr.aria-label]="item.label"
              [csTooltip]="item.label"
              csTooltipPlacement="left"
              (click)="open(item.value)"
            >
              <i [class]="'bc_icon ' + item.icon" aria-hidden="true"></i>
            </button>
          }
        }
        <span class="object-format__rail-divider"></span>
        <button
          cs-button
          csType="text"
          csSize="sm"
          [csDanger]="true"
          type="button"
          csTooltip="删除对象"
          csTooltipPlacement="left"
          aria-label="删除对象"
          (click)="action.emit({ name: 'delete' })"
        >
          <i class="bc_icon bc_shanchu" aria-hidden="true"></i>
        </button>
      </nav>

      @if (activePanel; as panel) {
        <aside
          class="object-format__panel"
          [class.object-format__panel--compact]="panel === 'layout'"
          aria-label="设置对象格式"
        >
          @if (state.readonlyCount) {
            <div class="object-format__notice">
              {{ state.readonlyCount }} 个锁定对象会被跳过
            </div>
          }
          <div
            class="object-format__scroll"
            [class.object-format__scroll--layout]="panel === 'layout'"
          >
            @if (panel === "layout") {
              <section aria-label="布局与排列">
                <div
                  class="object-format__icon-grid object-format__icon-grid--4"
                >
                  @for (item of layoutOptions; track item.value) {
                    <button
                      cs-button
                      csType="text"
                      csSize="sm"
                      type="button"
                      class="object-format__icon-action"
                      [class.active]="isLayoutActive(item.value)"
                      [attr.aria-pressed]="isLayoutActive(item.value)"
                      [attr.aria-label]="item.label"
                      [csTooltip]="item.label"
                      (click)="layout(item.action)"
                    >
                      <i
                        [class]="'bc_icon ' + item.icon"
                        aria-hidden="true"
                      ></i>
                      <span>{{ item.label }}</span>
                    </button>
                  }
                </div>
              </section>
              <section aria-label="页面对齐">
                <div
                  class="object-format__icon-grid object-format__icon-grid--3"
                >
                  @for (item of planeAlignOptions; track item.value) {
                    <button
                      cs-button
                      csType="text"
                      csSize="sm"
                      type="button"
                      class="object-format__icon-action"
                      [attr.aria-label]="item.label"
                      [csTooltip]="item.label"
                      (click)="layout(item.action)"
                    >
                      <i
                        [class]="'bc_icon ' + item.icon"
                        aria-hidden="true"
                      ></i>
                      <span>{{ item.label }}</span>
                    </button>
                  }
                </div>
              </section>
              @if (isMultiSelection || isGroupSelection) {
                <section
                  data-object-format-section="multi-object"
                  aria-label="对象与排列"
                >
                  <div
                    class="object-format__icon-grid object-format__icon-grid--2"
                  >
                    @for (item of objectActions; track item.action) {
                      @if (isObjectActionVisible(item.action)) {
                        <button
                          cs-button
                          csType="text"
                          csSize="sm"
                          type="button"
                          class="object-format__icon-action"
                          (click)="layout(item.action)"
                        >
                          <i
                            [class]="'bc_icon ' + item.icon"
                            aria-hidden="true"
                          ></i>
                          <span>{{ item.label }}</span>
                        </button>
                      }
                    }
                  </div>
                </section>
              }
              <section
                data-object-format-section="hierarchy"
                aria-label="层级"
              >
                <div
                  class="object-format__icon-grid object-format__icon-grid--2"
                >
                  <button
                    cs-button
                    csType="text"
                    csSize="sm"
                    type="button"
                    class="object-format__icon-action"
                    aria-label="上移一层"
                    csTooltip="上移一层"
                    (click)="layout('forward')"
                  >
                    <i class="bc_icon bc_cengji-shangyi"></i>
                    <span>上移一层</span>
                  </button>
                  <button
                    cs-button
                    csType="text"
                    csSize="sm"
                    type="button"
                    class="object-format__icon-action"
                    aria-label="下移一层"
                    csTooltip="下移一层"
                    (click)="layout('backward')"
                  >
                    <i class="bc_icon bc_cengji-xiayi"></i>
                    <span>下移一层</span>
                  </button>
                </div>
              </section>
            }

            @if (panel === "shape" && state.features.shape) {
              <cs-segmented
                class="object-format__tabs"
                csSize="small"
                [csBlock]="true"
                [csOptions]="shapeTabOptions"
                [ngModel]="activeShapeSection()"
                (ngModelChange)="selectShapeSection($event)"
                csAriaLabel="形状格式分类"
              />
              <section
                class="object-format__tab-section"
                data-object-format-section="shape-type"
                [hidden]="activeShapeSection() !== 'shape-type'"
              >
                <button
                  cs-button
                  csType="text"
                  csSize="sm"
                  type="button"
                  class="object-format__section-toggle"
                  [attr.aria-expanded]="isSectionOpen('shape-type')"
                  (click)="toggleSection('shape-type')"
                >
                  <span class="object-format__section-heading">更改形状</span>
                  <i class="bc_icon bc_xiajaintou" aria-hidden="true"></i>
                </button>
                @if (isSectionOpen("shape-type")) {
                  <div class="object-format__section-body">
                    <label
                      >形状
                      <cs-select
                        csSize="sm"
                        csVariant="outlined"
                        [csValue]="stringValue('shapeType') || null"
                        [csPlaceholder]="
                          state.values.shapeType.mixed ? '多种形状' : '选择形状'
                        "
                        [csShowSearch]="true"
                        [csVirtualScroll]="true"
                        (csValueChange)="shapeTypeChangeValue($event)"
                      >
                        @for (shapeType of state.shapeTypes; track shapeType) {
                          <cs-option
                            [csValue]="shapeType"
                            [csLabel]="shapeLabel(shapeType)"
                          />
                        }
                      </cs-select>
                    </label>
                  </div>
                }
              </section>
              <section
                class="object-format__tab-section"
                data-object-format-section="shape-fill"
                [hidden]="activeShapeSection() !== 'shape-fill'"
              >
                <div class="object-format__section-title">
                  <button
                    cs-button
                    csType="text"
                    csSize="sm"
                    type="button"
                    class="object-format__section-toggle"
                    [attr.aria-expanded]="isSectionOpen('shape-fill')"
                    (click)="toggleSection('shape-fill')"
                  >
                    <span class="object-format__section-heading">填充</span>
                    <i class="bc_icon bc_xiajaintou" aria-hidden="true"></i>
                  </button>
                  </div>
                @if (isSectionOpen("shape-fill")) {
                  <div class="object-format__section-body">
                    <bc-shape-fill-panel
                      [paint]="shapeFill"
                      [pictureEnabled]="state.features.pictureFill"
                      (paintChange)="paintChangeValue('shape', $event)"
                    />
                    @if (shapeFill.type === "picture") {
                      <label
                        >图片 URL
                        <input
                          cs-input
                          csSize="sm"
                          type="url"
                          [value]="pictureSourceValue(shapeFill)"
                          placeholder="https://…"
                          (change)="pictureUrlChange($event)"
                        />
                      </label>
                      <button
                        cs-button
                        csType="text"
                        csSize="sm"
                        type="button"
                        (click)="
                          action.emit({
                            name: 'upload-picture',
                            target: 'shape',
                          })
                        "
                      >
                        {{ hasUserPicture(shapeFill) ? "替换图片" : "上传图片" }}
                      </button>
                      @if (hasUserPicture(shapeFill)) {
                        <div
                          class="object-format__picture-config"
                          data-object-format-picture-config="shape"
                        >
                          <label
                            >适应
                            <cs-select
                              csSize="sm"
                              csVariant="outlined"
                              [csValue]="shapeFill.fit"
                              (csValueChange)="
                                pictureFitChangeValue('shape', $event)
                              "
                            >
                              @for (fit of pictureFits; track fit.value) {
                                <cs-option
                                  [csValue]="fit.value"
                                  [csLabel]="fit.label"
                                />
                              }
                            </cs-select>
                          </label>
                          <label
                            >水平位置
                            <cs-slider
                              [csMin]="0"
                              [csMax]="100"
                              [csStep]="1"
                              csAriaLabel="图片水平位置"
                              [csValue]="shapeFill.positionX"
                              (pointerup)="
                                commitSlider('shape-fill-position-x')
                              "
                              (keyup)="commitSlider('shape-fill-position-x')"
                              (focusout)="
                                commitSlider('shape-fill-position-x')
                              "
                              (csValueChange)="
                                picturePositionValue(
                                  'shape',
                                  'positionX',
                                  $event
                                )
                              "
                          /></label>
                          <label
                            >垂直位置
                            <cs-slider
                              [csMin]="0"
                              [csMax]="100"
                              [csStep]="1"
                              csAriaLabel="图片垂直位置"
                              [csValue]="shapeFill.positionY"
                              (pointerup)="
                                commitSlider('shape-fill-position-y')
                              "
                              (keyup)="commitSlider('shape-fill-position-y')"
                              (focusout)="
                                commitSlider('shape-fill-position-y')
                              "
                              (csValueChange)="
                                picturePositionValue(
                                  'shape',
                                  'positionY',
                                  $event
                                )
                              "
                          /></label>
                        </div>
                      }
                    }
                    @if (showsPaintOpacity(shapeFill)) {
                      <label class="object-format__slider-row"
                        >透明度
                        <cs-slider
                          [csMin]="0"
                          [csMax]="100"
                          [csStep]="1"
                          csAriaLabel="形状填充透明度"
                          [csValue]="paintOpacity(shapeFill) * 100"
                          (pointerup)="commitSlider('shape-fill-opacity')"
                          (keyup)="commitSlider('shape-fill-opacity')"
                          (focusout)="commitSlider('shape-fill-opacity')"
                          (csValueChange)="fillOpacityValue($event)"
                        />
                        <output>{{ percent(paintOpacity(shapeFill)) }}</output>
                      </label>
                    }
                  </div>
                }
              </section>
              <section
                class="object-format__tab-section"
                data-object-format-section="shape-outline"
                [hidden]="activeShapeSection() !== 'shape-outline'"
              >
                <div class="object-format__section-title">
                  <button
                    cs-button
                    csType="text"
                    csSize="sm"
                    type="button"
                    class="object-format__section-toggle"
                    [attr.aria-expanded]="isSectionOpen('shape-outline')"
                    (click)="toggleSection('shape-outline')"
                  >
                    <span class="object-format__section-heading">轮廓</span>
                    <i class="bc_icon bc_xiajaintou" aria-hidden="true"></i>
                  </button>
                </div>
                @if (isSectionOpen("shape-outline")) {
                  <div class="object-format__section-body">
                    <label class="object-format__switch-row"
                      >显示轮廓
                      <cs-switch
                        csSize="sm"
                        [csChecked]="shapeOutline.type === 'line'"
                        (csCheckedChange)="outlineEnabledChangeValue($event)"
                      />
                    </label>
                    @if (shapeOutline.type === "line") {
                      <label
                        >颜色
                        <cs-color-picker
                          csMode="palette"
                          csSize="sm"
                          [csValue]="shapeOutline.color"
                          [csShowText]="true"
                          [csShowAlpha]="false"
                          [csAllowClear]="false"
                          (csChangeComplete)="
                            outlineColorChangeValue($event.value)
                          "
                      /></label>
                      <label
                        >宽度
                        <cs-input-number
                          csSize="sm"
                          [csMin]="0"
                          [csMax]="100"
                          [csStep]="0.25"
                          [csPrecision]="2"
                          [csValue]="shapeOutline.width"
                          (csValueChange)="
                            outlineNumberChangeValue('width', $event)
                          "
                      /></label>
                      <label
                        >透明度
                        <cs-slider
                          [csMin]="0"
                          [csMax]="100"
                          [csStep]="1"
                          csAriaLabel="形状轮廓透明度"
                          [csValue]="shapeOutline.opacity * 100"
                          (pointerup)="commitSlider('shape-outline-opacity')"
                          (keyup)="commitSlider('shape-outline-opacity')"
                          (focusout)="commitSlider('shape-outline-opacity')"
                          (csValueChange)="outlineOpacityValue($event)"
                      /></label>
                      <label
                        >虚线
                        <cs-select
                          csSize="sm"
                          csVariant="outlined"
                          [csValue]="shapeOutline.dash"
                          (csValueChange)="dashChangeValue($event)"
                        >
                          @for (dash of dashTypes; track dash.value) {
                            <cs-option
                              [csValue]="dash.value"
                              [csLabel]="dash.label"
                            />
                          }
                        </cs-select>
                      </label>
                      <label
                        >端点
                        <cs-select
                          csSize="sm"
                          csVariant="outlined"
                          [csValue]="shapeOutline.cap"
                          (csValueChange)="lineEnumChangeValue('cap', $event)"
                        >
                          <cs-option csValue="butt" csLabel="平头" />
                          <cs-option csValue="round" csLabel="圆头" />
                          <cs-option csValue="square" csLabel="方头" />
                        </cs-select>
                      </label>
                      <label
                        >连接
                        <cs-select
                          csSize="sm"
                          csVariant="outlined"
                          [csValue]="shapeOutline.join"
                          (csValueChange)="lineEnumChangeValue('join', $event)"
                        >
                          <cs-option csValue="miter" csLabel="尖角" />
                          <cs-option csValue="round" csLabel="圆角" />
                          <cs-option csValue="bevel" csLabel="斜角" />
                        </cs-select>
                      </label>
                      @if (state.features.lineArrows) {
                        <label
                          >起点箭头
                          <cs-select
                            csSize="sm"
                            csVariant="outlined"
                            [csValue]="shapeOutline.startArrow"
                            (csValueChange)="
                              arrowChangeValue('startArrow', $event)
                            "
                          >
                            @for (arrow of arrowTypes; track arrow.value) {
                              <cs-option
                                [csValue]="arrow.value"
                                [csLabel]="arrow.label"
                              />
                            }</cs-select
                        ></label>
                        <label
                          >终点箭头
                          <cs-select
                            csSize="sm"
                            csVariant="outlined"
                            [csValue]="shapeOutline.endArrow"
                            (csValueChange)="
                              arrowChangeValue('endArrow', $event)
                            "
                          >
                            @for (arrow of arrowTypes; track arrow.value) {
                              <cs-option
                                [csValue]="arrow.value"
                                [csLabel]="arrow.label"
                              />
                            }</cs-select
                        ></label>
                      }
                    }
                  </div>
                }
              </section>
              <section
                class="object-format__tab-section"
                data-object-format-section="shape-effects"
                [hidden]="activeShapeSection() !== 'shape-effects'"
              >
                <button
                  cs-button
                  csType="text"
                  csSize="sm"
                  type="button"
                  class="object-format__section-toggle"
                  [attr.aria-expanded]="isSectionOpen('shape-effects')"
                  (click)="toggleSection('shape-effects')"
                >
                  <span class="object-format__section-heading">阴影与发光</span>
                  <i class="bc_icon bc_xiajaintou" aria-hidden="true"></i>
                </button>
                @if (isSectionOpen("shape-effects")) {
                  <div class="object-format__section-body">
                    <label class="object-format__switch-row"
                      >阴影
                      <cs-switch
                        csSize="sm"
                        [csChecked]="shapeEffects.shadow.enabled"
                        (csCheckedChange)="
                          effectEnabledValue('shadow', $event)
                        "
                    /></label>
                    @if (shapeEffects.shadow.enabled) {
                      <label
                        >颜色
                        <cs-color-picker
                          csMode="palette"
                          csSize="sm"
                          [csValue]="shapeEffects.shadow.color"
                          [csShowText]="true"
                          [csShowAlpha]="false"
                          [csAllowClear]="false"
                          (csChangeComplete)="
                            effectColorValue('shadow', $event.value)
                          "
                      /></label>
                      <label
                        >透明度
                        <cs-slider
                          [csMin]="0"
                          [csMax]="100"
                          [csStep]="1"
                          csAriaLabel="阴影透明度"
                          [csValue]="shapeEffects.shadow.opacity * 100"
                          (csValueChange)="
                            effectOpacityValue('shadow', $event)
                          "
                      /></label>
                      <label
                        >模糊
                        <cs-input-number
                          csSize="sm"
                          [csMin]="0"
                          [csMax]="100"
                          [csValue]="shapeEffects.shadow.blur"
                          (csValueChange)="shadowNumberValue('blur', $event)"
                      /></label>
                      <label
                        >角度
                        <cs-input-number
                          csSize="sm"
                          [csMin]="-360"
                          [csMax]="360"
                          [csValue]="shapeEffects.shadow.angle"
                          (csValueChange)="shadowNumberValue('angle', $event)"
                      /></label>
                      <label
                        >距离
                        <cs-input-number
                          csSize="sm"
                          [csMin]="0"
                          [csMax]="200"
                          [csValue]="shapeEffects.shadow.distance"
                          (csValueChange)="
                            shadowNumberValue('distance', $event)
                          "
                      /></label>
                    }
                    <label class="object-format__switch-row"
                      >发光
                      <cs-switch
                        csSize="sm"
                        [csChecked]="shapeEffects.glow.enabled"
                        (csCheckedChange)="effectEnabledValue('glow', $event)"
                    /></label>
                    @if (shapeEffects.glow.enabled) {
                      <label
                        >颜色
                        <cs-color-picker
                          csMode="palette"
                          csSize="sm"
                          [csValue]="shapeEffects.glow.color"
                          [csShowText]="true"
                          [csShowAlpha]="false"
                          [csAllowClear]="false"
                          (csChangeComplete)="
                            effectColorValue('glow', $event.value)
                          "
                      /></label>
                      <label
                        >透明度
                        <cs-slider
                          [csMin]="0"
                          [csMax]="100"
                          [csStep]="1"
                          csAriaLabel="发光透明度"
                          [csValue]="shapeEffects.glow.opacity * 100"
                          (csValueChange)="effectOpacityValue('glow', $event)"
                      /></label>
                      <label
                        >半径
                        <cs-input-number
                          csSize="sm"
                          [csMin]="0"
                          [csMax]="100"
                          [csValue]="shapeEffects.glow.radius"
                          (csValueChange)="glowNumberValue($event)"
                      /></label>
                    }
                    @if (hasShapeEffectsDraft) {
                      <div class="object-format__confirm-row">
                        <button
                          cs-button
                          csType="text"
                          csSize="sm"
                          type="button"
                          (click)="cancelShapeEffects()"
                        >
                          取消
                        </button>
                        <button
                          cs-button
                          csType="primary"
                          csSize="sm"
                          type="button"
                          (click)="applyShapeEffects()"
                        >
                          应用
                        </button>
                      </div>
                    }
                  </div>
                }
              </section>
            }

            @if (panel === "text") {
              <cs-segmented
                class="object-format__tabs"
                csSize="small"
                [csBlock]="true"
                [csOptions]="textTabOptions"
                [ngModel]="selectedTextSection"
                (ngModelChange)="selectTextSection($event)"
                csAriaLabel="文字格式分类"
              />
              @if (state.features.textFrame) {
                <section
                  class="object-format__tab-section"
                  data-object-format-section="text-frame"
                  [hidden]="selectedTextSection !== 'text-frame'"
                >
                  <div class="object-format__section-title">
                    <button
                      cs-button
                      csType="text"
                      csSize="sm"
                      type="button"
                      class="object-format__section-toggle"
                      [attr.aria-expanded]="isSectionOpen('text-frame')"
                      (click)="toggleSection('text-frame')"
                    >
                      <span class="object-format__section-heading">文本框</span>
                      <i class="bc_icon bc_xiajaintou" aria-hidden="true"></i>
                    </button>
                  </div>
                  @if (isSectionOpen("text-frame")) {
                    <div class="object-format__section-body">
                      <div
                        class="object-format__grid object-format__grid--2 object-format__margin-grid"
                      >
                        @for (
                          side of marginSides;
                          track side.key;
                          let i = $index
                        ) {
                          <label
                            >{{ side.label }}边距
                            <cs-input-number
                              class="object-format__margin-input"
                              csSize="sm"
                              [csMin]="0"
                              [csMax]="1000"
                              [csValue]="textFrame.margins[i]"
                              (csValueChange)="marginChangeValue(i, $event)"
                            />
                          </label>
                        }
                      </div>
                      <label
                        >文字方向
                        <cs-select
                          csSize="sm"
                          csVariant="outlined"
                          [csValue]="textFrame.direction"
                          (csValueChange)="directionChangeValue($event)"
                        >
                          <cs-option csValue="horizontal" csLabel="横排" />
                          <cs-option csValue="vertical-rl" csLabel="竖排" />
                          <cs-option csValue="rotate-90" csLabel="旋转 90°" />
                          <cs-option csValue="rotate-270" csLabel="旋转 270°" />
                        </cs-select>
                      </label>
                      <label
                        >水平对齐
                        <cs-select
                          csSize="sm"
                          csVariant="outlined"
                          [csValue]="textFrame.horizontalAlign"
                          (csValueChange)="horizontalAlignChangeValue($event)"
                        >
                          <cs-option csValue="left" csLabel="左对齐" />
                          <cs-option csValue="center" csLabel="居中" />
                          <cs-option csValue="right" csLabel="右对齐" />
                          <cs-option csValue="justify" csLabel="两端对齐" />
                        </cs-select>
                      </label>
                      <label
                        >垂直对齐
                        <cs-select
                          csSize="sm"
                          csVariant="outlined"
                          [csValue]="textFrame.verticalAlign"
                          (csValueChange)="verticalAlignChangeValue($event)"
                        >
                          <cs-option csValue="top" csLabel="顶端" />
                          <cs-option csValue="middle" csLabel="居中" />
                          <cs-option csValue="bottom" csLabel="底端" />
                        </cs-select>
                      </label>
                    </div>
                  }
                </section>
              }
              @if (state.features.textStyle) {
                <section
                  class="object-format__tab-section"
                  data-object-format-section="text-typography"
                  [hidden]="selectedTextSection !== 'text-typography'"
                >
                  <button
                    cs-button
                    csType="text"
                    csSize="sm"
                    type="button"
                    class="object-format__section-toggle"
                    [attr.aria-expanded]="isSectionOpen('text-typography')"
                    (click)="toggleSection('text-typography')"
                  >
                    <span class="object-format__section-heading">字体排版</span>
                    <i class="bc_icon bc_xiajaintou" aria-hidden="true"></i>
                  </button>
                  @if (isSectionOpen("text-typography")) {
                    <div class="object-format__section-body">
                      <label
                        >字体
                        <cs-select
                          csSize="sm"
                          csVariant="outlined"
                          [csValue]="textFontFamilyValue"
                          [csPlaceholder]="
                            state.values.textStyle.mixed
                              ? '多种字体'
                              : '选择字体'
                          "
                          [csShowSearch]="true"
                          [csVirtualScroll]="true"
                          (csValueChange)="textFontFamilyChangeValue($event)"
                        >
                          @for (font of fontOptions; track font.id) {
                            <cs-option
                              [csValue]="font.value"
                              [csLabel]="font.label"
                              csCustomContent
                            >
                              <span [style.font-family]="font.css">
                                {{ font.label }}
                              </span>
                            </cs-option>
                          }
                        </cs-select>
                      </label>
                      <label
                        >字号
                        <cs-input-number
                          csSize="sm"
                          [csMin]="4"
                          [csMax]="512"
                          [csValue]="textStyle.fontSize"
                          (csValueChange)="textNumberValue('fontSize', $event)"
                      /></label>
                      <label
                        >字距
                        <cs-input-number
                          csSize="sm"
                          [csMin]="-1"
                          [csMax]="5"
                          [csStep]="0.01"
                          [csPrecision]="2"
                          [csValue]="textStyle.letterSpacingEm"
                          (csValueChange)="
                            textNumberValue('letterSpacingEm', $event)
                          "
                      /></label>
                      <label
                        >行高
                        <cs-input-number
                          csSize="sm"
                          [csMin]="0.5"
                          [csMax]="5"
                          [csStep]="0.05"
                          [csPrecision]="2"
                          [csValue]="textStyle.lineHeight"
                          (csValueChange)="
                            textNumberValue('lineHeight', $event)
                          "
                      /></label>
                      <label
                        >字重
                        <cs-select
                          csSize="sm"
                          csVariant="outlined"
                          [csValue]="textStyle.fontWeight"
                          (csValueChange)="textFontWeightChangeValue($event)"
                        >
                          @for (weight of fontWeights; track weight.value) {
                            <cs-option
                              [csValue]="weight.value"
                              [csLabel]="weight.label"
                            />
                          }
                        </cs-select>
                      </label>
                      <label class="object-format__switch-row"
                        >斜体
                        <cs-switch
                          csSize="sm"
                          [csChecked]="textStyle.fontStyle === 'italic'"
                          (csCheckedChange)="textItalicValue($event)"
                      /></label>
                    </div>
                  }
                </section>
                <section
                  class="object-format__tab-section"
                  data-object-format-section="text-effects"
                  [hidden]="selectedTextSection !== 'text-effects'"
                >
                  <div class="object-format__section-title">
                    <button
                      cs-button
                      csType="text"
                      csSize="sm"
                      type="button"
                      class="object-format__section-toggle"
                      [attr.aria-expanded]="isSectionOpen('text-effects')"
                      (click)="toggleSection('text-effects')"
                    >
                      <span class="object-format__section-heading"
                        >文字外观与效果</span
                      >
                      <i class="bc_icon bc_xiajaintou" aria-hidden="true"></i>
                    </button>
                  </div>
                  @if (isSectionOpen("text-effects")) {
                    <div class="object-format__section-body">
                      <bc-shape-fill-panel
                        [paint]="textStyle.fill"
                        [pictureEnabled]="state.features.pictureFill"
                        (paintChange)="paintChangeValue('text', $event)"
                      />
                      @if (textStyle.fill.type === "picture") {
                        <label
                          >图片 URL
                          <input
                            cs-input
                            csSize="sm"
                            type="url"
                            [value]="pictureSourceValue(textStyle.fill)"
                            placeholder="https://…"
                            (change)="textPictureUrl($event)"
                        /></label>
                        <button
                          cs-button
                          csType="text"
                          csSize="sm"
                          type="button"
                          (click)="
                            action.emit({
                              name: 'upload-picture',
                              target: 'text',
                            })
                          "
                        >
                          {{
                            hasUserPicture(textStyle.fill)
                              ? "替换文字图片"
                              : "上传文字图片"
                          }}
                        </button>
                        @if (hasUserPicture(textStyle.fill)) {
                          <div
                            class="object-format__picture-config"
                            data-object-format-picture-config="text"
                          >
                            <label
                              >适应
                              <cs-select
                                csSize="sm"
                                csVariant="outlined"
                                [csValue]="textStyle.fill.fit"
                                (csValueChange)="
                                  pictureFitChangeValue('text', $event)
                                "
                              >
                                @for (fit of pictureFits; track fit.value) {
                                  <cs-option
                                    [csValue]="fit.value"
                                    [csLabel]="fit.label"
                                  />
                                }</cs-select
                            ></label>
                            <label
                              >水平位置
                              <cs-slider
                                [csMin]="0"
                                [csMax]="100"
                                [csStep]="1"
                                csAriaLabel="文字图片水平位置"
                                [csValue]="textStyle.fill.positionX"
                                (pointerup)="
                                  commitSlider('text-fill-position-x')
                                "
                                (keyup)="
                                  commitSlider('text-fill-position-x')
                                "
                                (focusout)="
                                  commitSlider('text-fill-position-x')
                                "
                                (csValueChange)="
                                  picturePositionValue(
                                    'text',
                                    'positionX',
                                    $event
                                  )
                                "
                            /></label>
                            <label
                              >垂直位置
                              <cs-slider
                                [csMin]="0"
                                [csMax]="100"
                                [csStep]="1"
                                csAriaLabel="文字图片垂直位置"
                                [csValue]="textStyle.fill.positionY"
                                (pointerup)="
                                  commitSlider('text-fill-position-y')
                                "
                                (keyup)="
                                  commitSlider('text-fill-position-y')
                                "
                                (focusout)="
                                  commitSlider('text-fill-position-y')
                                "
                                (csValueChange)="
                                  picturePositionValue(
                                    'text',
                                    'positionY',
                                    $event
                                  )
                                "
                            /></label>
                          </div>
                        }
                      }
                      @if (showsPaintOpacity(textStyle.fill)) {
                        <label
                          >文字填充透明度
                          <cs-slider
                            [csMin]="0"
                            [csMax]="100"
                            [csStep]="1"
                            csAriaLabel="文字填充透明度"
                            [csValue]="paintOpacity(textStyle.fill) * 100"
                            (pointerup)="commitSlider('text-fill-opacity')"
                            (keyup)="commitSlider('text-fill-opacity')"
                            (focusout)="commitSlider('text-fill-opacity')"
                            (csValueChange)="textFillOpacityValue($event)"
                        /></label>
                      }
                      <label class="object-format__switch-row"
                        >文字轮廓
                        <cs-switch
                          csSize="sm"
                          [csChecked]="textStyle.outline.type === 'line'"
                          (csCheckedChange)="textOutlineEnabledValue($event)"
                      /></label>
                      @if (textStyle.outline.type === "line") {
                        <label
                          >轮廓颜色
                          <cs-color-picker
                            csMode="palette"
                            csSize="sm"
                            [csValue]="textStyle.outline.color"
                            [csShowText]="true"
                            [csShowAlpha]="false"
                            [csAllowClear]="false"
                            (csChangeComplete)="
                              textOutlineColorValue($event.value)
                            "
                        /></label>
                        <label
                          >轮廓宽度
                          <cs-input-number
                            csSize="sm"
                            [csMin]="0"
                            [csMax]="100"
                            [csStep]="0.25"
                            [csPrecision]="2"
                            [csValue]="textStyle.outline.width"
                            (csValueChange)="textOutlineWidthValue($event)"
                        /></label>
                      }
                      <label class="object-format__switch-row"
                        >文字阴影
                        <cs-switch
                          csSize="sm"
                          [csChecked]="textStyle.effects.shadow.enabled"
                          (csCheckedChange)="
                            textEffectEnabledValue('shadow', $event)
                          "
                      /></label>
                      @if (textStyle.effects.shadow.enabled) {
                        <label
                          >阴影颜色
                          <cs-color-picker
                            csMode="palette"
                            csSize="sm"
                            [csValue]="textStyle.effects.shadow.color"
                            [csShowText]="true"
                            [csShowAlpha]="false"
                            [csAllowClear]="false"
                            (csChangeComplete)="
                              textEffectColorValue('shadow', $event.value)
                            "
                        /></label>
                        <label
                          >阴影透明度
                          <cs-slider
                            [csMin]="0"
                            [csMax]="100"
                            [csStep]="1"
                            csAriaLabel="文字阴影透明度"
                            [csValue]="textStyle.effects.shadow.opacity * 100"
                            (csValueChange)="
                              textEffectOpacityValue('shadow', $event)
                            "
                        /></label>
                        <label
                          >阴影模糊
                          <cs-input-number
                            csSize="sm"
                            [csMin]="0"
                            [csMax]="100"
                            [csValue]="textStyle.effects.shadow.blur"
                            (csValueChange)="
                              textShadowNumberValue('blur', $event)
                            "
                        /></label>
                        <label
                          >阴影角度
                          <cs-input-number
                            csSize="sm"
                            [csMin]="-360"
                            [csMax]="360"
                            [csValue]="textStyle.effects.shadow.angle"
                            (csValueChange)="
                              textShadowNumberValue('angle', $event)
                            "
                        /></label>
                        <label
                          >阴影距离
                          <cs-input-number
                            csSize="sm"
                            [csMin]="0"
                            [csMax]="200"
                            [csValue]="textStyle.effects.shadow.distance"
                            (csValueChange)="
                              textShadowNumberValue('distance', $event)
                            "
                        /></label>
                      }
                      <label class="object-format__switch-row"
                        >文字发光
                        <cs-switch
                          csSize="sm"
                          [csChecked]="textStyle.effects.glow.enabled"
                          (csCheckedChange)="
                            textEffectEnabledValue('glow', $event)
                          "
                      /></label>
                      @if (textStyle.effects.glow.enabled) {
                        <label
                          >发光颜色
                          <cs-color-picker
                            csMode="palette"
                            csSize="sm"
                            [csValue]="textStyle.effects.glow.color"
                            [csShowText]="true"
                            [csShowAlpha]="false"
                            [csAllowClear]="false"
                            (csChangeComplete)="
                              textEffectColorValue('glow', $event.value)
                            "
                        /></label>
                        <label
                          >发光透明度
                          <cs-slider
                            [csMin]="0"
                            [csMax]="100"
                            [csStep]="1"
                            csAriaLabel="文字发光透明度"
                            [csValue]="textStyle.effects.glow.opacity * 100"
                            (csValueChange)="
                              textEffectOpacityValue('glow', $event)
                            "
                        /></label>
                        <label
                          >发光半径
                          <cs-input-number
                            csSize="sm"
                            [csMin]="0"
                            [csMax]="100"
                            [csValue]="textStyle.effects.glow.radius"
                            (csValueChange)="textGlowRadiusValue($event)"
                        /></label>
                      }
                      <label
                        >Transform
                        <cs-select
                          csSize="sm"
                          csVariant="outlined"
                          [csValue]="textStyle.transform"
                          (csValueChange)="transformChangeValue($event)"
                        >
                          @for (
                            transform of transforms;
                            track transform.value
                          ) {
                            <cs-option
                              [csValue]="transform.value"
                              [csLabel]="transform.label"
                            />
                          }
                        </cs-select>
                      </label>
                      @if (hasTextEffectsDraft) {
                        <div class="object-format__confirm-row">
                          <button
                            cs-button
                            csType="text"
                            csSize="sm"
                            type="button"
                            (click)="cancelTextEffects()"
                          >
                            取消
                          </button>
                          <button
                            cs-button
                            csType="primary"
                            csSize="sm"
                            type="button"
                            (click)="applyTextEffects()"
                          >
                            应用
                          </button>
                        </div>
                      }
                    </div>
                  }
                </section>
              }
            }
          </div>
        </aside>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: calc(100vw - 16px);
      }
      .object-format {
        --object-format-settings-panel-width: 288px;
        display: flex;
        align-items: center;
        gap: 8px;
        box-sizing: border-box;
        width: max-content;
        max-width: 100%;
        color: var(--bc-float-toolbar-item-color, #1f2937);
        font-size: 12px;
      }
      .object-format--left {
        flex-direction: row-reverse;
      }
      .object-format__rail {
        display: flex;
        flex: 0 0 auto;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        box-sizing: border-box;
        width: 42px;
        padding: 5px;
        border: 1px solid var(--bc-float-toolbar-divider-color, #e2e8f0);
        border-radius: 11px;
        background: var(--bc-float-toolbar-bg, #fff);
        box-shadow: var(
          --bc-fixed-toolbar-shadow,
          0 8px 24px rgba(15, 23, 42, 0.16)
        );
      }
      button .bc_icon {
        flex: 0 0 auto;
        font-size: 16px;
      }
      .object-format__rail button {
        width: 32px;
        min-width: 32px;
        height: 32px;
        min-height: 32px;
        padding: 0;
        color: inherit;
      }
      .object-format__rail button.active {
        background: var(--bc-float-toolbar-item-active-bg, #eef2ff);
        color: var(--bc-active-color, #4857e2);
        box-shadow: inset 2px 0 0 var(--bc-active-color, #4857e2);
      }
      .object-format--left .object-format__rail button.active {
        box-shadow: inset -2px 0 0 var(--bc-active-color, #4857e2);
      }
      .object-format__rail button .bc_icon {
        font-size: 16px;
      }
      .object-format__rail-divider {
        width: 24px;
        height: 1px;
        background: var(--bc-float-toolbar-divider-color, #e2e8f0);
      }
      .object-format__panel {
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        width: min(
          var(--object-format-settings-panel-width),
          calc(100vw - 86px)
        );
        max-width: 100%;
        max-height: min(520px, calc(100vh - 24px));
        padding: 10px;
        overflow: hidden;
        border: 1px solid var(--bc-float-toolbar-divider-color, #e2e8f0);
        border-radius: 12px;
        background: var(--bc-float-toolbar-bg, #fff);
        box-shadow: var(
          --bc-fixed-toolbar-shadow,
          0 10px 28px rgba(15, 23, 42, 0.16)
        );
      }
      .object-format__panel--compact {
        --object-format-settings-panel-width: 228px;
      }
      .object-format__notice {
        margin-bottom: 8px;
        padding: 7px 8px;
        border-radius: 6px;
        color: #92400e;
        background: #fffbeb;
      }
      .object-format__scroll {
        box-sizing: border-box;
        min-width: 0;
        min-height: 0;
        max-width: 100%;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .object-format__tabs {
        display: block;
        margin-bottom: 8px;
      }
      .object-format__tab-section[hidden] {
        display: none;
      }
      .object-format__tab-section {
        padding-bottom: 0;
        border-bottom: 0;
      }
      section {
        padding: 10px 0;
        border-bottom: 1px solid var(--bc-float-toolbar-divider-color, #e2e8f0);
        display: grid;
        gap: 10px;
      }
      section:first-child {
        padding-top: 0;
      }
      section:last-child {
        padding-bottom: 0;
        border-bottom: 0;
      }
      h3 {
        margin: 0;
        color: var(--bc-color-text, #303846);
        font-size: 13px;
        font-weight: 600;
      }
      label {
        display: grid;
        grid-template-columns: minmax(92px, 1fr) minmax(0, 1.4fr);
        gap: 8px;
        align-items: center;
        min-width: 0;
      }
      label > input[cs-input],
      label > cs-input-number,
      label > cs-select,
      label > cs-color-picker,
      label > cs-slider {
        min-width: 0;
        width: 100%;
      }
      label > cs-slider {
        /* CSES places the handle at 0/100% and translates it by half its
           width. Keep that visual extent inside the grid cell so it neither
           creates horizontal overflow nor gets clipped at the panel edge. */
        width: calc(100% - 24px);
        margin-inline: 12px;
      }
      .object-format__switch-row {
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .object-format__slider-row {
        grid-template-columns: 84px minmax(0, 1fr) 38px;
      }
      .object-format__slider-row output {
        color: var(--bc-color-secondary, #697386);
        font-variant-numeric: tabular-nums;
        text-align: right;
      }
      .object-format__grid {
        display: grid;
        gap: 7px;
      }
      .object-format__grid--2 {
        grid-template-columns: 1fr 1fr;
      }
      .object-format__margin-grid > label {
        grid-template-columns: minmax(0, 1fr);
        align-items: stretch;
        gap: 3px;
        font-size: 11px;
      }
      .object-format__margin-input {
        --cs-input-number-height: var(--cs-sem-size-interactive-xs, 24px);
        --cs-input-number-padding: 4px;
      }
      .object-format__grid--3 {
        grid-template-columns: repeat(3, 1fr);
      }
      .object-format__grid button {
        justify-content: flex-start;
        width: 100%;
      }
      .object-format__icon-grid {
        display: grid;
        gap: 6px;
      }
      .object-format__icon-grid--3 {
        grid-template-columns: repeat(3, 1fr);
      }
      .object-format__icon-grid--2 {
        grid-template-columns: repeat(2, 1fr);
      }
      .object-format__icon-grid--4 {
        grid-template-columns: repeat(4, 1fr);
      }
      .object-format__icon-action {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        min-width: 0;
        width: 100%;
        min-height: 58px;
        height: 58px;
        padding: 4px 2px;
        border-color: transparent;
        background: transparent;
      }
      .object-format__icon-action .bc_icon {
        font-size: 17px;
      }
      .object-format__icon-action span {
        display: -webkit-box;
        max-width: 100%;
        max-height: 24px;
        overflow: hidden;
        color: currentColor;
        font-size: 10px;
        font-weight: 400;
        line-height: 12px;
        text-align: center;
        word-break: break-all;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }
      .object-format__icon-action.active {
        border-color: var(--bc-active-color, #4857e2);
        background: var(--bc-float-toolbar-item-active-bg, #eef2ff);
        color: var(--bc-active-color, #4857e2);
      }
      .object-format__scroll--layout section {
        gap: 6px;
        padding-block: 7px;
      }
      .object-format__scroll--layout h3 {
        font-size: 11px;
        font-weight: 500;
      }
      .object-format__scroll--layout .object-format__icon-grid {
        gap: 4px;
      }
      .object-format__section-title {
        display: none;
      }
      .object-format__section-title button {
        min-height: 24px;
        color: var(--cs-color-primary, var(--bc-color-primary, #4857e2));
      }
      .object-format__section-toggle {
        display: none;
      }
      .object-format__section-heading {
        font-size: 13px;
        font-weight: 600;
        pointer-events: none;
      }
      .object-format__section-toggle .bc_xiajaintou {
        margin-left: auto;
        font-size: 11px;
        transition: transform 160ms ease;
      }
      .object-format__section-toggle[aria-expanded="true"] .bc_xiajaintou {
        transform: rotate(180deg);
      }
      .object-format__section-body {
        display: grid;
        gap: 10px;
        min-width: 0;
      }
      .object-format__picture-config {
        display: grid;
        gap: 10px;
        min-width: 0;
      }
      .object-format__confirm-row {
        position: sticky;
        bottom: -10px;
        display: flex;
        z-index: 1;
        justify-content: flex-end;
        gap: 6px;
        margin: 2px -2px -8px;
        padding: 8px 2px;
        background: var(--bc-float-toolbar-bg, #fff);
        border-top: 1px solid var(--bc-float-toolbar-divider-color, #e2e8f0);
      }
      @media (max-width: 720px), (max-height: 680px) {
        .object-format__panel {
          max-height: min(520px, calc(100vh - 24px));
        }
        section {
          padding-block: 9px;
        }
        .object-format__icon-action {
          min-height: 54px;
          height: 54px;
        }
      }
    `,
  ],
})
export class ObjectFormatToolbarComponent {
  @Input({ required: true }) state!: BlockObjectFormatSelectionState;
  @Input() side: "left" | "right" = "right";
  @Input() activeLayout: BlockObjectLayout | null = null;
  @Input() groupSelection = false;
  @Output() readonly action = new EventEmitter<ObjectFormatToolbarAction>();
  @Output() readonly panelChange = new EventEmitter<void>();

  // Keep the established compact rail-first interaction. Selecting an object
  // must not force a large panel open beside it.
  activePanel: ObjectFormatPanel | null = null;
  readonly panels = [
    { value: "layout" as const, label: "布局与排列", icon: "bc_buju" },
    { value: "shape" as const, label: "形状选项", icon: "bc_tuxing" },
    { value: "text" as const, label: "文本选项", icon: "bc_wenben" },
  ];
  readonly layoutOptions = BLOCK_OBJECT_LAYOUT_OPTIONS.map((item) => ({
    ...item,
    action: item.value === "inline" ? "wrap" : item.value,
  }));
  readonly planeAlignOptions = BLOCK_OBJECT_PLANE_ALIGNMENT_OPTIONS.map(
    (item) => ({
      ...item,
      action:
        item.value === "horizontal-center"
          ? "page-center"
          : `page-${item.value}`,
    }),
  );
  readonly objectActions = [
    { action: "align-left", label: "左对齐", icon: "bc_align2left" },
    { action: "align-center", label: "水平居中", icon: "bc_align2center" },
    { action: "align-right", label: "右对齐", icon: "bc_align2right" },
    { action: "align-top", label: "顶端对齐", icon: "bc_align2top" },
    { action: "align-middle", label: "垂直居中", icon: "bc_align2middle" },
    { action: "align-bottom", label: "底端对齐", icon: "bc_align2bottom" },
    { action: "distribute-x", label: "水平分布", icon: "bc_hengxiangfenbu" },
    { action: "distribute-y", label: "垂直分布", icon: "bc_zongxiangfenbu" },
    { action: "group", label: "组合", icon: "bc_combination" },
    { action: "ungroup", label: "取消组合", icon: "bc_quxiaozuhe" },
  ] as const;
  readonly shapeTabOptions: CsSegmentedOptions = [
    { value: "shape-fill", label: "填充" },
    { value: "shape-outline", label: "轮廓" },
    { value: "shape-type", label: "形状" },
    { value: "shape-effects", label: "效果" },
  ];
  readonly fontOptions = OBJECT_TEXT_FONT_OPTIONS;
  readonly fontWeights = [
    { value: 400, label: "常规 400" },
    { value: 500, label: "中等 500" },
    { value: 600, label: "半粗 600" },
    { value: 700, label: "粗体 700" },
    { value: 800, label: "特粗 800" },
    { value: 900, label: "黑体 900" },
  ] as const;
  readonly pictureFits: Array<{ value: ObjectPictureFit; label: string }> = [
    { value: "cover", label: "覆盖" },
    { value: "contain", label: "适应" },
    { value: "stretch", label: "拉伸" },
  ];
  readonly dashTypes: Array<{ value: ObjectLineDash; label: string }> = [
    { value: "solid", label: "实线" },
    { value: "dot", label: "点线" },
    { value: "dash", label: "短划线" },
    { value: "dash-dot", label: "点划线" },
    { value: "long-dash", label: "长划线" },
    { value: "long-dash-dot", label: "长点划线" },
  ];
  readonly arrowTypes = [
    { value: "none", label: "无" },
    { value: "triangle", label: "三角形" },
    { value: "stealth", label: "燕尾" },
    { value: "diamond", label: "菱形" },
    { value: "oval", label: "椭圆" },
  ] as const;
  readonly transforms: Array<{ value: ObjectTextTransform; label: string }> = [
    { value: "none", label: "无转换" },
    { value: "slant-left", label: "左倾斜" },
    { value: "slant-right", label: "右倾斜" },
    { value: "slant-up", label: "向上倾斜" },
    { value: "slant-down", label: "向下倾斜" },
    { value: "perspective-left", label: "左透视" },
    { value: "perspective-right", label: "右透视" },
    { value: "perspective-up", label: "上透视" },
    { value: "perspective-down", label: "下透视" },
    { value: "wide", label: "加宽" },
    { value: "narrow", label: "变窄" },
    { value: "tall", label: "拉高" },
    { value: "short", label: "压低" },
    { value: "inflate", label: "膨胀" },
    { value: "deflate", label: "收缩" },
    { value: "arch-up", label: "向上弧形" },
    { value: "arch-down", label: "向下弧形" },
    { value: "circle", label: "圆形" },
    { value: "wave", label: "波浪" },
  ];
  readonly marginSides = [
    { key: "top", label: "上" },
    { key: "right", label: "右" },
    { key: "bottom", label: "下" },
    { key: "left", label: "左" },
  ];
  private readonly pendingSliderPatches = new Map<
    ObjectFormatSliderKey,
    ObjectFormatPatch
  >();
  private shapeEffectsDraft: ObjectEffects | null = null;
  private textEffectsDraft: ObjectEffects | null = null;
  private readonly collapsedSections = signal<ReadonlySet<ObjectFormatSection>>(
    new Set(),
  );
  readonly activeShapeSection = signal<ObjectFormatSection>("shape-fill");
  readonly activeTextSection = signal<ObjectFormatSection>("text-frame");

  constructor(readonly cdr: ChangeDetectorRef) {}

  get isMultiSelection(): boolean {
    return this.state.blockIds.length > 1;
  }
  get isGroupSelection(): boolean {
    return this.groupSelection;
  }
  get textTabOptions(): CsSegmentedOptions {
    return [
      ...(this.state.features.textFrame
        ? [{ value: "text-frame", label: "文本框" }]
        : []),
      ...(this.state.features.textStyle
        ? [
            { value: "text-typography", label: "字体" },
            { value: "text-effects", label: "外观" },
          ]
        : []),
    ];
  }
  get selectedTextSection(): ObjectFormatSection {
    const selected = this.activeTextSection();
    if (selected === "text-frame" && this.state.features.textFrame) {
      return selected;
    }
    if (
      (selected === "text-typography" || selected === "text-effects") &&
      this.state.features.textStyle
    ) {
      return selected;
    }
    return this.state.features.textFrame ? "text-frame" : "text-typography";
  }
  get shapeFill() {
    return (
      this.state.values.shapeFill.value ??
      this.state.targets[0].format.shapeFill!
    );
  }
  get shapeOutline() {
    return (
      this.state.values.shapeOutline.value ??
      this.state.targets[0].format.shapeOutline!
    );
  }
  get shapeEffects() {
    if (this.shapeEffectsDraft) return this.shapeEffectsDraft;
    return (
      this.state.values.shapeEffects.value ??
      this.state.targets[0].format.shapeEffects!
    );
  }
  get textFrame() {
    return (
      this.state.values.textFrame.value ??
      this.state.targets[0].format.textFrame!
    );
  }
  get textStyle() {
    const style =
      this.state.values.textStyle.value ??
      this.state.targets[0].format.textStyle!;
    return this.textEffectsDraft
      ? { ...style, effects: this.textEffectsDraft }
      : style;
  }

  get hasShapeEffectsDraft(): boolean {
    return this.shapeEffectsDraft !== null;
  }

  get hasTextEffectsDraft(): boolean {
    return this.textEffectsDraft !== null;
  }

  isPanelVisible(panel: ObjectFormatPanel): boolean {
    if (panel === "shape") return this.state.features.shape;
    if (panel === "text") {
      return Boolean(
        this.state.features.textFrame || this.state.features.textStyle,
      );
    }
    return true;
  }

  isObjectActionVisible(
    action: (typeof this.objectActions)[number]["action"],
  ): boolean {
    return action === "ungroup" ? this.isGroupSelection : this.isMultiSelection;
  }

  open(panel: ObjectFormatPanel): void {
    const closesCurrent = this.activePanel === panel;
    if (this.activePanel !== null) this.cancelEffectDrafts();
    this.activePanel = closesCurrent ? null : panel;
    this.panelChange.emit();
  }
  close(): void {
    this.commitPendingSliders();
    this.cancelEffectDrafts();
    this.activePanel = null;
    this.panelChange.emit();
  }
  isSectionOpen(section: ObjectFormatSection): boolean {
    return !this.collapsedSections().has(section);
  }
  toggleSection(section: ObjectFormatSection): void {
    this.collapsedSections.update((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
    this.panelChange.emit();
  }
  selectShapeSection(value: string | number): void {
    if (
      value === "shape-fill" ||
      value === "shape-outline" ||
      value === "shape-type" ||
      value === "shape-effects"
    ) {
      if (this.activeShapeSection() === "shape-effects" && value !== "shape-effects") {
        this.cancelShapeEffects();
      }
      this.activeShapeSection.set(value);
      this.panelChange.emit();
    }
  }
  selectTextSection(value: string | number): void {
    if (
      value === "text-frame" ||
      value === "text-typography" ||
      value === "text-effects"
    ) {
      if (this.activeTextSection() === "text-effects" && value !== "text-effects") {
        this.cancelTextEffects();
      }
      this.activeTextSection.set(value);
      this.panelChange.emit();
    }
  }
  layout(value: string): void {
    this.action.emit({ name: "layout", value });
  }
  isLayoutActive(value: BlockObjectLayout): boolean {
    return this.activeLayout === value;
  }
  percent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }
  stringValue(key: "shapeType"): string {
    return this.state.values[key].value ?? "";
  }
  shapeLabel(shapeType: string): string {
    return getShapeDefinition(shapeType as ShapeKind).label;
  }

  shapeTypeChangeValue(value: unknown): void {
    if (typeof value === "string" && value) this.patch({ shapeType: value });
  }
  paintChangeValue(target: "shape" | "text", paint: ObjectPaint): void {
    if (target === "shape") {
      this.patch({ shapeFill: paint });
      return;
    }
    this.patch({
      textStyle: { ...this.textStyle, fill: paint },
    });
  }
  pictureSourceValue(paint: ObjectPaint): string {
    return paint.type === "picture" ? paint.src : "";
  }
  hasUserPicture(paint: ObjectPaint): boolean {
    return paint.type === "picture" && Boolean(paint.src);
  }
  showsPaintOpacity(paint: ObjectPaint): boolean {
    return (
      paint.type !== "none" &&
      (paint.type !== "picture" || this.hasUserPicture(paint))
    );
  }
  paintOpacity(paint: ObjectPaint): number {
    return paint.type === "none" ? 0 : paint.opacity;
  }
  pictureUrlChange(event: Event): void {
    const fill = this.shapeFill.type === "picture"
      ? this.shapeFill
      : createObjectPaint("picture");
    this.patch({ shapeFill: { ...fill, src: valueFrom(event) } });
  }
  pictureFitChangeValue(target: "shape" | "text", value: unknown): void {
    if (!isStringEnum(value, PICTURE_FITS)) return;
    if (target === "shape") {
      if (this.shapeFill.type !== "picture") return;
      this.patch({ shapeFill: { ...this.shapeFill, fit: value } });
    } else {
      if (this.textStyle.fill.type !== "picture") return;
      this.patch({
        textStyle: {
          ...this.textStyle,
          fill: { ...this.textStyle.fill, fit: value },
        },
      });
    }
  }
  picturePositionValue(
    target: "shape" | "text",
    key: "positionX" | "positionY",
    sliderValue: CsSliderValue,
  ): void {
    const value = singleSliderValue(sliderValue);
    const fill = target === "shape" ? this.shapeFill : this.textStyle.fill;
    if (fill.type !== "picture") return;
    const patch: ObjectFormatPatch =
      target === "shape"
        ? { shapeFill: { ...fill, [key]: value } }
        : {
            textStyle: {
              ...this.textStyle,
              fill: { ...fill, [key]: value },
            },
          };
    const axis = key === "positionX" ? "x" : "y";
    this.stageSlider(`${target}-fill-position-${axis}`, patch);
  }
  fillOpacityValue(value: CsSliderValue): void {
    if (this.shapeFill.type === "none") return;
    this.stageSlider("shape-fill-opacity", {
      shapeFill: { ...this.shapeFill, opacity: singleSliderValue(value) / 100 },
    });
  }
  outlineEnabledChangeValue(value: boolean): void {
    this.patch({
      shapeOutline: { ...this.shapeOutline, type: value ? "line" : "none" },
    });
  }
  outlineColorChangeValue(value: string | null): void {
    if (value)
      this.patch({ shapeOutline: { ...this.shapeOutline, color: value } });
  }
  outlineNumberChangeValue(key: "width", value: number | null): void {
    if (value !== null)
      this.patch({ shapeOutline: { ...this.shapeOutline, [key]: value } });
  }
  outlineOpacityValue(value: CsSliderValue): void {
    this.stageSlider("shape-outline-opacity", {
      shapeOutline: {
        ...this.shapeOutline,
        opacity: singleSliderValue(value) / 100,
      },
    });
  }
  dashChangeValue(value: unknown): void {
    if (isStringEnum(value, LINE_DASHES))
      this.patch({ shapeOutline: { ...this.shapeOutline, dash: value } });
  }
  lineEnumChangeValue(key: "cap" | "join", value: unknown): void {
    if (key === "cap" && isStringEnum(value, LINE_CAPS)) {
      this.patch({ shapeOutline: { ...this.shapeOutline, cap: value } });
    } else if (key === "join" && isStringEnum(value, LINE_JOINS)) {
      this.patch({ shapeOutline: { ...this.shapeOutline, join: value } });
    }
  }
  arrowChangeValue(key: "startArrow" | "endArrow", value: unknown): void {
    if (isStringEnum(value, LINE_ARROWS))
      this.patch({ shapeOutline: { ...this.shapeOutline, [key]: value } });
  }
  effectEnabledValue(key: "shadow" | "glow", value: boolean): void {
    this.updateShapeEffectsDraft({
      ...this.shapeEffects,
      [key]: { ...this.shapeEffects[key], enabled: value },
    });
  }
  shadowNumberValue(
    key: "blur" | "angle" | "distance",
    value: number | null,
  ): void {
    if (value !== null)
      this.updateShapeEffectsDraft({
        ...this.shapeEffects,
        shadow: { ...this.shapeEffects.shadow, [key]: value },
      });
  }
  glowNumberValue(value: number | null): void {
    if (value !== null)
      this.updateShapeEffectsDraft({
        ...this.shapeEffects,
        glow: { ...this.shapeEffects.glow, radius: value },
      });
  }
  effectColorValue(key: "shadow" | "glow", value: string | null): void {
    if (value)
      this.updateShapeEffectsDraft({
        ...this.shapeEffects,
        [key]: { ...this.shapeEffects[key], color: value },
      });
  }
  effectOpacityValue(key: "shadow" | "glow", value: CsSliderValue): void {
    this.updateShapeEffectsDraft({
      ...this.shapeEffects,
      [key]: {
        ...this.shapeEffects[key],
        opacity: singleSliderValue(value) / 100,
      },
    });
  }

  applyShapeEffects(): void {
    const effects = this.shapeEffectsDraft;
    if (!effects) return;
    this.shapeEffectsDraft = null;
    this.patch({ shapeEffects: effects });
  }

  cancelShapeEffects(): void {
    if (!this.shapeEffectsDraft) return;
    this.shapeEffectsDraft = null;
    this.action.emit({ name: "restore-preview" });
  }
  marginChangeValue(index: number, value: number | null): void {
    if (value === null) return;
    const margins = [...this.textFrame.margins] as [
      number,
      number,
      number,
      number,
    ];
    margins[index] = value;
    this.patch({ textFrame: { ...this.textFrame, margins } });
  }
  directionChangeValue(value: unknown): void {
    if (isStringEnum(value, TEXT_DIRECTIONS))
      this.patch({ textFrame: { ...this.textFrame, direction: value } });
  }
  horizontalAlignChangeValue(value: unknown): void {
    if (isStringEnum(value, TEXT_HORIZONTAL_ALIGNS))
      this.patch({ textFrame: { ...this.textFrame, horizontalAlign: value } });
  }
  verticalAlignChangeValue(value: unknown): void {
    if (isStringEnum(value, TEXT_VERTICAL_ALIGNS))
      this.patch({ textFrame: { ...this.textFrame, verticalAlign: value } });
  }
  get textFontFamilyValue(): string | null {
    return this.state.values.textStyle.mixed
      ? null
      : resolveObjectTextFontValue(this.textStyle.fontFamily);
  }
  textFontFamilyChangeValue(value: unknown): void {
    if (
      typeof value !== "string" ||
      !OBJECT_TEXT_FONT_OPTIONS.some((font) => font.value === value)
    )
      return;
    this.patch({ textStyle: { ...this.textStyle, fontFamily: value } });
  }
  textNumberValue(
    key: "fontSize" | "letterSpacingEm" | "lineHeight",
    value: number | null,
  ): void {
    if (value !== null)
      this.patch({ textStyle: { ...this.textStyle, [key]: value } });
  }
  textFontWeightChangeValue(value: unknown): void {
    if (
      typeof value !== "number" ||
      !this.fontWeights.some((weight) => weight.value === value)
    ) {
      return;
    }
    this.patch({
      textStyle: {
        ...this.textStyle,
        fontWeight: value as ObjectTextStyle["fontWeight"],
      },
    });
  }
  textItalicValue(value: boolean): void {
    this.patch({
      textStyle: { ...this.textStyle, fontStyle: value ? "italic" : "normal" },
    });
  }
  textPictureUrl(event: Event): void {
    const fill = this.textStyle.fill.type === "picture"
      ? this.textStyle.fill
      : createObjectPaint("picture");
    this.patch({
      textStyle: {
        ...this.textStyle,
        fill: { ...fill, src: valueFrom(event) },
      },
    });
  }
  textFillOpacityValue(value: CsSliderValue): void {
    if (this.textStyle.fill.type === "none") return;
    this.stageSlider("text-fill-opacity", {
      textStyle: {
        ...this.textStyle,
        fill: {
          ...this.textStyle.fill,
          opacity: singleSliderValue(value) / 100,
        },
      },
    });
  }
  textOutlineEnabledValue(value: boolean): void {
    this.patch({
      textStyle: {
        ...this.textStyle,
        outline: value
          ? this.textStyle.outline.type === "line"
            ? {...this.textStyle.outline}
            : {type: "line", color: "#000000", width: 1}
          : {type: "none"},
      },
    });
  }
  textOutlineColorValue(value: string | null): void {
    if (value)
      this.patch({
        textStyle: {
          ...this.textStyle,
          outline: {
            type: "line",
            color: value,
            width: this.textStyle.outline.type === "line"
              ? this.textStyle.outline.width
              : 1,
          },
        },
      });
  }
  textOutlineWidthValue(value: number | null): void {
    if (value !== null)
      this.patch({
        textStyle: {
          ...this.textStyle,
          outline: {
            type: "line",
            color: this.textStyle.outline.type === "line"
              ? this.textStyle.outline.color
              : "#000000",
            width: value,
          },
        },
      });
  }
  textEffectEnabledValue(key: "shadow" | "glow", value: boolean): void {
    this.updateTextEffectsDraft({
      ...this.textStyle.effects,
      [key]: { ...this.textStyle.effects[key], enabled: value },
    });
  }
  textEffectColorValue(key: "shadow" | "glow", value: string | null): void {
    if (value)
      this.updateTextEffectsDraft({
        ...this.textStyle.effects,
        [key]: { ...this.textStyle.effects[key], color: value },
      });
  }
  textShadowNumberValue(
    key: "blur" | "angle" | "distance",
    value: number | null,
  ): void {
    if (value !== null)
      this.updateTextEffectsDraft({
        ...this.textStyle.effects,
        shadow: { ...this.textStyle.effects.shadow, [key]: value },
      });
  }
  textGlowRadiusValue(value: number | null): void {
    if (value !== null)
      this.updateTextEffectsDraft({
        ...this.textStyle.effects,
        glow: { ...this.textStyle.effects.glow, radius: value },
      });
  }

  textEffectOpacityValue(
    key: "shadow" | "glow",
    value: CsSliderValue,
  ): void {
    this.updateTextEffectsDraft({
      ...this.textStyle.effects,
      [key]: {
        ...this.textStyle.effects[key],
        opacity: singleSliderValue(value) / 100,
      },
    });
  }

  applyTextEffects(): void {
    const effects = this.textEffectsDraft;
    if (!effects) return;
    this.textEffectsDraft = null;
    const style =
      this.state.values.textStyle.value ??
      this.state.targets[0].format.textStyle!;
    this.patch({ textStyle: { ...style, effects } });
  }

  cancelTextEffects(): void {
    if (!this.textEffectsDraft) return;
    this.textEffectsDraft = null;
    this.action.emit({ name: "restore-preview" });
  }

  reapplyEffectDraftPreview(): void {
    if (this.shapeEffectsDraft) {
      this.preview({ shapeEffects: this.shapeEffectsDraft });
    }
    if (this.textEffectsDraft) {
      const style =
        this.state.values.textStyle.value ??
        this.state.targets[0].format.textStyle!;
      this.preview({ textStyle: { ...style, effects: this.textEffectsDraft } });
    }
  }
  transformChangeValue(value: unknown): void {
    if (isStringEnum(value, TEXT_TRANSFORMS))
      this.patch({ textStyle: { ...this.textStyle, transform: value } });
  }
  commitSlider(key: ObjectFormatSliderKey): void {
    const patch = this.pendingSliderPatches.get(key);
    if (!patch) return;
    this.pendingSliderPatches.delete(key);
    this.patch(patch);
  }
  private stageSlider(
    key: ObjectFormatSliderKey,
    patch: ObjectFormatPatch,
  ): void {
    this.pendingSliderPatches.set(key, patch);
    this.preview(patch);
  }
  private commitPendingSliders(): void {
    for (const key of [...this.pendingSliderPatches.keys()])
      this.commitSlider(key);
  }
  private updateShapeEffectsDraft(effects: ObjectEffects): void {
    this.shapeEffectsDraft = effects;
    this.preview({ shapeEffects: effects });
  }
  private updateTextEffectsDraft(effects: ObjectEffects): void {
    this.textEffectsDraft = effects;
    const style =
      this.state.values.textStyle.value ??
      this.state.targets[0].format.textStyle!;
    this.preview({ textStyle: { ...style, effects } });
  }
  private cancelEffectDrafts(): void {
    if (!this.shapeEffectsDraft && !this.textEffectsDraft) return;
    this.shapeEffectsDraft = null;
    this.textEffectsDraft = null;
    this.action.emit({ name: "restore-preview" });
  }
  private patch(patch: ObjectFormatPatch): void {
    this.action.emit({ name: "patch", patch });
  }
  private preview(patch: ObjectFormatPatch): void {
    this.action.emit({ name: "preview", patch });
  }
}

function valueFrom(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}
function singleSliderValue(value: CsSliderValue): number {
  return Array.isArray(value) ? value[0] : value;
}

function isStringEnum<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return typeof value === "string" && values.some((option) => option === value);
}

const PICTURE_FITS = [
  "cover",
  "contain",
  "stretch",
] as const satisfies readonly ObjectPictureFit[];
const LINE_DASHES = [
  "solid",
  "dot",
  "dash",
  "dash-dot",
  "long-dash",
  "long-dash-dot",
] as const satisfies readonly ObjectLineDash[];
const LINE_CAPS = [
  "butt",
  "round",
  "square",
] as const satisfies readonly ObjectLineCap[];
const LINE_JOINS = [
  "miter",
  "round",
  "bevel",
] as const satisfies readonly ObjectLineJoin[];
const LINE_ARROWS = [
  "none",
  "triangle",
  "stealth",
  "diamond",
  "oval",
] as const satisfies readonly ObjectLineArrow[];
const TEXT_DIRECTIONS = [
  "horizontal",
  "vertical-rl",
  "rotate-90",
  "rotate-270",
] as const satisfies readonly ObjectTextDirection[];
const TEXT_HORIZONTAL_ALIGNS = [
  "left",
  "center",
  "right",
  "justify",
] as const satisfies readonly ObjectTextHorizontalAlign[];
const TEXT_VERTICAL_ALIGNS = [
  "top",
  "middle",
  "bottom",
] as const satisfies readonly ObjectTextVerticalAlign[];
const TEXT_TRANSFORMS = [
  "none",
  "slant-left",
  "slant-right",
  "slant-up",
  "slant-down",
  "perspective-left",
  "perspective-right",
  "perspective-up",
  "perspective-down",
  "wide",
  "narrow",
  "tall",
  "short",
  "inflate",
  "deflate",
  "arch-up",
  "arch-down",
  "circle",
  "wave",
] as const satisfies readonly ObjectTextTransform[];
