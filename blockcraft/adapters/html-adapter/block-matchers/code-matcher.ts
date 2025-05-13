import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {CodeBlockSchema} from "../../../blocks";
import {HastUtils} from "../../utils";
import {DeltaInsert} from "blockflow-editor";
import {deltaToString} from "../../../global";

export const codeBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'pre',
  fromMatch: o => o.node.flavour === 'code',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      // const code = HastUtils.querySelector(o.node, 'code');
      // if (!code) {
      //   return;
      // }

      const {walkerContext, deltaConverter} = context;
      if (o.parent?.node.type === 'element' &&
        !['td'].includes(o.parent.node.tagName)) {
        walkerContext.closeNode()
      }

      // const codeText =
      //   code.children.length === 1 && code.children[0].type === 'text'
      //     ? code.children[0]
      //     : {...code, tagName: 'div'};

      walkerContext
        .openNode(
          CodeBlockSchema.createSnapshot(deltaConverter.astToDelta(o.node, {
            trim: false,
            pre: true,
          })),
          'children'
        )
        .closeNode();
      walkerContext.skipAllChildren();
    },
  },
  fromBlockSnapshot: {
    enter: async (o, context) => {
      const {walkerContext} = context;
      const delta = o.node.children as DeltaInsert[];
      walkerContext.openNode({
        type: 'element',
        tagName: 'pre',
        properties: {},
        children: [
          {
            type: 'element',
            tagName: 'span',
            properties: {},
            children: [
              {
                type: 'text',
                value: deltaToString(delta),
              }
            ]
          }
        ],
      }, 'children').closeNode();
    },
  },
};
