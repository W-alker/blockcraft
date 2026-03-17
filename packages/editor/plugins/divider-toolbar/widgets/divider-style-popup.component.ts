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
    { key: 'tape', label: '贴纸胶带', icon: 'bc_jiaodai bc_icon' }
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

  colors = ['#F44336', '#FF9800', '#FFCCBC', '#004D40', '#00796B', '#4CAF50', '#3F51B5', '#FFC107', '#42A5F5', '#F48FB1', '#B39DDB'];

  selectedStyle = 'solid';
  lineStyles = ['solid', 'dashed', 'dotted', 'double'];

  ngOnInit() {
    this.activeSize = this.dividerBlock.props.size ?? 'medium';
    this.selectedStyle = this.dividerBlock.props.style ?? 'solid';
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

  closePopup() {
    // emit close event or hide component
  }
}
