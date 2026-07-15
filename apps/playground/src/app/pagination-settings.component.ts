import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
} from "@angular/core";
import {FormsModule} from "@angular/forms";
import {
  PageSizeName,
  PaginationConfig,
  PaginationPlugin,
} from "@ccc/blockcraft";

/** 设置面板里下拉可选的纸张（任务约定的子集，非引擎全集）。 */
const PAGE_SIZE_OPTIONS: PageSizeName[] = ["A4", "A3", "A5", "Letter", "Legal"];

type Orientation = "portrait" | "landscape";

/** 自动页码可放置的位置（页眉/页脚 × 左/中/右），none = 不显示页码。 */
type PageNumberPosition =
  | "none"
  | "header-left" | "header-center" | "header-right"
  | "footer-left" | "footer-center" | "footer-right";

const PAGE_NUMBER_POSITIONS: {value: PageNumberPosition; label: string}[] = [
  {value: "none", label: "无"},
  {value: "header-left", label: "页眉左"},
  {value: "header-center", label: "页眉中"},
  {value: "header-right", label: "页眉右"},
  {value: "footer-left", label: "页脚左"},
  {value: "footer-center", label: "页脚中"},
  {value: "footer-right", label: "页脚右"},
];

/** 页码格式（含 {page}/{total} 占位，渲染时按页替换）。 */
const PAGE_NUMBER_FORMATS: {value: string; label: string}[] = [
  {value: "{page}", label: "1"},
  {value: "{page} / {total}", label: "1 / N"},
  {value: "第 {page} 页", label: "第 1 页"},
  {value: "第 {page} / {total} 页", label: "第 1 / N 页"},
];

