import {BlockHtmlAdapterMatcher} from "../../../adapters/html-adapter/block-adapter";
import {encodeAdapterProps} from "../../../adapters/generic";
import {HastUtils} from "../../../adapters/utils";
import {DividerBlockSchema} from "..";
import {applyDividerAdapterProps} from './props';

const encodedProps = (properties: Record<string, unknown> | undefined) =>
  properties?.['dataBcProps'] ?? properties?.['data-bc-props'];

export const dividerBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'hr',
  fromMatch: o => o.node.flavour === DividerBlockSchema.flavour,
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const { walkerContext } = context;
      const snapshot = DividerBlockSchema.createSnapshot();
      applyDividerAdapterProps(
        snapshot.props,
        encodedProps(o.node.properties),
      );
      walkerContext
        .openNode(
          snapshot,
          'children'
        )
        .closeNode();
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const { walkerContext } = context;
      const props = encodeAdapterProps(o.node.props);
      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'hr',
            properties: props ? {dataBcProps: props} : {},
            children: [],
          },
          'children'
        )
        .closeNode();
    },
  },
};
