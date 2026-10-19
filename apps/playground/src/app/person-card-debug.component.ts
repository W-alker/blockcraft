import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, inject} from '@angular/core'
import {CsInputNumberComponent} from '@cses/ui'
import {Subscription} from 'rxjs'
import {BlockCraftDoc, PERSON_CARD_STYLES, showsDept, personCardFonts, storePersonCardFont, type PersonCardRenderComponent, type PersonCardFontRole} from '@ccc/blockcraft'

/** 调试台直接操作真实人员块；不维护与文档脱节的预览模型。 */
@Component({
  selector: 'playground-person-card-debug',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CsInputNumberComponent],
  template: `
    <section class="person-debug" data-testid="person-card-debug">
      <h3>人员块排版</h3>
      <button type="button" (click)="insertExamples()" [disabled]="doc?.isInitialized && doc?.isReadonly">插入人员块示例</button>
      <p>边手柄调整宽高，角手柄等比缩放。</p>
      @if (selected; as block) {
        <fieldset [disabled]="block.isReadonly">
          <label>排版样式
            <select aria-label="人员排版样式" [value]="block.props.style || 'row'" (change)="setStyle($event)">
              @for (style of styles; track style.id) { <option [value]="style.id">{{style.label}}</option> }
            </select>
          </label>
          <div class="person-debug__grid">
            <label>宽度
              <cs-input-number data-testid="person-width" csSize="sm" [csMin]="48" [csPrecision]="0"
                [csDisabled]="block.isReadonly" [csValue]="block.props.width || 0" (csValueChange)="setDimension('width', $event)" />
            </label>
            <label>高度
              <cs-input-number data-testid="person-height" csSize="sm" [csMin]="32" [csPrecision]="0"
                [csDisabled]="block.isReadonly" [csValue]="block.props.height || 0" (csValueChange)="setDimension('height', $event)" />
            </label>
          </div>
          <label>整体缩放 %
            <cs-input-number data-testid="person-scale" csSize="sm" [csMin]="10" [csMax]="1000" [csPrecision]="0"
              [csDisabled]="block.isReadonly" [csValue]="percent(block.contentScale)" (csValueChange)="setScale($event)" />
          </label>
          <label>头像大小
            <select aria-label="人员头像大小" [value]="block.props.avatarSize || 'medium'" (change)="setAvatar($event)">
              <option value="small">小</option><option value="medium">中</option><option value="large">大</option>
            </select>
          </label>
          <label>部门/职务
            <select aria-label="部门职务" [value]="block.props.dept || 'off'" (change)="setDepartment($event)">
              <option value="off">不显示</option><option value="on">跟随排版</option><option value="below">名称下方</option>
              <option value="right">名称右侧</option><option value="above">名称上方</option>
            </select>
          </label>
          <div class="person-debug__grid">
            @for (font of fonts; track font.role) {
              @if (font.role !== 'desc' || showsDept(block.props.dept)) {
                <label>{{labels[font.role]}}字号
                  <cs-input-number [attr.data-testid]="'person-font-' + font.role" csSize="sm"
                    [csMin]="4" [csMax]="512" [csPrecision]="1" [csDisabled]="block.isReadonly"
                    [csValue]="fontDisplay(font.size, block.contentScale)" (csValueChange)="setFont(font.role, $event)" />
                </label>
              }
            }
          </div>
          <button type="button" (click)="resetFonts()">恢复当前样式字号</button>
        </fieldset>
      } @else {
        <p>选中人员块后，可单独调整姓名、拼音和部门字号。</p>
      }
    </section>
  `,
  styles: [`
    .person-debug { padding:16px; border:1px solid var(--bc-border-color, #e5e7eb); border-radius:12px; background:var(--bc-bg-primary, #fff); }
    h3 { margin:0 0 12px; font-size:14px; } p { font-size:12px; line-height:1.6; color:var(--bc-color-secondary, #64748b); margin:10px 0; }
    fieldset { border:0; padding:0; margin:0; min-width:0; display:grid; gap:12px; }
    label { display:grid; gap:6px; font-size:12px; min-width:0; }
    .person-debug__grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    select, button { color:inherit; font:inherit; background:var(--bc-bg-primary, #fff); border:1px solid var(--bc-border-color, #dce0e6); border-radius:6px; padding:6px 8px; }
    button { cursor:pointer; font-size:12px; } cs-input-number { width:100%; }
  `],
})
export class PersonCardDebugComponent implements OnChanges, OnDestroy {
  @Input() doc: BlockCraftDoc | null = null
  @Output() prepare = new EventEmitter<void>()
  selected: PersonCardRenderComponent | null = null
  readonly styles = PERSON_CARD_STYLES.all
  readonly showsDept = showsDept
  readonly labels = {name: '姓名', pinyin: '拼音', desc: '部门/职务'}
  private subscriptions = new Subscription()
  private readonly zone = inject(NgZone)
  private readonly cdr = inject(ChangeDetectorRef)

