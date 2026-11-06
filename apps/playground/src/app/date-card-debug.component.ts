import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, inject} from '@angular/core'
import {CsInputNumberComponent} from '@cses/ui'
import {Subscription} from 'rxjs'
import {BlockCraftDoc, DATE_CARD_STYLES, DATE_FORMATS, TYPOGRAPHY_FONT_FAMILIES, isTypographyFontFamilyId, dateCardFonts, storeDateCardFont, type DateCardModel, type DateCardRenderComponent, type DateCardFontRole} from '@ccc/blockcraft'

/** 调试台直接操作真实日期块；不维护与文档脱节的预览模型。 */
@Component({
  selector: 'playground-date-card-debug',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CsInputNumberComponent],
  template: `
    <section class="date-debug" data-testid="date-card-debug">
      <h3>日期块排版</h3>
      <button type="button" (click)="insertExamples(true)" [disabled]="doc?.isInitialized && doc?.isReadonly">插入新增 5 种样式</button>
      <button type="button" (click)="insertExamples()" [disabled]="doc?.isInitialized && doc?.isReadonly">插入日期块示例</button>
      <p>字体跟随文档或单独设置，字号随整卡缩放。</p>
      @if (selected; as block) {
        <fieldset [disabled]="block.isReadonly">
          <label>排版样式
            <select aria-label="日期排版样式" [value]="block.props.style || 'calendar'" (change)="setStyle($event)">
              @for (style of styles; track style.id) { <option [value]="style.id" [selected]="style.id === (block.props.style || 'calendar')">{{style.label}}</option> }
            </select>
          </label>
          <label>字体
            <select aria-label="日期字体" [value]="block.props.ff || ''" (change)="setFamily($event)">
              <option value="" [selected]="!block.props.ff">跟随文档</option>
              @for (font of families; track font.id) { <option [value]="font.id" [selected]="font.id === block.props.ff">{{font.label}}</option> }
            </select>
          </label>
          <label>日期格式
            <select aria-label="日期格式" [value]="block.props.format || 'full'" (change)="setFormat($event)">
              <option value="full">完整</option><option value="noWeek">不含星期</option><option value="min">极简</option>
            </select>
          </label>
          <div class="date-debug__grid">
            @for (font of fonts; track font.role) {
              @if (font.visible) {
                <label>{{font.label}}字号
                  <cs-input-number [attr.data-testid]="'date-font-' + font.role" csSize="sm"
                    [csMin]="4" [csMax]="512" [csPrecision]="1" [csDisabled]="block.isReadonly"
                    [csValue]="fontDisplay(font.size, block.contentScale)" (csValueChange)="setFont(font.role, $event)" />
                </label>
              }
            }
          </div>
          <button type="button" (click)="resetFonts()">恢复当前样式字号</button>
        </fieldset>
      } @else {
        <p>选中日期卡片后，可调整字体和各行字号。</p>
      }
    </section>
  `,
  styles: [`
    .date-debug { padding:16px; border:1px solid var(--bc-border-color, #e5e7eb); border-radius:12px; background:var(--bc-bg-primary, #fff); }
    h3 { margin:0 0 12px; font-size:14px; } p { font-size:12px; line-height:1.6; color:var(--bc-color-secondary, #64748b); margin:10px 0; }
    fieldset { border:0; padding:0; margin:0; min-width:0; display:grid; gap:12px; }
    label { display:grid; gap:6px; font-size:12px; min-width:0; }
    .date-debug__grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    select, button { color:inherit; font:inherit; background:var(--bc-bg-primary, #fff); border:1px solid var(--bc-border-color, #dce0e6); border-radius:6px; padding:6px 8px; }
    button { cursor:pointer; font-size:12px; } cs-input-number { width:100%; }
  `],
})
export class DateCardDebugComponent implements OnChanges, OnDestroy {
  @Input() doc: BlockCraftDoc | null = null
  @Output() prepare = new EventEmitter<void>()
  selected: DateCardRenderComponent | null = null
  readonly styles = DATE_CARD_STYLES.all
  readonly families = TYPOGRAPHY_FONT_FAMILIES
  private subscriptions = new Subscription()
  private readonly zone = inject(NgZone)
  private readonly cdr = inject(ChangeDetectorRef)

  get fonts() { return dateCardFonts(this.selected?.props.style, this.selected?.props ?? {}, this.selected?.props.format) }

  ngOnChanges(): void {
    this.subscriptions.unsubscribe()
    this.subscriptions = new Subscription()
    this.selected = null
    const doc = this.doc
    if (!doc) return
    const refresh = () => this.zone.run(() => {
      const selection = doc.selection.value
      const block = selection?.anchor.blockId === selection?.head.blockId ? selection?.firstBlock : null
      if (selection) this.selected = block?.flavour === 'date-card' ? block as DateCardRenderComponent : null
      else if (this.selected && !doc.model.exists(this.selected.id)) this.selected = null
      this.cdr.markForCheck()
    })
    this.subscriptions.add(doc.selection.changeObserve().subscribe(refresh))
    this.subscriptions.add(doc.onPropsUpdate$.subscribe(refresh))
    this.subscriptions.add(doc.subscribeReadonlyChange(refresh))
    refresh()
  }

  ngOnDestroy(): void { this.subscriptions.unsubscribe() }

  async insertExamples(newOnly = false): Promise<void> {
    this.prepare.emit()
    const doc = this.doc
    if (!doc?.isInitialized || doc.isReadonly) return
    const styles = newOnly ? this.styles.filter(style => ['masthead', 'bookmark', 'split', 'pill', 'rail'].includes(style.id)) : this.styles
    const examples = styles.map(style => ({
      ...doc.schemas.createSnapshot('date-card', []),
      props: {style: style.id, date: '2026-09-21T10:00'},
    }))
    doc.crud.insertBlockSnapshots(doc.rootId, 0, examples)
    if (await doc.navigateToBlock(examples[0].id)) {
      doc.selection.selectBlock(doc.getBlockById(examples[0].id))
    }
  }

  private patch(props: Partial<DateCardModel['props']>): void {
    const block = this.selected
    if (!block || block.isReadonly) return
    block.doc.crud.undoManager.stopCapturing()
    block.doc.crud.transact(() => block.updateProps(props))
    block.doc.crud.undoManager.stopCapturing()
  }
  fontDisplay(size: number, scale: number): number { return Math.round(size * scale * 10) / 10 }
  setStyle(event: Event): void { this.patch({style: (event.target as HTMLSelectElement).value}) }
  setFamily(event: Event): void {
    const value = (event.target as HTMLSelectElement).value
    if (!value || isTypographyFontFamilyId(value)) this.patch({ff: value || null})
  }
  setFormat(event: Event): void {
    const value = (event.target as HTMLSelectElement).value
    if (Object.values(DATE_FORMATS).includes(value as 'full')) this.patch({format: value})
  }
  setFont(role: DateCardFontRole, value: number | null): void {
    const block = this.selected
    if (!block || value == null || !Number.isFinite(value) || value < 4 || value > 512) return
    this.patch(storeDateCardFont(block.props.style, block.props, role, Math.round(value * 10) / 10 / block.contentScale))
  }
  resetFonts(): void { this.patch(Object.fromEntries(this.fonts.map(font => [font.key, null]))) }
}
