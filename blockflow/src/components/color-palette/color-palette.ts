import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output
} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {BgColorPaletteList, ColorPaletteList} from "./const";

@Component({
  selector: 'color-palette',
  templateUrl: './color-palette.html',
  styleUrls: ['./color-palette.scss'],
  standalone: true,
  imports: [
    NgForOf,
    NgIf
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ColorPalette {
  @Input()
  activeColor: string | null = ''

  @Input()
  activeBgColor: string | null = ''

  @Input()
  activeEdgeColor: string | null = ''

  // @Input() hiddenList: ('c' | 'bc' | 'ec')[] = []
  @Input() showEdgeColor = false

  @Output() colorChange = new EventEmitter<{type: 'c' | 'bc' | 'ec', value: string | null}>()
  @Output() close = new EventEmitter<boolean>()

  protected colorList = ColorPaletteList
  protected bgColorList = BgColorPaletteList
  protected edgeColorList = ColorPaletteList.slice(1)

  constructor(
    private cdr: ChangeDetectorRef
  ) {
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(e: Event) {
    e.stopPropagation()
    e.preventDefault()
  }

  pickColor(type: 'c' | 'bc' | 'ec', value: string | null) {
    type === 'ec' && (this.activeEdgeColor = value)
    type === 'c' && (this.activeColor = value)
    type === 'bc' && (this.activeBgColor = value)
    this.cdr.markForCheck()
    this.colorChange.emit({type, value})
  }

  ngOnDestroy() {
    this.close.emit(true)
  }
}
