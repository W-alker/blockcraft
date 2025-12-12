import {generateId, LinkPreviewData, NoEditableBlockNative} from "../../framework";
import {BlockNodeType} from "../../framework";
import {BookMarkBlockComponent} from "./book-mark.block";
import {IBlockSchemaOptions} from "../../framework";

export interface BookmarkBlockModel extends NoEditableBlockNative {
  flavour: 'bookmark',
  nodeType: BlockNodeType.void,
  props: {
    url: string
  } & Partial<LinkPreviewData>
}

export const BookmarkBlockSchema: IBlockSchemaOptions<BookmarkBlockModel> = {
  flavour: 'bookmark',
  nodeType: BlockNodeType.void,
  component: BookMarkBlockComponent,
  createSnapshot: (url) => {
    return {
      id: generateId(),
      flavour: 'bookmark',
      nodeType: BlockNodeType.void,
      props: {
        url,
      },
      meta: {},
      children: []
    }
  },
  metadata: {
    version: 1,
    label: "网页卡片",
    svgIcon: "bc_shuqian",
    icon: "bc_icon bc_shuqian"
  }
}

declare global {
  namespace BlockCraft {
    interface IBlockComponents {
      bookmark: BookMarkBlockComponent
    }

    interface IBlockCreateParameters {
      bookmark: [string]
    }
  }
}