  get fonts() { return personCardFonts(this.selected?.props.style, this.selected?.props ?? {}) }

  ngOnChanges(): void {
    this.subscriptions.unsubscribe()
    this.subscriptions = new Subscription()
    const doc = this.doc
    if (!doc) return
    const refresh = () => this.zone.run(() => {
      const selection = doc.selection.value
      const block = selection?.anchor.blockId === selection?.head.blockId ? selection?.firstBlock : null
      if (selection) this.selected = block?.flavour === 'person-card' ? block as PersonCardRenderComponent : null
      else if (this.selected && !doc.model.exists(this.selected.id)) this.selected = null
      this.cdr.markForCheck()
    })
    this.subscriptions.add(doc.selection.changeObserve().subscribe(refresh))
    this.subscriptions.add(doc.onPropsUpdate$.subscribe(refresh))
    this.subscriptions.add(doc.subscribeReadonlyChange(refresh))
    refresh()
  }

  ngOnDestroy(): void { this.subscriptions.unsubscribe() }

  async insertExamples(): Promise<void> {
    this.prepare.emit()
    const doc = this.doc
    if (!doc?.isInitialized || doc.isReadonly) return
    const examples = [
      {style: 'row', width: 340, height: 88},
      {style: 'rowPinyin', width: 340, height: 110},
      {style: 'column', width: 200, height: 180},
    ].map(geometry => ({
      ...doc.schemas.createSnapshot('person-card', []),
      props: {...geometry, sc: 1, dept: 'on', person: JSON.stringify({
        name: '欧阳明月 Alexandra', pinyin: 'OU YANG MING YUE ALEXANDRA',
        description: '信息技术中心 / 平台架构与研发工程师',
      })},
    }))
    doc.crud.insertBlockSnapshots(doc.rootId, 0, examples)
    if (await doc.navigateToBlock(examples[0].id)) {
      doc.selection.selectBlock(doc.getBlockById(examples[0].id))
    }
  }

  private patch(props: Record<string, unknown>, geometry = false): void {
    const block = this.selected
    if (!block || block.isReadonly) return
    const patch = {sc: Math.round(block.contentScale * 100) / 100, ...props}
    block.doc.crud.undoManager.stopCapturing()
    block.doc.crud.transact(() => {
      if (geometry) block.doc.placement.updateObjectGeometry(block.id, patch)
      else block.updateProps(patch)
    })
    block.doc.crud.undoManager.stopCapturing()
  }
  percent(scale: number): number { return Math.round(scale * 100) }
  fontDisplay(size: number, scale: number): number { return Math.round(size * scale * 10) / 10 }
  setStyle(event: Event): void { this.patch({style: (event.target as HTMLSelectElement).value}) }
  setAvatar(event: Event): void { this.patch({avatarSize: (event.target as HTMLSelectElement).value}) }
  setDepartment(event: Event): void { this.patch({dept: (event.target as HTMLSelectElement).value}) }
  setDimension(key: 'width' | 'height', value: number | null): void {
    if (value != null && Number.isFinite(value) && value >= (key === 'width' ? 48 : 32)) this.patch({[key]: Math.round(value)}, true)
  }
  setScale(value: number | null): void {
    const block = this.selected
    if (!block || value == null || !Number.isFinite(value) || value < 10 || value > 1000) return
    const scale = Math.round(value) / 100
    const factor = scale / block.contentScale
    this.patch({sc: scale, width: Math.round(Number(block.props.width) * factor), height: Math.round(Number(block.props.height) * factor)}, true)
  }
  setFont(role: PersonCardFontRole, value: number | null): void {
    const block = this.selected
    if (!block || value == null || !Number.isFinite(value) || value < 4 || value > 512) return
    this.patch(storePersonCardFont(block.props.style, block.props, role, Math.round(value * 10) / 10 / block.contentScale))
  }
  resetFonts(): void { this.patch(Object.fromEntries(this.fonts.map(font => [font.key, null]))) }
}
