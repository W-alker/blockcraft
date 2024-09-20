import {Component, ViewChild} from '@angular/core';
import {
  BlockControllerPlugin,
  BlockflowBinding, BlockFlowContextmenu,
  BlockFlowEditor, BlockModel, BlockTransformPlugin, BulletListSchema, DividerSchema, FloatTextToolbarPlugin,
  GlobalConfig, HeadingFourSchema,
  HeadingOneSchema, HeadingThreeSchema, HeadingTwoSchema, IBlockModel,
  IEditableBlockModel, ImageSchema, MentionPlugin, OrderedListSchema,
  ParagraphSchema,
  SchemaStore, TodoListSchema,
} from "@blockflow";
import {genUniqueID} from "@core/utils";
import {CalloutSchema} from "@blocks/callout";
import {MatIconRegistry} from "@angular/material/icon";
import {DomSanitizer} from "@angular/platform-browser";
import {Router} from "@angular/router";

interface MenuItem {
  title: string;
  icon: string;
  iconType: 'icon' | 'svg';
  type: 'page' | 'space' | 'doc' | 'folder';
  children?: MenuItem[];
  route?: string;
}

const defaultLibrary: MenuItem[] = [
  {
    title: '主页',
    icon: 'bf_erjidaohang_shouye',
    iconType: 'icon',
    type: 'page',
    route: 'home'
  },
  {
    title: '我的空间',
    icon: 'bf_wodekongjian',
    iconType: 'icon',
    type: 'space',
    children: []
  },
  {
    title: '共享空间',
    icon: 'bf_gongxiangkongjian-color',
    iconType: 'svg',
    type: 'space',
  },
  {
    title: '知识库',
    icon: 'bf_zhishiku-color',
    iconType: 'svg',
    type: 'page',
    route: 'knowledge'
  },
  {
    title: '收藏',
    icon: 'bf_shoucang',
    iconType: 'icon',
    type: 'page',
    route: 'favourite'
  }
]

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {

  protected defaultLibrary = defaultLibrary;
  protected customLibrary: MenuItem[] = [];
  protected searchValue = '';

  constructor(
    private router: Router,
  ) {
  }

  ngOnDestroy() {
  }

  onMenuClick(item: MenuItem) {
    switch (item.type) {
      case 'page':
        // this.router.navigate([item.route]);
        break;
    }
  }

}
