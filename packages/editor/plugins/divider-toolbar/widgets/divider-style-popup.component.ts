import { ChangeDetectionStrategy, Component, HostBinding, HostListener, Input } from '@angular/core';
import { NgClass, NgForOf, NgIf } from "@angular/common";
import { FormsModule } from "@angular/forms";

@Component({
  selector: 'app-divider-style-popup',
  templateUrl: './divider-style-popup.component.html',
  standalone: true,
  imports: [
    NgForOf,
    NgClass,
    FormsModule,
    NgIf
  ],
  styleUrls: ['./divider-style-popup.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DividerStylePopupComponent {
  @Input()
  dividerBlock!: BlockCraft.IBlockComponents['divider']

  activeTab = 'line';
  activeSize = 'medium';

  styleTabs = [
    { key: 'line', label: '线型', icon: 'bc_icon bc_tubiao_xianduan-leixing' },
    { key: 'tape', label: '贴纸胶带', icon: 'bc_jiaodai bc_icon' },
    { key: 'text', label: '文字装订', icon: 'bc_icon bc_wenben' }
  ];

  sizeList = [
    { key: 'thin', label: '迷你' },
    { key: 'small', label: '薄型' },
    { key: 'medium', label: '常规' },
    { key: 'large', label: '厚' }
  ];

  tapePatterns = [
    'tape-dot-black', 'tape-grid-pattern', 'tape-regular-lines', 'tape-gradient-blocks', 'tape-gray-lines'
  ];

  colors = ['#EF5350', '#FFA726', '#FFCA28', '#66BB6A', '#26A69A', '#42A5F5', '#7E57C2', '#EC407A', '#8D6E63', '#90A4AE', '#29B6F6'];

  selectedStyle = 'solid';
  lineStyles = ['solid', 'dashed', 'dotted', 'double'];

  activeAlign: 'left' | 'center' | 'right' = 'center';
  labelText = '';
  activeColor = '';

  alignList: { key: 'left' | 'center' | 'right'; icon: string; label: string }[] = [
    { key: 'left', icon: 'bc_icon bc_zuoduiqi', label: '左对齐' },
    { key: 'center', icon: 'bc_icon bc_juzhongduiqi', label: '居中' },
    { key: 'right', icon: 'bc_icon bc_youduiqi', label: '右对齐' }
  ];

  ngOnInit() {
    this.activeSize = this.dividerBlock.props.size ?? 'medium';
    this.selectedStyle = this.dividerBlock.props.style ?? 'solid';
    this.activeAlign = this.dividerBlock.props.align ?? 'center';
    this.labelText = this.dividerBlock.props.text ?? '';
    this.activeColor = this.dividerBlock.props.color ?? '';
    if (this.selectedStyle.startsWith('tape')) {
      this.activeTab = 'tape';
    }
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    event.preventDefault()
  }

  setTab(tab: string) {
    this.activeTab = tab;
  }

  selectStyle(style: string) {
    this.selectedStyle = style;
    this.dividerBlock.updateProps({
      style: style
    })
  }

  selectSize(size: string) {
    this.activeSize = size;
    this.dividerBlock.updateProps({
      size: size
    })
  }

  setText(value: string) {
    this.labelText = value;
    this.dividerBlock.updateProps({ text: value })
  }

  setAlign(align: 'left' | 'center' | 'right') {
    this.activeAlign = align;
    this.dividerBlock.updateProps({ align })
  }

  setColor(color: string) {
    this.activeColor = color;
    this.dividerBlock.updateProps({ color })
  }

  closePopup() {
    // emit close event or hide component
  }
}
