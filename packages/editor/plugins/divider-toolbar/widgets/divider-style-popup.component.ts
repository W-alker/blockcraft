import { ChangeDetectionStrategy, Component, HostListener, Input } from '@angular/core';
import { NgClass, NgForOf, NgIf } from "@angular/common";
import { FormsModule } from "@angular/forms";
import {
  CsButtonComponent,
  CsColorPickerComponent,
  CsInputDirective,
  CsSegmentedComponent,
  CsSegmentedItemComponent,
  CsSliderComponent,
} from "@cses/ui";
import type { CsSegmentedOptions, CsSliderValue } from "@cses/ui";
import { DividerLength, DividerThickness } from '../../../blocks/divider-block';

@Component({
  selector: 'app-divider-style-popup',
  templateUrl: './divider-style-popup.component.html',
  standalone: true,
  imports: [
    NgForOf,
    NgClass,
    FormsModule,
    NgIf,
    CsButtonComponent,
    CsColorPickerComponent,
    CsInputDirective,
    CsSegmentedComponent,
    CsSegmentedItemComponent,
    CsSliderComponent,
  ],
  styleUrls: ['./divider-style-popup.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DividerStylePopupComponent {
  @Input()
  dividerBlock!: BlockCraft.IBlockComponents['divider']

  activeTab = 'line';
  activeLength: DividerLength = 'full';
  activeThickness: DividerThickness = 'thin';
  activeOpacity = 100;

  styleTabs = [
    { key: 'line', label: '线型' },
    { key: 'tape', label: '贴纸胶带' },
    { key: 'edge', label: '花边' }
  ];
  styleTabOptions: CsSegmentedOptions = this.styleTabs.map(({ key, label }) => ({
    value: key,
    label,
  }));

  lengthList: { key: DividerLength; label: string }[] = [
    { key: 'short', label: '短' },
    { key: 'medium', label: '中' },
    { key: 'long', label: '长' },
    { key: 'full', label: '通栏' }
  ];
  lengthOptions: CsSegmentedOptions = this.lengthList.map(({ key, label }) => ({ value: key, label }));

  thicknessList: { key: DividerThickness; label: string }[] = [
    { key: 'thin', label: '细' },
    { key: 'regular', label: '常规' },
    { key: 'thick', label: '粗' }
  ];
  thicknessOptions: CsSegmentedOptions = this.thicknessList.map(({ key, label }) => ({ value: key, label }));

  tapePatterns = [
    'tape-dot-black', 'tape-grid-pattern', 'tape-regular-lines', 'tape-gradient-blocks', 'tape-gray-lines'
  ];

  edgePatterns = [
    { key: 'edge-grass', label: '枝叶' },
    { key: 'edge-flower', label: '花簇' },
    { key: 'edge-vine', label: '藤蔓' },
    { key: 'edge-daisy', label: '雏菊' },
    { key: 'edge-stars', label: '星芒' },
    { key: 'edge-berries', label: '浆果' },
  ];

  selectedStyle = 'solid';
  lineStyles = [
    { key: 'solid', label: '实线' },
    { key: 'dashed', label: '虚线' },
    { key: 'dotted', label: '点线' },
    { key: 'double', label: '双线' },
    { key: 'fade', label: '渐隐' },
    { key: 'wave', label: '波浪' },
    { key: 'zigzag', label: '锯齿' },
    { key: 'sketch', label: '手绘' },
    { key: 'triple-dot', label: '三点' },
    { key: 'diamond', label: '菱形' },
  ];

  activeLineColor = '';

  ngOnInit() {
    this.activeLength = this.resolveLength(
      this.dividerBlock.props.length,
      this.dividerBlock.props.size,
    );
    this.activeThickness = this.resolveThickness(
      this.dividerBlock.props.thickness,
      this.dividerBlock.props.size,
    );
    this.activeOpacity = this.normalizeOpacityPercent(this.dividerBlock.props.opacity);
    this.selectedStyle = this.dividerBlock.props.style ?? 'solid';
    this.activeLineColor = this.dividerBlock.props.lineColor ?? '';
    if (this.selectedStyle.startsWith('tape')) {
      this.activeTab = 'tape';
    } else if (this.selectedStyle.startsWith('edge')) {
      this.activeTab = 'edge';
    }
  }

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent) {
    event.stopPropagation();
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    event.stopPropagation();
    const target = event.target;
    if (target instanceof Element && target.closest(
      'button, input, textarea, label.cs-segmented-item, [role="radio"], [role="slider"]',
    )) {
      return;
    }
    event.preventDefault()
  }

  setTab(tab: string | number) {
    this.activeTab = String(tab);
  }

  selectStyle(style: string) {
    this.selectedStyle = style;
    this.dividerBlock.updateProps({
      style: style
    })
  }

  selectLength(length: DividerLength) {
    this.activeLength = length;
    this.dividerBlock.updateProps({ length })
  }

  selectThickness(thickness: DividerThickness) {
    this.activeThickness = thickness;
    this.dividerBlock.updateProps({ thickness })
  }

  setOpacity(opacityPercent: CsSliderValue) {
    const value = Array.isArray(opacityPercent) ? opacityPercent[0] : opacityPercent;
    this.activeOpacity = this.normalizeOpacityPercent(Number(value) / 100);
    this.dividerBlock.updateProps({ opacity: this.activeOpacity / 100 })
  }

  setLineColor(lineColor: string | null) {
    this.activeLineColor = lineColor ?? '';
    this.dividerBlock.updateProps({ lineColor: this.activeLineColor })
  }

  private normalizeOpacityPercent(value: unknown): number {
    const opacity = Number(value);
    const normalized = Number.isFinite(opacity) ? Math.min(1, Math.max(0.1, opacity)) : 1;
    return Math.round(normalized * 100);
  }

  private resolveLength(length: unknown, legacySize: unknown): DividerLength {
    if (length === 'short' || length === 'medium' || length === 'long' || length === 'full') {
      return length;
    }

    switch (legacySize) {
      case 'thin':
        return 'short';
      case 'small':
        return 'medium';
      case 'large':
        return 'full';
      default:
        return legacySize == null ? 'full' : 'long';
    }
  }

  private resolveThickness(thickness: unknown, legacySize: unknown): DividerThickness {
    if (thickness === 'thin' || thickness === 'regular' || thickness === 'thick') {
      return thickness;
    }
    if (legacySize === 'thin' || legacySize === 'small') {
      return 'thin';
    }
    return legacySize == null ? 'thin' : legacySize === 'large' ? 'thick' : 'regular';
  }

  closePopup() {
    // emit close event or hide component
  }
}