interface MarginState {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface ChromeState {
  left: string;
  center: string;
  right: string;
}

interface PageNumberState {
  position: PageNumberPosition;
  format: string;
}

/** 面板本地状态（双向绑定用），从 PaginationConfig 解析而来，带默认值。 */
interface SettingsState {
  pageSize: PageSizeName;
  orientation: Orientation;
  margins: MarginState;
  header: ChromeState;
  footer: ChromeState;
  pageNumber: PageNumberState;
}

/**
 * 分页设置面板（宿主/调试用）。
 *
 * 直接绑定 PaginationPlugin。读取当前 config 初始化控件，任一控件变化
 * 即调用 plugin.updateConfig(...) 触发重排。
 *
 * - **可收起/展开**：默认展开；点标题栏「▾」收起为一个小按钮（不挡内容），点小按钮再展开。
 * - **自动页码**：选位置（页眉/页脚 × 左/中/右）+ 格式，自动把页码写入对应段（无需手填 {page}）。
 *
 * 独立宿主面板组件，样式自包含（`styles`），不依赖编辑器主题 token。
 */
@Component({
  selector: "bc-pagination-settings",
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (collapsed) {
      <button type="button" class="bc-pg-launcher" (click)="collapsed = false">
        分页设置 <span class="bc-pg-chevron">▾</span>
      </button>
    } @else {
      <div class="bc-pg-panel">
        <div class="bc-pg-titlebar">
          <span class="bc-pg-title">分页设置</span>
          <button type="button" class="bc-pg-collapse" title="收起" (click)="collapsed = true">▴</button>
        </div>

        <div class="bc-pg-field">
          <label class="bc-pg-label">纸张大小</label>
          <select
            class="bc-pg-select"
            [ngModel]="state.pageSize"
            (ngModelChange)="onPageSizeChange($event)">
            @for (size of pageSizeOptions; track size) {
              <option [ngValue]="size">{{ size }}</option>
            }
          </select>
        </div>

        <div class="bc-pg-field">
          <label class="bc-pg-label">方向</label>
          <div class="bc-pg-seg">
            <button
              type="button"
              class="bc-pg-seg-btn"
              [class.bc-pg-seg-btn--active]="state.orientation === 'portrait'"
              (click)="onOrientationChange('portrait')">
              纵向
            </button>
            <button
              type="button"
              class="bc-pg-seg-btn"
              [class.bc-pg-seg-btn--active]="state.orientation === 'landscape'"
              (click)="onOrientationChange('landscape')">
              横向
            </button>
          </div>
        </div>

        <div class="bc-pg-field">
          <label class="bc-pg-label">页边距 (px)</label>
          <div class="bc-pg-grid4">
            <div class="bc-pg-num">
              <span class="bc-pg-num-cap">上</span>
              <input type="number" class="bc-pg-input" [ngModel]="state.margins.top" (ngModelChange)="onMarginChange('top', $event)" />
            </div>
            <div class="bc-pg-num">
              <span class="bc-pg-num-cap">右</span>
              <input type="number" class="bc-pg-input" [ngModel]="state.margins.right" (ngModelChange)="onMarginChange('right', $event)" />
            </div>
            <div class="bc-pg-num">
              <span class="bc-pg-num-cap">下</span>
              <input type="number" class="bc-pg-input" [ngModel]="state.margins.bottom" (ngModelChange)="onMarginChange('bottom', $event)" />
            </div>
            <div class="bc-pg-num">
              <span class="bc-pg-num-cap">左</span>
              <input type="number" class="bc-pg-input" [ngModel]="state.margins.left" (ngModelChange)="onMarginChange('left', $event)" />
            </div>
          </div>
        </div>

        <div class="bc-pg-field">
          <label class="bc-pg-label">自动页码</label>
          <div class="bc-pg-grid2">
            <select
              class="bc-pg-select"
              [ngModel]="state.pageNumber.position"
              (ngModelChange)="onPageNumberChange($event, state.pageNumber.format)">
              @for (p of pageNumberPositions; track p.value) {
                <option [ngValue]="p.value">{{ p.label }}</option>
              }
            </select>
            <select
              class="bc-pg-select"
              [disabled]="state.pageNumber.position === 'none'"
              [ngModel]="state.pageNumber.format"
              (ngModelChange)="onPageNumberChange(state.pageNumber.position, $event)">
              @for (f of pageNumberFormats; track f.value) {
                <option [ngValue]="f.value">{{ f.label }}</option>
              }
            </select>
          </div>
        </div>

        <div class="bc-pg-field">
          <label class="bc-pg-label">页眉</label>
          <div class="bc-pg-grid3">
            <input type="text" class="bc-pg-input" placeholder="左" [ngModel]="state.header.left" (ngModelChange)="onChromeChange('header', 'left', $event)" />
            <input type="text" class="bc-pg-input" placeholder="中" [ngModel]="state.header.center" (ngModelChange)="onChromeChange('header', 'center', $event)" />
            <input type="text" class="bc-pg-input" placeholder="右" [ngModel]="state.header.right" (ngModelChange)="onChromeChange('header', 'right', $event)" />
          </div>
        </div>

        <div class="bc-pg-field">
          <label class="bc-pg-label">页脚</label>
          <div class="bc-pg-grid3">
            <input type="text" class="bc-pg-input" placeholder="左" [ngModel]="state.footer.left" (ngModelChange)="onChromeChange('footer', 'left', $event)" />
            <input type="text" class="bc-pg-input" placeholder="中" [ngModel]="state.footer.center" (ngModelChange)="onChromeChange('footer', 'center', $event)" />
            <input type="text" class="bc-pg-input" placeholder="右" [ngModel]="state.footer.right" (ngModelChange)="onChromeChange('footer', 'right', $event)" />
          </div>
        </div>

        <div class="bc-pg-hint">页眉/页脚支持 {{ '{page}' }} / {{ '{total}' }} 占位符</div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .bc-pg-launcher {
        appearance: none;
        padding: 8px 14px;
        border-radius: 10px;
        border: none;
        background: #4857e2;
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
      }

      .bc-pg-chevron {
        font-size: 10px;
        opacity: 0.85;
      }

      .bc-pg-panel {
        width: 260px;
        max-height: calc(100vh - 120px);
        overflow-y: auto;
        box-sizing: border-box;
        padding: 14px 16px 12px;
        border-radius: 12px;
        background: #ffffff;
        border: 1px solid rgba(15, 23, 42, 0.1);
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16);
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          "Helvetica Neue", Arial, sans-serif;
        color: #0f172a;
      }

      .bc-pg-titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }

      .bc-pg-title {
        font-size: 13px;
        font-weight: 700;
        color: #0f172a;
      }

      .bc-pg-collapse {
        appearance: none;
        border: none;
        background: transparent;
        color: #64748b;
        font-size: 15px;
        line-height: 1;
        cursor: pointer;
        padding: 2px 8px;
        border-radius: 6px;
      }

      .bc-pg-collapse:hover {
        background: #f1f5f9;
        color: #0f172a;
      }

      .bc-pg-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 12px;
      }

      .bc-pg-label {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: #64748b;
      }

      .bc-pg-select,
      .bc-pg-input {
        width: 100%;
        box-sizing: border-box;
        height: 30px;
        padding: 0 8px;
        border-radius: 8px;
        border: 1px solid rgba(15, 23, 42, 0.16);
        background: #fff;
        color: #0f172a;
        font-size: 12px;
        outline: none;
      }

      .bc-pg-select:disabled {
        background: #f1f5f9;
        color: #94a3b8;
      }

      .bc-pg-select:focus,
      .bc-pg-input:focus {
        border-color: #4857e2;
        box-shadow: 0 0 0 2px rgba(72, 87, 226, 0.16);
      }

      .bc-pg-seg {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }

      .bc-pg-seg-btn {
        appearance: none;
        height: 30px;
        border-radius: 8px;
        border: 1px solid rgba(15, 23, 42, 0.16);
        background: #f8fafc;
        color: #334155;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .bc-pg-seg-btn:hover {
        border-color: rgba(72, 87, 226, 0.5);
      }

      .bc-pg-seg-btn--active {
        background: #4857e2;
        border-color: #4857e2;
        color: #fff;
      }

      .bc-pg-grid4 {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }

