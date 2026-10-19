import {ChangeDetectionStrategy, Component, Input} from '@angular/core'
import {
  BcFloatToolbarComponent,
  BcFloatToolbarItemComponent,
  BcOverlayTriggerDirective,
  BUILTIN_BG_COLOR_LIST,
  BUILTIN_COLOR_LIST,
  ColorGroup,
  ColorPickerComponent,
} from '../../../components'

@Component({
  selector: 'callout-block-toolbar',
  standalone: true,
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    BcOverlayTriggerDirective,
    ColorPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <bc-float-toolbar>
      <bc-float-toolbar-item icon="bc_sepan" [bcOverlayTrigger]="colorPicker" />
    </bc-float-toolbar>
    <ng-template #colorPicker>
      <bc-color-picker (colorPicked)="onColorPicked($event)" [gapAround]="8"
                       [activeColors]="activeColors" [colorGroups]="colorGroups" />
    </ng-template>
  `,
})
export class CalloutBlockToolbar {
  @Input() containerBlock!: BlockCraft.IBlockComponents['callout']

  readonly colorGroups: ColorGroup[] = [
    {title: '字体颜色', type: 'color', list: BUILTIN_COLOR_LIST, templateUse: 'font'},
    {title: '背景颜色', type: 'backColor', list: BUILTIN_BG_COLOR_LIST, templateUse: 'fill'},
    {title: '边框颜色', type: 'borderColor', list: BUILTIN_BG_COLOR_LIST, templateUse: 'fill'},
  ]
  activeColors: Record<string, string | null> = {}

  ngOnInit() {
    const {color, backColor, borderColor} = this.containerBlock.props
    this.activeColors = {
      ...(typeof color === 'string' ? {color} : {}),
      backColor: backColor ?? null,
      borderColor: borderColor ?? null,
    }
  }

  onColorPicked(event: {type: string; color: string | null}) {
    if (!this.colorGroups.some(group => group.type === event.type)) return
    this.containerBlock.updateProps({[event.type]: event.color})
    this.activeColors = {...this.activeColors, [event.type]: event.color}
  }
}
