import {Component, ElementRef, QueryList, ViewChild} from "@angular/core";
import {ContextmenuCreator, IContextMenuItem} from "../contextmenu";
import {take} from "rxjs";
import {NzTableFilterFn, NzTableFilterList, NzTableModule, NzTableSortFn, NzTableSortOrder} from "ng-zorro-antd/table";
import {Overlay} from "@angular/cdk/overlay";
import {MatIconModule} from "@angular/material/icon";
import {DatePipe, NgForOf, NgIf} from "@angular/common";
import {NzDropDownModule} from "ng-zorro-antd/dropdown";

interface DataItem {
  id: string;
  name: string;
  lastModified: number;
  creator: {
    name: string;
    id: string;
  }
  type: 'doc' | 'table';
  favourite: boolean;
  folder?: {
    id: string;
    name: string;
  }
}

interface ColumnItem {
  name: string;
  sortOrder: NzTableSortOrder | null;
  sortFn: NzTableSortFn<DataItem> | null;
  listOfFilter: NzTableFilterList;
  filterFn: NzTableFilterFn<DataItem> | null;
  width?: string;
}

@Component({
  selector: 'table-menu',
  templateUrl: 'table-menu.html',
  styleUrls: ['./table-menu.scss'],
  imports: [
    NzTableModule,
    MatIconModule,
    DatePipe,
    NgForOf,
    NgIf,
    NzDropDownModule
  ],
  standalone: true
})
export class TableMenuComponent {
  constructor(
    private overlay: Overlay,
  ) {
  }

  @ViewChild('th1', {read: ElementRef}) th1!: ElementRef;
  @ViewChild('th2', {read: ElementRef}) th2!: ElementRef;
  @ViewChild('th3', {read: ElementRef}) th3!: ElementRef;

  setOfCheckedId = new Set<string>();

  updateCheckedSet(id: string, checked: boolean): void {
    if (checked) {
      this.setOfCheckedId.add(id);
    } else {
      this.setOfCheckedId.delete(id);
    }
  }

  onItemChecked(id: string, checked: boolean): void {
    this.updateCheckedSet(id, checked);
  }

  listOfData: DataItem[] =
    new Array(100).fill(
      {
        id: '1',
        name: '文档1',
        lastModified: 1630512000000,
        creator: {
          name: '张三',
          id: '1',
        },
        type: 'doc',
        favourite: true,
        folder: {
          id: '1',
          name: '文件夹1',
        }
      })

  tableItemContextmenu: IContextMenuItem[] = [
    {
      icon: 'bf_fenxiang',
      label: '分享',
    },
    {
      icon: 'bf_lianjie',
      label: '复制链接',
    },
    {
      line: true
    },
    {
      icon: 'bf_gongzuoyaodian',
      label: '添加到我关注的',
    },
    {
      icon: 'bf_shoucang',
      label: '收藏',
    },
  ]

  trackByName(_: number, item: ColumnItem): string {
    return item.name;
  }

  onItemClick(event: Event, item: DataItem) {
    const target = event.target as HTMLElement
    const cr = new ContextmenuCreator(this.overlay, {target, items: this.tableItemContextmenu})
    cr.contextmenu.instance.itemClick.pipe(take(1)).subscribe((item) => {
      cr.dispose()
    })
  }

  onTableChange(e: MouseEvent, type: 'type' | 'creator' | 'recentType', value: string) {
    console.log(e, type, value)
    const text = (e.target as HTMLElement).textContent
    switch (type) {
      case 'type':
        this.th1.nativeElement.textContent = text
        break;
      case 'creator':
        this.th2.nativeElement.textContent = text
        break;
      case 'recentType':
        this.th3.nativeElement.textContent = text
        break;
    }
  }

  onFavourite(item: DataItem) {
  }
}