      .bc-pg-grid3 {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
      }

      .bc-pg-grid2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }

      .bc-pg-num {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .bc-pg-num-cap {
        flex-shrink: 0;
        width: 14px;
        font-size: 11px;
        color: #64748b;
        text-align: center;
      }

      .bc-pg-hint {
        margin-top: 2px;
        font-size: 11px;
        color: #94a3b8;
      }
    `,
  ],
})
export class PaginationSettingsComponent implements OnInit {
  @Input({required: true}) plugin!: PaginationPlugin;

  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  readonly pageNumberPositions = PAGE_NUMBER_POSITIONS;
  readonly pageNumberFormats = PAGE_NUMBER_FORMATS;

  /** 收起/展开状态。默认展开。 */
  collapsed = false;

  state: SettingsState = this.createDefaultState();

  ngOnInit(): void {
    this.syncFromConfig();
  }

  /** 从当前插件配置读取并填充控件。 */
  private syncFromConfig(): void {
    this.state = this.resolveState(this.plugin.config);
  }

  private createDefaultState(): SettingsState {
    return {
      pageSize: "A4",
      orientation: "portrait",
      margins: {top: 72, right: 72, bottom: 72, left: 72},
      header: {left: "", center: "", right: ""},
      footer: {left: "", center: "", right: ""},
      pageNumber: {position: "none", format: "{page}"},
    };
  }

  /** 把 PaginationConfig 解析为面板本地状态（带默认值兜底）。 */
  private resolveState(config: PaginationConfig | undefined): SettingsState {
    const base = this.createDefaultState();
    if (!config) {
      return base;
    }

    const pageSize =
      typeof config.pageSize === "string" &&
      PAGE_SIZE_OPTIONS.includes(config.pageSize)
        ? config.pageSize
        : base.pageSize;

    const header: ChromeState = {
      left: config.header?.left ?? "",
      center: config.header?.center ?? "",
      right: config.header?.right ?? "",
    };
    const footer: ChromeState = {
      left: config.footer?.left ?? "",
      center: config.footer?.center ?? "",
      right: config.footer?.right ?? "",
    };

    return {
      pageSize,
      orientation: config.orientation ?? base.orientation,
      margins: {
        top: config.margins?.top ?? base.margins.top,
        right: config.margins?.right ?? base.margins.right,
        bottom: config.margins?.bottom ?? base.margins.bottom,
        left: config.margins?.left ?? base.margins.left,
      },
      header,
      footer,
      pageNumber: this.detectPageNumber(header, footer),
    };
  }

  /** 从现有 header/footer 反推页码控件初值：找到第一个含 {page} 的段。 */
  private detectPageNumber(header: ChromeState, footer: ChromeState): PageNumberState {
    const areas: [PageNumberPosition, string][] = [
      ["header-left", header.left], ["header-center", header.center], ["header-right", header.right],
      ["footer-left", footer.left], ["footer-center", footer.center], ["footer-right", footer.right],
    ];
    for (const [pos, text] of areas) {
      if (text && text.includes("{page}")) {
        const matched = PAGE_NUMBER_FORMATS.find(f => f.value === text);
        return {position: pos, format: matched ? matched.value : "{page}"};
      }
    }
    return {position: "none", format: "{page}"};
  }

  onPageSizeChange(value: PageSizeName): void {
    this.state = {...this.state, pageSize: value};
    this.plugin.updateConfig({pageSize: value});
  }

  onOrientationChange(value: Orientation): void {
    this.state = {...this.state, orientation: value};
    this.plugin.updateConfig({orientation: value});
  }

  onMarginChange(side: keyof MarginState, value: number): void {
    const next = Number.isFinite(value) ? value : 0;
    const margins: MarginState = {...this.state.margins, [side]: next};
    this.state = {...this.state, margins};
    this.plugin.updateConfig({margins: {...margins}});
  }

  onChromeChange(target: "header" | "footer", segment: keyof ChromeState, value: string): void {
    const chrome: ChromeState = {...this.state[target], [segment]: value};
    this.state = {...this.state, [target]: chrome};
    this.plugin.updateConfig({[target]: {...chrome}});
  }

  /** 自动页码：把页码文本写入选定段（先清掉上一位置），其余段保持不变。 */
  onPageNumberChange(position: PageNumberPosition, format: string): void {
    const header: ChromeState = {...this.state.header};
    const footer: ChromeState = {...this.state.footer};

    const setSeg = (pos: PageNumberPosition, text: string): void => {
      if (pos === "none") return;
      const [area, seg] = pos.split("-") as ["header" | "footer", keyof ChromeState];
      if (area === "header") header[seg] = text;
      else footer[seg] = text;
    };

    const prev = this.state.pageNumber.position;
    if (prev !== "none") setSeg(prev, "");           // 清掉旧位置
    if (position !== "none") setSeg(position, format); // 写入新位置

    this.state = {...this.state, header, footer, pageNumber: {position, format}};
    this.plugin.updateConfig({header: {...header}, footer: {...footer}});
  }
}
