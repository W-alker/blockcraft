import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {CodeBlockSchema} from "../../../blocks";
import {HastUtils} from "../../utils";
import {deltaToString} from "../../../global";
import {DeltaInsert} from "../../../framework";
import {Text} from "hast";

export const codeBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'pre',
  fromMatch: o => o.node.flavour === 'code',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }

      const {walkerContext} = context;

      const depth = (walkerContext.currentNode()?.props.depth || -1) + 1

      if (o.parent?.node.type === 'element' && !['td'].includes(o.parent.node.tagName)) {
        walkerContext.closeNode()
      }

      const codeSpans = HastUtils.flatNodes(o.node, () => true);

      // @ts-ignore
      const text = (codeSpans['children'] as Array<Text>).reduce((text, span) => text + span.value, '')

      const codeBlock = CodeBlockSchema.createSnapshot(text)
      codeBlock.props.depth = depth

      // TODO 优化代码语句分行
      walkerContext
        .openNode(codeBlock, 'children')
        .closeNode()
      walkerContext.skipAllChildren()
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
