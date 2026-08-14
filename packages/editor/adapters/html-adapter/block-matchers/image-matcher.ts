import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {HastUtils} from "../../utils";
import {ImageBlockSchema} from "../../../blocks";
import {FetchUtils, getFilenameFromContentDisposition} from "../../../global";

const toPositiveNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

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
      const figure = o.parent && HastUtils.isElement(o.parent.node)
        ? o.parent.node
        : null;
      const imageURL =
        typeof image?.properties["src"] === 'string' ? image.properties["src"] : '';

      if (!imageURL || !FetchUtils.fetchable(imageURL)) return

      const width = image.properties['width'] || image.properties['dataWidth']
      const wr =
        toPositiveNumber(image.properties['dataBcWr']) ??
        toPositiveNumber(image.properties['data-bc-wr']) ??
        toPositiveNumber(figure?.properties?.['dataBcWr']) ??
        toPositiveNumber(figure?.properties?.['data-bc-wr']);
      const ar =
        toPositiveNumber(image.properties['dataBcAr']) ??
        toPositiveNumber(image.properties['data-bc-ar']) ??
        toPositiveNumber(figure?.properties?.['dataBcAr']) ??
        toPositiveNumber(figure?.properties?.['data-bc-ar']);

      try {
        const res = await FetchUtils.fetchImage(imageURL, undefined);
        if (!res || res.status !== 200) {
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

        const snapshot = wr !== undefined
          ? ImageBlockSchema.createSnapshot(url)
          : ImageBlockSchema.createSnapshot(url, toPositiveNumber(width));
        if (wr !== undefined) {
          snapshot.props = {
            ...snapshot.props,
            wr,
            ...(ar !== undefined ? {ar} : {}),
          };
        }
        const placementSource = figure?.properties?.['dataImagePlacementMode']
          ? figure
          : image;
        if (placementSource.properties?.['dataImagePlacementMode'] === 'absolute') {
          const toFinite = (value: unknown): number => {
            const parsed = typeof value === 'number' ? value : Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
          };
          snapshot.props = {
            ...snapshot.props,
            position: {
              x: toFinite(placementSource.properties['dataImagePlacementX']),
              y: toFinite(placementSource.properties['dataImagePlacementY']),
            },
            ...(placementSource.properties['dataImagePlacementLayer'] === 'under'
              ? {placementLayer: 'under' as const}
              : {}),
          };
        }
        walkerContext.openNode(snapshot).closeNode();
        walkerContext.skipAllChildren();
      } catch (e) {

      }

    },
  },
  fromBlockSnapshot: {
    enter: async (o, context) => {
      const {walkerContext} = context;

      const wr = toPositiveNumber(o.node.props['wr']);
      const ar = toPositiveNumber(o.node.props['ar']);
      const width = toPositiveNumber(o.node.props['width']);
      const height = toPositiveNumber(o.node.props['height']);
      const sizeProperties = wr !== undefined
        ? {
            dataBcWr: wr,
            ...(ar !== undefined ? {dataBcAr: ar} : {}),
            style: [
              `width: ${wr}%`,
              ...(ar !== undefined ? [`aspect-ratio: ${ar}`] : []),
            ].join('; ') + ';',
          }
        : {
            ...(width !== undefined ? {width} : {}),
            ...(height !== undefined ? {height} : {}),
          };
      const position = o.node.props['position'] &&
          typeof o.node.props['position'] === 'object'
        ? o.node.props['position'] as {x?: number; y?: number}
        : null

      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'figure',
            properties: {
              dataBcBlock: 'image',
              ...(position ? {
                dataImagePlacementMode: 'absolute',
                dataImagePlacementX: position.x ?? 0,
                dataImagePlacementY: position.y ?? 0,
                dataImagePlacementLayer:
                  o.node.props['placementLayer'] === 'under' ? 'under' : 'over',
              } : {}),
            },
            children: [{
              type: 'element',
              tagName: 'img',
              properties: {
                src: o.node.props['src'] as string,
                ...sizeProperties,
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
