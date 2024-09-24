import {Component} from "@angular/core";
import {ContextmenuCreator, IContextMenuItem} from "../contextmenu";
import {take} from "rxjs";
import {NzTableFilterFn, NzTableFilterList, NzTableModule, NzTableSortFn, NzTableSortOrder} from "ng-zorro-antd/table";
import {Overlay} from "@angular/cdk/overlay";
import {MatIconModule} from "@angular/material/icon";
import {DatePipe, NgForOf, NgIf} from "@angular/common";

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
    NgIf
  ],
  standalone: true
})
export class TableMenuComponent {
  constructor(
    private overlay: Overlay,
  ) {
  }

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

  listOfColumns: ColumnItem[] = [
    {
      name: '标题',
      sortOrder: null,
      sortFn: (a: DataItem, b: DataItem) => a.name.localeCompare(b.name),
      listOfFilter: [
        {text: '文档', value: 'doc'},
        {text: '表格', value: 'table'}
      ],
      filterFn: (list: string[], item: DataItem) => list.some(t => item.type.indexOf(t) !== -1)
    },
    {
      name: '归属',
      sortOrder: null,
      sortFn: (a: DataItem, b: DataItem) => a.creator.name.localeCompare(b.creator.name),
      listOfFilter: [
        {text: '不限归属', value: 'doc'},
        {text: '归属于我', value: 'table'}
      ],
      filterFn: (list: string[], item: DataItem) => list.some(t => item.type.indexOf(t) !== -1),
      width: '200px'
    },
    {
      name: '时间',
      sortFn: null,
      sortOrder: null,
      listOfFilter: [
        {text: 'London', value: 'London'},
        {text: 'Sidney', value: 'Sidney'}
      ],
      filterFn: null,
      width: '200px'
    }
  ];

  listOfData: DataItem[] = [
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
    },
  ];

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
}
