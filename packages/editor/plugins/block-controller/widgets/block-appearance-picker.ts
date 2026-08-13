import {ChangeDetectionStrategy, Component, Input} from '@angular/core'
import {
  BUILTIN_BG_COLOR_LIST,
  ColorGroup,
  ColorPickerComponent,
} from '../../../components'
import {BlockNodeType} from '../../../framework'
import {getSelectionCoveredBlockIds} from '../../../framework/modules/selection/covered-blocks'

type BlockAppearanceColorType = 'backColor' | 'borderColor'

const BACKGROUND_COLOR_GROUP: ColorGroup = {
  title: '背景颜色',
  type: 'backColor',
  list: BUILTIN_BG_COLOR_LIST,
  templateUse: 'fill',
}

const BORDER_COLOR_GROUP: ColorGroup = {
  title: '边框颜色',
  type: 'borderColor',
  list: BUILTIN_BG_COLOR_LIST,
  templateUse: 'fill',
}

@Component({
  selector: 'bc-block-appearance-picker',
  template: `
    <bc-color-picker
      [activeColors]="activeColors"
      [colorGroups]="colorGroups"
      (colorPicked)="onColorPicked($event)" />
  `,
  imports: [ColorPickerComponent],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    :host ::ng-deep .bc-color-group__wrapper {
      box-sizing: border-box;
      width: 100%;
      background: transparent;
      box-shadow: none;
      border-radius: 0;
    }

    :host ::ng-deep .bc-color-group-list {
      box-sizing: border-box;
      width: 100%;
      padding: 2px;
      gap: 0;
      justify-content: space-between;
      flex-wrap: nowrap;
    }
  `],
})
export class BlockAppearancePickerComponent {
  private _doc!: BlockCraft.Doc

  @Input({required: true})
  set doc(doc: BlockCraft.Doc) {
    this._doc = doc
    this.refreshState()
  }

  get doc(): BlockCraft.Doc {
    return this._doc
  }

  private _block!: BlockCraft.BlockComponent

  @Input({required: true})
  set block(block: BlockCraft.BlockComponent) {
    this._block = block
    this.refreshState()
  }

  get block(): BlockCraft.BlockComponent {
    return this._block
  }

  private _targetBlockIds: string[] = []

  @Input()
  set targetBlockIds(blockIds: readonly string[] | null | undefined) {
    this._targetBlockIds = [...new Set((blockIds ?? []).filter(Boolean))]
    this.refreshState()
  }

  get targetBlockIds(): readonly string[] {
    return this._targetBlockIds
  }

  private _selectionBlockIds: string[] = []

  @Input()
  set selectionBlockIds(blockIds: readonly string[] | null | undefined) {
    this._selectionBlockIds = [...new Set((blockIds ?? []).filter(Boolean))]
  }

  get selectionBlockIds(): readonly string[] {
    return this._selectionBlockIds
  }

  colorGroups: ColorGroup[] = []

  activeColors: Record<BlockAppearanceColorType, string | null> = {
    backColor: null,
    borderColor: null,
  }

  onColorPicked(event: {type: string; color: string | null}) {
    if (event.type !== 'backColor' && event.type !== 'borderColor') return
    const targetIds = this.resolveWritableTargetIds()
    if (!targetIds.length) return

    const color = this.normalizePersistedColor(event.color)
    try {
      if (this.getConfiguredSelectionBlockIds().length === 1) {
        this._block.updateProps({[event.type]: color})
      } else {
        this._doc.crud.transact(() => {
          targetIds.forEach(blockId => {
            this._doc.crud.updateBlockProps(blockId, {[event.type]: color})
          })
        })
      }
    } catch (error) {
      this.doc.logger?.warn('blockAppearanceUpdateError: ', error)
      return
    }
    this.activeColors = {...this.activeColors, [event.type]: color}
  }

  private refreshState(): void {
    if (!this._block) return
    const targetIds = this.getConfiguredTargetIds()
    const eligible = targetIds.length > 0 && targetIds.every(id => this.isEditableBlock(id))
    this.colorGroups = eligible
      ? [BACKGROUND_COLOR_GROUP, BORDER_COLOR_GROUP]
      : []
    this.activeColors = eligible
      ? {
        backColor: this.resolveCommonColor(targetIds, 'backColor'),
        borderColor: this.resolveCommonColor(targetIds, 'borderColor'),
      }
      : {backColor: null, borderColor: null}
  }

  private getConfiguredTargetIds(): string[] {
    if (this._targetBlockIds.length) return [...this._targetBlockIds]
    return this._block?.id ? [this._block.id] : []
  }

  private getConfiguredSelectionBlockIds(): string[] {
    if (this._selectionBlockIds.length) return [...this._selectionBlockIds]
    return this.getConfiguredTargetIds()
  }

  private resolveWritableTargetIds(): string[] {
    if (!this._block || !this._doc || this._doc.isReadonly) return []
    const targetIds = this.getConfiguredTargetIds()
    if (!targetIds.length || !targetIds.every(id => this.isEditableBlock(id))) return []

    try {
      if (this._doc.getBlockById(this._block.id) !== this._block) return []
      const selectionBlockIds = this.getConfiguredSelectionBlockIds()
      if (selectionBlockIds.length > 1) {
        if (!this.matchesCurrentSelection(selectionBlockIds)) return []
        if (targetIds.some(id => !selectionBlockIds.includes(id))) return []
        if (!targetIds.every(id => this._doc.model.exists(id))) return []
      } else if (targetIds.length !== 1 || targetIds[0] !== this._block.id) {
        return []
      }

      const readonlyManager = this._doc.readonlyManager
      if (readonlyManager) {
        if (targetIds.some(id =>
          readonlyManager.isReadonly(id) || readonlyManager.containsReadonly(id)
        )) return []
      } else if (targetIds.length !== 1 || this._block.isReadonly) {
        return []
      }
      return targetIds
    } catch {
      return []
    }
  }

  private matchesCurrentSelection(targetIds: readonly string[]): boolean {
    const selection = this._doc.selection.value
    if (!selection || selection.isInSameBlock) return false
    const selectedIds = getSelectionCoveredBlockIds(selection, this._doc)
    return selectedIds.length === targetIds.length
      && selectedIds.every((id, index) => id === targetIds[index])
  }

  private isEditableBlock(blockId: string): boolean {
    if (!this._doc) return blockId === this._block?.id
      && this._block.nodeType === BlockNodeType.editable
    const nodeType = this._doc.model?.getNodeType?.(blockId)
    if (nodeType !== undefined) return nodeType === BlockNodeType.editable
    try {
      return this._doc.getBlockById(blockId).nodeType === BlockNodeType.editable
    } catch {
      return false
    }
  }

  private resolveCommonColor(
    targetIds: readonly string[],
    type: BlockAppearanceColorType,
  ): string | null {
    let common: string | null | undefined
    for (const blockId of targetIds) {
      const color = this.normalizeActiveColor(this.readBlockProps(blockId)?.[type])
      if (common === undefined) {
        common = color
      } else if (common !== color) {
        return null
      }
    }
    return common ?? null
  }

  private readBlockProps(blockId: string): Record<string, unknown> | undefined {
    const modelProps = this._doc?.model?.getProps?.(blockId)
    if (modelProps) return modelProps
    if (blockId === this._block?.id) return this._block.props as Record<string, unknown>
    try {
      return this._doc.getBlockById(blockId).props as Record<string, unknown>
    } catch {
      return undefined
    }
  }

  private normalizePersistedColor(color: string | null): string | null {
    if (typeof color !== 'string') return null
    const normalized = color.trim()
    return normalized && normalized.toLowerCase() !== 'transparent'
      ? normalized
      : null
  }

  private normalizeActiveColor(color: unknown): string | null {
    return typeof color === 'string' && color.toLowerCase() !== 'transparent'
      ? color
      : null
  }
}
