import {MarkdownAST} from "../type";
import {Code} from "mdast";
import {BlockMarkdownAdapterMatcher} from "../block-adapter";
import {BlockNodeType, DeltaInsert, generateId} from "../../../framework";
import {deltaToString} from "../../../global";
import {LANGUAGE_LIST} from "../../../blocks/code-block/const";

const isCodeNode = (node: MarkdownAST): node is Code => node.type === 'code';

export const codeBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  toMatch: o => isCodeNode(o.node),
  fromMatch: o => o.node.flavour === 'code',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!isCodeNode(o.node)) {
        return;
      }
      const {walkerContext} = context;
      const codeLang = o.node.lang || 'PlainText';
      walkerContext
        .openNode(
          {
            id: generateId(),
            nodeType: BlockNodeType.editable,
            flavour: 'code',
            props: {
              lang: LANGUAGE_LIST.find(v => v.toLowerCase() === codeLang.toLowerCase()) || 'PlainText',
            },
            children: [{
              insert: o.node.value,
            }],
            meta: {}
          },
          'children'
        )
        .closeNode();
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext} = context;
      walkerContext
        .openNode(
          {
            type: 'code',
            lang: null,
            meta: null,
            value: deltaToString(o.node.children as DeltaInsert[]),
          },
          'children'
        )
        .closeNode();
    },
  },
};

