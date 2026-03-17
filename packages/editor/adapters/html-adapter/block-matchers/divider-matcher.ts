import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {HastUtils} from "../../utils";
import {DividerBlockSchema} from "../../../blocks";

export const dividerBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'hr',
  fromMatch: o => o.node.flavour === DividerBlockSchema.flavour,
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const { walkerContext } = context;
      walkerContext
        .openNode(
          DividerBlockSchema.createSnapshot(),
          'children'
        )
        .closeNode();
    },
  },
  fromBlockSnapshot: {
    enter: (_, context) => {
      const { walkerContext } = context;
      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'hr',
            properties: {},
            children: [],
          },
          'children'
        )
        .closeNode();
    },
  },
};

