import {BlockHtmlAdapterMatcher} from "../../../adapters/html-adapter/block-adapter";
import {HastUtils} from "../../../adapters/utils";
import {ImageBlockSchema} from "..";
import {CaptionBlockSchema} from '../../caption-block';
import type {Element} from 'hast';
import type {HtmlAST} from '../../../adapters';
import {decodeAdapterProps} from '../../../adapters/generic';
import {imageSourceFromAdapter} from './source';

const toPositiveNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const isImageFigure = (node: HtmlAST | undefined): boolean =>
  !!node && node.type === 'element' &&
  node.tagName === 'figure' &&
  node.children.some(child =>
    child.type === 'element' && child.tagName === 'img'
  );

const imageFromFigure = (figure: Element): Element | undefined =>
  figure.children.find(child =>
    child.type === 'element' && child.tagName === 'img'
  ) as Element | undefined;

export const imageBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  priority: 100,
  consumes: true,
  toMatch: o => {
    if (isImageFigure(o.node)) return true;
    if (!HastUtils.isElement(o.node)) return false;
    if (o.node.tagName === 'figcaption') {
      return isImageFigure(o.parent?.node);
    }
    return o.node.tagName === 'img' && !isImageFigure(o.parent?.node);
  },
  fromMatch: o => o.node.flavour === ImageBlockSchema.flavour,
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const {walkerContext, deltaConverter} = context;

      if (
        o.node.tagName === 'figcaption' &&
        isImageFigure(o.parent?.node)
      ) {
        const caption = CaptionBlockSchema.createSnapshot(
          deltaConverter.astToDelta(o.node),
        );
        const props = decodeAdapterProps(
          o.node.properties?.['dataBcProps'] ??
          o.node.properties?.['data-bc-props'],
        );
        caption.props = {
          ...caption.props,
          ...props,
        } as typeof caption.props;
        walkerContext.openNode(caption, 'children').closeNode();
        walkerContext.skipAllChildren();
        return;
      }

      const curNode = walkerContext.currentNode()
      if (curNode?.nodeType === 'editable' || curNode?.nodeType === 'void') {
        walkerContext.closeNode();
      }

      const figure = isImageFigure(o.node) ? o.node as Element : null;
      const image = figure ? imageFromFigure(figure) : o.node;
      if (!image || image.tagName !== 'img') return;
      const imageURL = imageSourceFromAdapter(image?.properties["src"]);

      if (!imageURL) {
        if (figure) walkerContext.skipAllChildren();
        return;
      }

      const width = image.properties['width'] || image.properties['dataWidth']
      const height = image.properties['height'] || image.properties['dataHeight']
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

      // Keep adapter traversal deterministic and side-effect free. The mounted
      // Image Block owns browser loading, placeholder state, retry and any
      // host-specific post-insert resource workflow.
      const snapshot = wr !== undefined
        ? ImageBlockSchema.createSnapshot(imageURL)
        : ImageBlockSchema.createSnapshot(
            imageURL,
            toPositiveNumber(width),
            toPositiveNumber(height),
          );
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
      walkerContext.openNode(snapshot, 'children');
      if (figure) {
        walkerContext.setNodeContext('image-html:opened', true);
      } else {
        walkerContext.closeNode();
        walkerContext.skipAllChildren();
      }
    },
    leave: (o, context) => {
      if (
        isImageFigure(o.node) &&
        context.walkerContext.getNodeContext('image-html:opened')
      ) {
        context.walkerContext.closeNode();
      }
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
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
        .setNodeContext('image-html:opened', true);
    },
    leave: (_, context) => {
      if (context.walkerContext.getNodeContext('image-html:opened')) {
        context.walkerContext.closeNode();
      }
    },
  },
};
