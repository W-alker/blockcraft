import {SpaceType} from "./space.type";

export interface MenuItemData {
  id: string;
  name: string;
  type: 'page' | 'space' | 'doc' | 'folder';
  level: number;
  expandable?: boolean;
  icon?: string;
  iconType?: 'icon' | 'svg';
  route?: string;
  docCount?: number;
  loading?: boolean;
  isShortcut?: boolean;
  spaceType?: SpaceType;
}
