import {CollectionViewer, DataSource, SelectionChange} from '@angular/cdk/collections';
import {FlatTreeControl, TreeControl} from '@angular/cdk/tree';
import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {BehaviorSubject, merge, Observable, of} from 'rxjs';
import {delay, map, tap} from 'rxjs/operators';
import {NzTreeViewModule} from "ng-zorro-antd/tree-view";
import {NzIconModule} from "ng-zorro-antd/icon";
import {NgIf, NgTemplateOutlet} from "@angular/common";
import {MatIconModule} from "@angular/material/icon";
import {RouterLink, RouterLinkActive} from "@angular/router";
import {MenuItemData} from "../../types";

function getChildren(node: MenuItemData): Observable<MenuItemData[]> {
  return of([
    {
      id: Date.now() + Math.random() + '',
      name: '文件夹',
      type: 'folder' as const,
      level: node.level + 1,
      docCount: 1,
      hasChild: true
    },
    {
      id: Date.now() + Math.random() + '',
      name: '文档' + Math.random().toFixed(2),
      type: 'doc' as const,
      level: node.level + 1,
      hasChild: false
    }
  ]).pipe(delay(100));
}

class DynamicDatasource implements DataSource<MenuItemData> {
  private flattenedData: BehaviorSubject<MenuItemData[]>;
  private childrenLoadedSet = new Set<MenuItemData>();

  constructor(private treeControl: TreeControl<MenuItemData>, initData: MenuItemData[]) {
    this.flattenedData = new BehaviorSubject<MenuItemData[]>(initData);
    treeControl.dataNodes = initData;
  }

  connect(collectionViewer: CollectionViewer): Observable<MenuItemData[]> {
    const changes = [
      collectionViewer.viewChange,
      this.treeControl.expansionModel.changed.pipe(tap(change => this.handleExpansionChange(change))),
      this.flattenedData.asObservable()
    ];
    return merge(...changes).pipe(map(() => this.expandFlattenedNodes(this.flattenedData.getValue())));
  }

  expandFlattenedNodes(nodes: MenuItemData[]): MenuItemData[] {
    const treeControl = this.treeControl;
    const results: MenuItemData[] = [];
    const currentExpand: boolean[] = [];
    currentExpand[0] = true;

    nodes.forEach(node => {
      let expand = true;
      for (let i = 0; i <= treeControl.getLevel(node); i++) {
        expand = expand && currentExpand[i];
      }
      if (expand) {
        results.push(node);
      }
      if (treeControl.isExpandable(node)) {
        currentExpand[treeControl.getLevel(node) + 1] = treeControl.isExpanded(node);
      }
    });
    return results;
  }

  handleExpansionChange(change: SelectionChange<MenuItemData>): void {
    if (change.added) {
      change.added.forEach(node => this.loadChildren(node));
    }
  }

  loadChildren(node: MenuItemData): void {
    if (this.childrenLoadedSet.has(node)) {
      return;
    }
    node.loading = true;
    getChildren(node).subscribe(children => {
      node.loading = false;
      const flattenedData = this.flattenedData.getValue();
      const index = flattenedData.indexOf(node);
      if (index !== -1) {
        flattenedData.splice(index + 1, 0, ...children);
        this.childrenLoadedSet.add(node);
      }
      this.flattenedData.next(flattenedData);
    });
  }

  disconnect(): void {
    this.flattenedData.complete();
  }
}

@Component({
  selector: 'menu-tree',
  templateUrl: './menu-tree.html',
  styleUrls: ['./menu-tree.scss'],
  standalone: true,
  imports: [
    NzTreeViewModule,
    NzIconModule,
    NgIf,
    MatIconModule,
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MenuTreeComponent {
  private _treeData: MenuItemData[] = [];
  @Input({required: true})
  set treeData(v: MenuItemData[]) {
    this._treeData = v;
    this.dataSource = new DynamicDatasource(this.treeControl, this.treeData);
  }

  get treeData() {
    return this._treeData;
  }

  treeControl = new FlatTreeControl<MenuItemData>(
    node => node.level,
    node => !!node.expandable
  );

  dataSource!: DynamicDatasource

  constructor() {
  }

  expandable = (_: number, node: MenuItemData): boolean => !!node.expandable;
}
