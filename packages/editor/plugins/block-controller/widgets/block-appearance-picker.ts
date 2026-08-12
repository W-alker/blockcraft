import {ChangeDetectionStrategy, Component, Input} from '@angular/core'
import {
  BUILTIN_BG_COLOR_LIST,
  ColorGroup,
  ColorPickerComponent,
} from '../../../components'
import {BlockNodeType} from '../../../framework'

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
  @Input({required: true})
  doc!: BlockCraft.Doc

  private _block!: BlockCraft.BlockComponent

  @Input({required: true})
  set block(block: BlockCraft.BlockComponent) {
    this._block = block
    this.colorGroups = block.nodeType === BlockNodeType.editable
      ? [BACKGROUND_COLOR_GROUP, BORDER_COLOR_GROUP]
      : []
    this.activeColors = {
      backColor: block.nodeType === BlockNodeType.editable
        ? this.normalizeActiveColor(block.props.backColor)
        : null,
      borderColor: block.nodeType === BlockNodeType.editable
        ? this.normalizeActiveColor(block.props.borderColor)
        : null,
    }
  }

  get block(): BlockCraft.BlockComponent {
    return this._block
  }

  colorGroups: ColorGroup[] = [BACKGROUND_COLOR_GROUP]

  activeColors: Record<BlockAppearanceColorType, string | null> = {
    backColor: null,
    borderColor: null,
  }

  onColorPicked(event: {type: string; color: string | null}) {
    if (event.type !== 'backColor' && event.type !== 'borderColor') return
    if (this._block.nodeType !== BlockNodeType.editable) return
    if (!this.isWritable()) return

    const color = this.normalizePersistedColor(event.color)
    try {
      this._block.updateProps({[event.type]: color})
    } catch (error) {
      this.doc.logger?.warn('blockAppearanceUpdateError: ', error)
      return
    }
    this.activeColors = {...this.activeColors, [event.type]: color}
  }

  private isWritable(): boolean {
    if (!this._block || !this.doc) return false
    try {
      if (this.doc.getBlockById(this._block.id) !== this._block) return false
      const readonlyManager = this.doc.readonlyManager
      return !(
        readonlyManager?.isReadonly(this._block) ?? this._block.isReadonly
      ) && !(readonlyManager?.containsReadonly(this._block) ?? false)
    } catch {
      return false
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
