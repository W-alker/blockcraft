import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {HastUtils} from "../../utils";
import {ImageBlockSchema} from "../../../blocks";
import {FetchUtils, getFilenameFromContentDisposition} from "../../../global";

export const imageBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'img',
  fromMatch: o => o.node.flavour === ImageBlockSchema.flavour,
  toBlockSnapshot: {
    enter: async (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const {walkerContext, fileManager} = context;

      const curNode = walkerContext.currentNode()
      if (curNode?.nodeType === 'editable' || curNode?.nodeType === 'void') {
        walkerContext.closeNode();
      }

      const image = o.node;
      const imageURL =
        typeof image?.properties["src"] === 'string' ? image.properties["src"] : '';

      if (!imageURL || !FetchUtils.fetchable(imageURL)) return
      try {
        const res = await FetchUtils.fetchImage(imageURL, undefined);
        if (!res) {
          return;
        }

        const name =
          getFilenameFromContentDisposition(
            res.headers.get('Content-Disposition') ?? ''
          ) ??
          (imageURL.split('/').at(-1) ?? 'image') +
          '.' +
          (res.headers.get('Content-Type')?.split('/').at(-1) ?? 'png');
        const file = new File([await res.blob()], name, {
          type: res.headers.get('Content-Type') ?? '',
        });

        const url = await fileManager.uploadImg(file)

        walkerContext.openNode(ImageBlockSchema.createSnapshot(url)).closeNode();
        walkerContext.skipAllChildren();
      } catch (e) {

      }

    },
  },
  fromBlockSnapshot: {
    enter: async (o, context) => {
      const {walkerContext} = context;

      const widthStyle = {
        width: `${o.node.props["width"]}px`,
        height: `${o.node.props["height"]}px`,
      }

      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'figure',
            properties: {},
            children: [{
              type: 'element',
              tagName: 'img',
              properties: {
                src: o.node.props['src'] as string,
                ...widthStyle,
              },
              children: [],
            }],
          },
          'children'
        )
        .closeNode();
    },
  },
};


