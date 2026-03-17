import {MarkdownAST} from "../type";
import {BlockMarkdownAdapterMatcher} from "../block-adapter";
import {FetchUtils, getFilenameFromContentDisposition} from "../../../global";
import {ImageBlockSchema} from "../../../blocks";


const isImageNode = (node: MarkdownAST) => node.type === 'image';

export const imageBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  toMatch: o => isImageNode(o.node),
  fromMatch: o => o.node.flavour === 'image',
  toBlockSnapshot: {
    enter: async (o, context) => {
      const {walkerContext, fileManager} = context;

      const imageURL = 'url' in o.node ? o.node.url : '';
      if (!imageURL || !fileManager || !FetchUtils.fetchable(imageURL)) return
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

        walkerContext
          .openNode(
            ImageBlockSchema.createSnapshot(url),
            'children'
          )
          .closeNode();
        walkerContext.skipAllChildren();

      } catch (e) {

      }

    },
  },
  fromBlockSnapshot: {
    enter: async (o, context) => {
      const {walkerContext} = context;
      walkerContext
        .openNode(
          {
            type: 'paragraph',
            children: [],
          },
          'children'
        )
        .openNode(
          {
            type: 'image',
            url: o.node.props['src'] as string,
            title: o.node.props['src'] as string,
          },
          'children'
        )
        .closeNode()
        .closeNode();
    },
  },
};

