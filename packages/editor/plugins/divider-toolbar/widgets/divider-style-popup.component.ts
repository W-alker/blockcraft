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
  activeLength: DividerLength = 'long';
  activeThickness: DividerThickness = 'regular';
  activeOpacity = 100;

  styleTabs = [
    { key: 'line', label: '线型' },
    { key: 'tape', label: '贴纸胶带' },
    { key: 'edge', label: '花边' },
    { key: 'text', label: '文字装订' }
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

  activeAlign: 'left' | 'center' | 'right' = 'center';
  labelText = '';
  activeColor = '';
  activeLineColor = '';
  activeFontSize = 14;
  activeFontWeight: 'normal' | 'bold' = 'normal';
  activeFontStyle: 'normal' | 'italic' = 'normal';
  activeLetterSpacing = 0;

  fontSizeList = [10, 12, 14, 16, 18, 20, 24, 28, 32];
  letterSpacingList = [0, 0.5, 1, 1.5, 2, 3, 4, 6, 8];

  alignList: { key: 'left' | 'center' | 'right'; icon: string; label: string }[] = [
    { key: 'left', icon: 'bc_zuoduiqi', label: '左对齐' },
    { key: 'center', icon: 'bc_juzhongduiqi', label: '居中' },
    { key: 'right', icon: 'bc_youduiqi', label: '右对齐' }
  ];

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
    this.activeAlign = this.dividerBlock.props.align ?? 'center';
    this.labelText = this.dividerBlock.props.text ?? '';
    this.activeColor = this.dividerBlock.props.color ?? '';
    this.activeLineColor = this.dividerBlock.props.lineColor ?? '';
    this.activeFontSize = this.normalizeFontSize(this.dividerBlock.props.fontSize);
    this.activeFontWeight = this.dividerBlock.props.fontWeight === 'bold' ? 'bold' : 'normal';
    this.activeFontStyle = this.dividerBlock.props.fontStyle === 'italic' ? 'italic' : 'normal';
    this.activeLetterSpacing = this.normalizeLetterSpacing(this.dividerBlock.props.letterSpacing);
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

  setText(value: string) {
    this.labelText = value;
    this.dividerBlock.updateProps({ text: value })
  }

  setAlign(align: string | number) {
    if (align !== 'left' && align !== 'center' && align !== 'right') return;
    this.activeAlign = align;
    this.dividerBlock.updateProps({ align })
  }

  setColor(color: string | null) {
    this.activeColor = color ?? '';
    this.dividerBlock.updateProps({ color: this.activeColor })
  }

  setLineColor(lineColor: string | null) {
    this.activeLineColor = lineColor ?? '';
    this.dividerBlock.updateProps({ lineColor: this.activeLineColor })
  }

  setFontSize(fontSize: number) {
    this.activeFontSize = this.normalizeFontSize(fontSize);
    this.dividerBlock.updateProps({ fontSize: this.activeFontSize })
  }

  toggleFontWeight() {
    this.activeFontWeight = this.activeFontWeight === 'bold' ? 'normal' : 'bold';
    this.dividerBlock.updateProps({ fontWeight: this.activeFontWeight })
  }

  toggleFontStyle() {
    this.activeFontStyle = this.activeFontStyle === 'italic' ? 'normal' : 'italic';
    this.dividerBlock.updateProps({ fontStyle: this.activeFontStyle })
  }

  setLetterSpacing(letterSpacing: number) {
    this.activeLetterSpacing = this.normalizeLetterSpacing(letterSpacing);
    this.dividerBlock.updateProps({ letterSpacing: this.activeLetterSpacing })
  }

  private normalizeFontSize(value: unknown): number {
    const fontSize = Number(value);
    return Number.isFinite(fontSize) ? Math.min(32, Math.max(10, fontSize)) : 14;
  }

  private normalizeLetterSpacing(value: unknown): number {
    const letterSpacing = Number(value);
    return Number.isFinite(letterSpacing) ? Math.min(8, Math.max(0, letterSpacing)) : 0;
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
        return 'long';
    }
  }

  private resolveThickness(thickness: unknown, legacySize: unknown): DividerThickness {
    if (thickness === 'thin' || thickness === 'regular' || thickness === 'thick') {
      return thickness;
    }
    if (legacySize === 'thin' || legacySize === 'small') {
      return 'thin';
    }
    return legacySize === 'large' ? 'thick' : 'regular';
  }

  closePopup() {
    // emit close event or hide component
  }
}
