// import { bundledLanguagesInfo, codeToHast } from 'shiki';
import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {CodeBlockSchema} from "../../../blocks";
import {HastUtils} from "../../utils";
import {DeltaInsert} from "blockflow-editor";
import {HtmlAST} from "../../types";
import {deltaToString} from "../../../global";

export const codeBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'pre',
  fromMatch: o => o.node.flavour === 'code',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const code = HastUtils.querySelector(o.node, 'code');
      if (!code) {
        return;
      }

      const codeText =
        code.children.length === 1 && code.children[0].type === 'text'
          ? code.children[0]
          : {...code, tagName: 'div'};
      let codeLang = Array.isArray(code.properties?.["className"])
        ? code.properties["className"].find(
          className =>
            typeof className === 'string' && className.startsWith('code-')
        )
        : undefined;
      codeLang =
        typeof codeLang === 'string'
          ? codeLang.replace('code-', '')
          : undefined;

      const {walkerContext, deltaConverter} = context;
      walkerContext
        .openNode(
          CodeBlockSchema.createSnapshot(deltaConverter.astToDelta(codeText, {
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
