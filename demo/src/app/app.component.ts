import {Component} from '@angular/core';
import {Router} from "@angular/router";
import {MenuItemData} from "../types/menu.type";
import {DocApiService} from "../services/doc-api.service";
import {lastValueFrom} from "rxjs";

const DEFAULT_MENU_TREE_DATA: MenuItemData[] = [
  {
    id: Date.now() + '',
    name: '主页',
    icon: 'bf_erjidaohang_shouye',
    iconType: 'icon',
    type: 'page',
    route: 'home',
    level: 0,
  },
  // {
  //   id: '001',
  //   name: '我的空间',
  //   icon: 'bf_wodekongjian',
  //   iconType: 'icon',
  //   type: 'space',
  //   docCount: 3,
  //   level: 0,
  //   hasChild: true,
  //   route: `space/001`
  // },
  // {
  //   id: Date.now() + '',
  //   name: '共享空间',
  //   icon: 'bf_gongxiangkongjian-color',
  //   iconType: 'svg',
  //   type: 'space',
  //   level: 0
  // },
  {
    id: Date.now() + '',
    name: '知识库',
    icon: 'bf_zhishiku-color',
    iconType: 'svg',
    type: 'page',
    route: 'knowledge',
    level: 0
  },
  {
    id: Date.now() + '',
    name: '收藏',
    icon: 'bf_shoucang',
    iconType: 'icon',
    type: 'page',
    route: 'favourite',
    level: 0
  }
];

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {

  protected defaultLibrary: MenuItemData[] = [];
  protected customLibrary: MenuItemData[] = [];
  protected searchValue = '';

  constructor(
    private router: Router,
    private service: DocApiService
  ) {
    this.getSpaceList();
  }

  ngOnDestroy() {
  }

  async getSpaceList() {
    const res = await lastValueFrom(this.service.getSpaceList());
    if (!res.isSuccess) return;
    const spaces: MenuItemData[] = res.items.map(item => ({
      icon: item.spaceType === 'shared' ? 'bf_gongxiangkongjian-color' : 'bf_wodekongjian',
      iconType: item.spaceType === 'shared' ? 'svg' : 'icon',
      type: 'space',
      level: 0,
      route: `space/${item.id}`,
      expandable: !!item.docCount,
      ...item
    }))
    DEFAULT_MENU_TREE_DATA.splice(1, 0, ...spaces.filter(item => item.spaceType !== 'custom'))
    this.defaultLibrary = DEFAULT_MENU_TREE_DATA
    this.customLibrary = spaces.filter(item => item.spaceType === 'custom')
  }

  onMenuClick(item: MenuItemData) {
    switch (item.type) {
      case 'page':
        // this.router.navigate([item.route]);
        break;
    }
  }

}
