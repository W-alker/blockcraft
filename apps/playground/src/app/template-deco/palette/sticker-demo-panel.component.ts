import {ChangeDetectionStrategy, Component, Input, OnDestroy, OnInit, signal} from '@angular/core'
import {
  BlockCraftDoc,
  STICKER_PRESETS,
  getStickerPreset,
  renderStickerDataUrl,
  setStickerColor,
  type StickerBlockProps,
} from '@ccc/blockcraft'
import {Subscription} from 'rxjs'
import {resolveContentInsertionTarget} from './content-block-insertion'

@Component({
  selector: 'sticker-demo-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="stickers">
      <div class="stickers__head">
        <strong>可编辑贴纸 · 演示</strong>
        <span>SVG 预设 / 稀疏改色</span>
      </div>
      <div class="stickers__catalog">
        @for (preset of presets; track preset.id + '@' + preset.version) {
          <button type="button" [attr.aria-label]="'插入' + preset.label"
                  (mousedown)="$event.preventDefault()" (click)="insert(preset.id, preset.version)">
            <img [src]="preview(preset.id, preset.version)" alt="" />
            <span>{{ preset.label }}</span>
          </button>
        }
      </div>
      @if (selectedProps(); as props) {
        @if (presetOf(props); as preset) {
          <div class="stickers__editor">
            <div class="stickers__subhead">
              <strong>{{ preset.label }}</strong>
              <button type="button" (click)="reset()">恢复默认</button>
            </div>
            @for (slot of colorSlots(props); track slot.key) {
              <label class="stickers__slot">
                <span>{{ slot.key }}</span>
                <input type="color" [value]="slot.value"
                       [attr.aria-label]="'贴纸颜色 ' + slot.key"
                       (input)="changeColor(slot.key, $event)" />
                <code>{{ slot.value }}</code>
              </label>
            }
            <p>文档实例只存预设 ID、版本、尺寸及改动过的颜色。</p>
            <pre>{{ serialized() }}</pre>
          </div>
        } @else {
          <p class="stickers__empty">此贴纸所需的预设版本不可用。</p>
        }
      } @else {
        <p class="stickers__empty">插入或选中贴纸后，可分别调整颜色。</p>
      }
    </section>
  `,
  styles: [`
    :host { display:block; border-bottom:1px solid #eef0f6; }
    .stickers { padding:12px 14px; background:#fff; font-size:12px; color:#434b5c; }
    .stickers__head,.stickers__subhead { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .stickers__head span { color:#9299a7; font-size:10px; }
    .stickers__catalog { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; margin-top:10px; }
    .stickers__catalog button { display:flex; flex-direction:column; align-items:center; gap:4px; min-width:0; padding:8px 3px; border:1px solid #e8eaf0; border-radius:8px; background:#fff; cursor:pointer; color:#596073; font-size:10px; }
    .stickers__catalog button:hover { border-color:#6682b9; background:#f6f8fc; }
    .stickers__catalog img { width:42px; height:42px; object-fit:contain; }
    .stickers__editor { margin-top:12px; padding-top:10px; border-top:1px solid #eef0f6; }
    .stickers__subhead button { border:0; background:transparent; color:#526fa8; cursor:pointer; font-size:11px; }
    .stickers__slot { display:grid; grid-template-columns:1fr 36px 75px; align-items:center; gap:8px; margin-top:6px; }
    .stickers__slot input { width:32px; height:25px; padding:0; border:0; background:transparent; cursor:pointer; }
    .stickers__slot code { font-size:10px; color:#8490a1; }
    .stickers__editor p,.stickers__empty { margin:9px 0 0; color:#9098a6; font-size:10px; line-height:1.5; }
    .stickers__editor pre { max-height:95px; margin:5px 0 0; padding:6px; overflow:auto; border-radius:5px; background:#f5f7fb; color:#687386; font-size:9px; white-space:pre-wrap; overflow-wrap:anywhere; }
  `],
})
export class StickerDemoPanelComponent implements OnInit, OnDestroy {
  @Input({required: true}) doc!: BlockCraftDoc
  protected readonly presets = STICKER_PRESETS
  protected readonly selectedId = signal<string | null>(null)
  protected readonly selectedProps = signal<StickerBlockProps | null>(null)
  private readonly subscriptions = new Subscription()

  ngOnInit(): void {
    this.subscriptions.add(this.doc.selection.selectionChange$.subscribe(() => this.refresh()))
    this.subscriptions.add(this.doc.onMetaUpdate$.subscribe(() => this.refresh()))
    this.refresh()
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }

  protected preview(id: string, version: number): string {
    return renderStickerDataUrl(id, version, null) ?? ''
  }

  protected presetOf(props: StickerBlockProps) {
    return getStickerPreset(props.presetId, props.presetVersion)
  }

  protected colorSlots(props: StickerBlockProps): {key: string; value: string}[] {
    const preset = this.presetOf(props)
    return preset ? Object.entries(preset.colors).map(([key, value]) => ({
      key, value: props.colors?.[key] ?? value,
    })) : []
  }

  protected serialized(): string {
    const props = this.selectedProps()
    return props ? JSON.stringify({
      presetId: props.presetId,
      presetVersion: props.presetVersion,
      ...(props.colors ? {colors: props.colors} : {}),
    }, null, 2) : ''
  }

  protected insert(id: string, version: number): void {
    if (this.doc.isReadonly) return
    const target = resolveContentInsertionTarget(this.doc, 'sticker')
    if (!target) {
      this.doc.messageService.warn('当前没有可插入贴纸的位置')
      return
    }
    const snapshot = this.doc.schemas.createSnapshot('sticker', [id, undefined, version])
    const inserted = this.doc.crud.insertBlocks(target.parentId!, target.getIndexOfParent() + 1, [snapshot])
    if (inserted.length) {
      this.selectedId.set(inserted[0].id)
      this.doc.selection.selectOrSetCursorAtBlock(inserted[0], true)
      this.refresh()
    }
  }

  protected changeColor(slot: string, event: Event): void {
    const props = this.selectedProps()
    const preset = props && this.presetOf(props)
    const id = this.selectedId()
    if (!preset || !id || this.doc.isReadonly) return
    const value = (event.target as HTMLInputElement).value
    const colors = setStickerColor(preset, props.colors, slot, value)
    this.doc.crud.updateBlockProps(id, {colors: Object.keys(colors).length ? colors : null})
    this.refresh()
  }

  protected reset(): void {
    const id = this.selectedId()
    if (!id || this.doc.isReadonly) return
    this.doc.crud.updateBlockProps(id, {colors: null})
    this.refresh()
  }

  private refresh(): void {
    const selectionId = this.doc.selection.value?.head.blockId
    const selected = selectionId ? this.getSticker(selectionId) : null
    const retained = this.selectedId() ? this.getSticker(this.selectedId()!) : null
    const block = selected ?? retained
    this.selectedId.set(block?.id ?? null)
    this.selectedProps.set(block ? {...block.props as StickerBlockProps} : null)
  }

  private getSticker(id: string): BlockCraft.BlockComponent | null {
    try {
      const block = this.doc.getBlockById(id)
      return block?.flavour === 'sticker' ? block : null
    } catch {
      return null
    }
  }
}
