import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core'
import {
  BUNDLED_EDITOR_BLOCK_MATERIAL_GROUPS,
  BlockCraftDoc,
  BundledBlockMaterial,
} from '@ccc/blockcraft'
import {Subscription} from 'rxjs'
import {TEMPLATE_REGION_META_KEY} from '../core/template-region'

const materials: readonly BundledBlockMaterial[] = [
  ...new Map(
    BUNDLED_EDITOR_BLOCK_MATERIAL_GROUPS
      .flatMap(group => group.items)
      .map(material => [material.flavour, material]),
  ).values(),
]

@Component({
  selector: 'template-region-inspector',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="region-inspector">
      @if (placeholderBlockId(); as blockId) {
        <section class="region-section">
          <div class="region-section__head">
            <span>常驻提示</span>
            <label class="region-switch">
              <input
                type="checkbox"
                [checked]="placeholderAlways()"
                (change)="togglePlaceholderMode($event)">
              始终显示
            </label>
          </div>
          <input
            class="region-input"
            type="text"
            aria-label="常驻提示文字"
            placeholder="输入空内容时的提示"
            [value]="placeholderText()"
            (input)="updatePlaceholder($event)">
          <p class="region-help">仅在内容语义为空时显示，不写入正文。</p>
        </section>
      }

      @if (regionId(); as selectedRegionId) {
        <section class="region-section">
          <div class="region-section__head">
            <span>区域可添加内容</span>
            <button type="button" (click)="allowAll()">全部允许</button>
          </div>
          <div class="region-options">
            @for (material of availableMaterials; track material.flavour) {
              <label class="region-option">
                <input
                  type="checkbox"
                  [checked]="isAllowed(material.flavour)"
                  (change)="toggleAllowed(material.flavour, $event)">
                <span>{{ material.label }}</span>
              </label>
            }
          </div>
          <p class="region-help">
            这里只能收窄框架 Schema；表格单元格、分栏列和高亮块的底层限制不会被取消。
          </p>
        </section>
      } @else if (!placeholderBlockId()) {
        <p class="region-empty">选中文本块可设置提示；选中“内容区域”可限制允许添加的块。</p>
      }
    </div>
  `,
  styles: [`
    :host{ display:block; flex:none; border-bottom:1px solid #eef0f6; background:#fff }
    .region-inspector{ display:flex; flex-direction:column; gap:14px; max-height:310px; padding:12px 14px; overflow:auto }
    .region-section{ display:flex; flex-direction:column; gap:8px }
    .region-section + .region-section{ padding-top:12px; border-top:1px solid #eef0f6 }
    .region-section__head{ display:flex; align-items:center; justify-content:space-between; gap:8px; color:#4b5263; font-size:12px; font-weight:600 }
    .region-section__head button{ padding:0; border:0; background:transparent; color:#4857e2; font:inherit; font-weight:400; cursor:pointer }
    .region-switch{ display:inline-flex; align-items:center; gap:4px; color:#747b8d; font-size:11px; font-weight:400; cursor:pointer }
    .region-switch input,.region-option input{ accent-color:#4857e2 }
    .region-input{ box-sizing:border-box; width:100%; height:30px; padding:0 9px; border:1px solid #dfe2ea; border-radius:6px; color:#343947; font-size:12px; outline:none }
    .region-input:focus{ border-color:#6c78e8; box-shadow:0 0 0 2px rgba(72,87,226,.1) }
    .region-options{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px 8px }
    .region-option{ display:flex; align-items:center; min-width:0; gap:5px; color:#606779; font-size:11px; cursor:pointer }
    .region-option span{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
    .region-help,.region-empty{ margin:0; color:#999fac; font-size:10px; line-height:1.45 }
    .region-empty{ padding:2px 0 }
  `],
})
export class TemplateRegionInspectorComponent implements OnInit, OnDestroy {
  @Input({required: true}) doc!: BlockCraftDoc

  protected readonly availableMaterials = materials
  protected readonly placeholderBlockId = signal<string | null>(null)
  protected readonly regionId = signal<string | null>(null)
  protected readonly placeholderText = signal('')
  protected readonly placeholderAlways = signal(false)
  private readonly allowed = signal<ReadonlySet<string>>(new Set())
  private readonly subscriptions = new Subscription()

  ngOnInit(): void {
    this.subscriptions.add(
      this.doc.selection.selectionChange$.subscribe(() =>
        this.refreshSelection(),
      ),
    )
    this.subscriptions.add(
      this.doc.onMetaUpdate$.subscribe(event => {
        const watched = new Set([
          this.placeholderBlockId(),
          this.regionId(),
        ])
        if (event.transactions.some(transaction =>
          watched.has(transaction.blockId),
        )) {
          this.refreshValues()
        }
      }),
    )
    this.refreshSelection()
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }

  protected updatePlaceholder(event: Event): void {
    const block = this.block(this.placeholderBlockId())
    if (!block) return
    const text = (event.target as HTMLInputElement).value
    block.updateMeta({plh: text})
    this.placeholderText.set(text)
  }

  protected togglePlaceholderMode(event: Event): void {
    const block = this.block(this.placeholderBlockId())
    if (!block) return
    const always = (event.target as HTMLInputElement).checked
    block.updateMeta({plhMode: always ? 'always' : null})
    this.placeholderAlways.set(always)
  }

  protected isAllowed(flavour: BlockCraft.BlockFlavour): boolean {
    return this.allowed().has(flavour)
  }

  protected toggleAllowed(
    flavour: BlockCraft.BlockFlavour,
    event: Event,
  ): void {
    const checked = (event.target as HTMLInputElement).checked
    const region = this.block(this.regionId())
    if (!region) return
    if (!checked) {
      const containsFlavour = this.doc.model
        .getChildrenIds(region.id)
        .some(id => this.doc.model.getFlavour(id) === flavour)
      if (containsFlavour) {
        ;(event.target as HTMLInputElement).checked = true
        this.doc.messageService.warn('请先移除区域内该类型的现有内容')
        return
      }
    }

    const next = new Set(this.allowed())
    if (checked) next.add(flavour)
    else next.delete(flavour)
    this.writeAllowed(region, next)
  }

  protected allowAll(): void {
    const region = this.block(this.regionId())
    if (!region) return
    region.updateMeta({incl: null, excl: null})
    this.refreshValues()
  }

  private writeAllowed(
    region: BlockCraft.BlockComponent,
    next: Set<string>,
  ): void {
    const all = this.availableMaterials.every(material =>
      next.has(material.flavour),
    )
    region.updateMeta({
      incl: all ? null : [...next],
      excl: null,
    })
    this.allowed.set(next)
  }

  private refreshSelection(): void {
    const selection = this.doc.selection.value
    const selectedId = selection?.head.blockId ?? null
    if (!selectedId) {
      let targetRemoved = false
      const placeholderId = this.placeholderBlockId()
      const regionId = this.regionId()
      if (placeholderId && !this.block(placeholderId)) {
        this.placeholderBlockId.set(null)
        targetRemoved = true
      }
      if (regionId && !this.block(regionId)) {
        this.regionId.set(null)
        targetRemoved = true
      }
      if (targetRemoved) this.refreshValues()
      return
    }

    const selected = this.block(selectedId)
    this.placeholderBlockId.set(
      selected && this.supportsPlaceholder(selected)
        ? selected.id
        : null,
    )

    const path = selectedId ? this.doc.model.getPath(selectedId) : null
    const regionId = [...(path ?? [])].reverse().find(id => {
      const block = this.block(id)
      return block?.flavour === 'render-unit' &&
        block.meta[TEMPLATE_REGION_META_KEY] === true
    }) ?? null
    this.regionId.set(regionId)
    if (!this.placeholderBlockId() && regionId) {
      this.placeholderBlockId.set(
        this.findRegionPlaceholderBlockId(regionId),
      )
    }
    this.refreshValues()
  }

  private refreshValues(): void {
    const placeholder = this.block(this.placeholderBlockId())
    this.placeholderText.set(
      typeof placeholder?.meta['plh'] === 'string'
        ? placeholder.meta['plh']
        : '',
    )
    this.placeholderAlways.set(
      placeholder?.meta['plhMode'] === 'always',
    )

    const region = this.block(this.regionId())
    const next = new Set<string>()
    if (region) {
      this.availableMaterials.forEach(material => {
        if (this.doc.canInsertChild(region.id, material.flavour)) {
          next.add(material.flavour)
        }
      })
    }
    this.allowed.set(next)
  }

  private supportsPlaceholder(block: BlockCraft.BlockComponent): boolean {
    return this.doc.isEditable(block)
  }

  private findRegionPlaceholderBlockId(regionId: string): string | null {
    const pending = [...this.doc.model.getChildrenIds(regionId)]
    while (pending.length) {
      const id = pending.shift()!
      const block = this.block(id)
      if (
        block &&
        this.doc.isEditable(block) &&
        typeof block.meta['plh'] === 'string'
      ) {
        return block.id
      }
      pending.push(...this.doc.model.getChildrenIds(id))
    }
    return null
  }

  private block(id: string | null): BlockCraft.BlockComponent | null {
    if (!id) return null
    try {
      return this.doc.getBlockById(id)
    } catch {
      return null
    }
  }
}
