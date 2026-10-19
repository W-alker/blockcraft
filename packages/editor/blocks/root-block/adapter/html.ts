import {BlockHtmlAdapterMatcher} from "../../../adapters/html-adapter/block-adapter";
import {HastUtils} from "../../../adapters/utils";
import {
  rootTypographyFromHtml,
  rootTypographyToHtmlProperties,
} from '../../../adapters/html-adapter/typography';

export const rootBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o =>
    HastUtils.isElement(o.node) && ['html', 'body', 'header'].includes(o.node.tagName),
  fromMatch: o => o.node.flavour === 'root',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const {walkerContext} = context;
      if (o.node.tagName === 'html' || o.node.tagName === 'body') {
        // Paragraph matching runs before this matcher and can open a paragraph
        // for direct body text. Resolve the document root from the stack so
        // root typography is not accidentally written to (or skipped because
        // of) that temporary editable node. Body values naturally override
        // any earlier values imported from <html>.
        const root = walkerContext.stack
          .map(entry => entry.node)
          .find(node => node.flavour === 'root')
        if (root) Object.assign(root.props, rootTypographyFromHtml(o.node))
        return
      }
      if (o.node.tagName === 'header') {
        walkerContext.skipAllChildren();
      }
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext} = context;
      // const htmlRootDocContext =
      //   walkerContext.getGlobalContext('hast:html-root-doc');
      // const isRootDoc = htmlRootDocContext ?? true;
      // if (!isRootDoc) {
      //   return;
      // }

      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'html',
            properties: {},
            children: [],
          },
          'children'
        )
        .openNode(
          {
            type: 'element',
            tagName: 'head',
            properties: {},
            children: [],
          },
          'children'
        )
        .openNode(
          {
            type: 'element',
            tagName: 'meta',
            properties: {
              charset: 'UTF-8',
            },
            children: [],
          }
        )
        .closeNode()
        // .openNode(
        //   {
        //     type: 'element',
        //     tagName: 'style',
        //     properties: {},
        //     children: [],
        //   },
        //   'children'
        // )
        // .openNode(
        //   {
        //     type: 'text',
        //     value: `
        //     input[type='checkbox'] {
        //       display: none;
        //     }
        //     label:before {
        //       background: rgb(30, 150, 235);
        //       border-radius: 3px;
        //       height: 16px;
        //       width: 16px;
        //       display: inline-block;
        //       cursor: pointer;
        //     }
        //     input[type='checkbox'] + label:before {
        //       content: '';
        //       background: rgb(30, 150, 235);
        //       color: #fff;
        //       font-size: 16px;
        //       line-height: 16px;
        //       text-align: center;
        //     }
        //     input[type='checkbox']:checked + label:before {
        //       content: '✓';
        //     }
        //     `.replace(/\s\s+/g, ''),
        //   },
        //   'children'
        // )
        // .closeNode()
        .closeNode()
        .openNode(
          {
            type: 'element',
            tagName: 'body',
            properties: rootTypographyToHtmlProperties(o.node.props),
            children: [],
          },
          'children'
        )
        .openNode(
          {
            type: 'element',
            tagName: 'div',
            properties: {
              style: 'width: 70vw; margin: 60px auto;',
            },
            children: [],
          },
          'children'
        )
    },
    leave: (_, context) => {
      const {walkerContext} = context;
      // const htmlRootDocContext =
      //   walkerContext.getGlobalContext('hast:html-root-doc');
      // const isRootDoc = htmlRootDocContext ?? true;
      // if (!isRootDoc) {
      //   return;
      // }
      walkerContext.closeNode().closeNode().closeNode();
    },
  },
};
