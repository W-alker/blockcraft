import {genUniqueID, SchemaStore} from "@core";
import {
  BulletListSchema, DividerSchema,
  HeadingFourSchema,
  HeadingOneSchema,
  HeadingThreeSchema,
  HeadingTwoSchema,
  ImageSchema, OrderedListSchema,
  ParagraphSchema, TodoListSchema
} from "@blocks";
import {CalloutSchema} from "@blocks/callout";
import {BlockFlowContextmenu, GlobalConfig} from "@editor";
import {
  BlockControllerPlugin,
  BlockTransformPlugin,
  FloatTextToolbarPlugin,
  MentionPlugin
} from "../../../../blockflow/src/plugins";
const schemaStore = new SchemaStore([ParagraphSchema, HeadingOneSchema, HeadingTwoSchema, HeadingThreeSchema, HeadingFourSchema,
  ImageSchema, BulletListSchema, OrderedListSchema, TodoListSchema, CalloutSchema, DividerSchema])

const mentionRequest = async (keyword: string) => {
  const len = Math.floor(Math.random() * 10)
  const list = Array.from({length: len}).map(() => ({
    id: genUniqueID(),
    name: keyword + Math.floor(Math.random() * 10000).toString().slice(0, 4)
  }))

  return {
    list
  }
}

export const EDITOR_CONFIG: GlobalConfig = {
  rootId: 'root-demo',
  schemas: schemaStore,
  // lazyload: {
  //   pageSize: 10,
  //   requester: async (page) => {
  //     const start = (page - 1) * this.config.lazyload!.pageSize
  //         return {
  //             totalCount: this.modelLength,
  //             data: this.model.slice(start, start + this.config.lazyload!.pageSize)
  //         }
  //   }
  // }
  plugins: [new FloatTextToolbarPlugin(), new BlockControllerPlugin(BlockFlowContextmenu), new MentionPlugin(mentionRequest), new BlockTransformPlugin()]
}
