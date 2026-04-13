import type {Element, Properties} from 'hast';
import {BlockHtmlAdapterMatcher} from "../block-adapter";
import {HastUtils} from "../../utils";
import {BlockNodeType, generateId, IBlockSnapshot} from "../../../framework";
import {SimpleRecord} from "../../../global";

type MediaFlavour = 'video' | 'audio';
type MediaSourceType = 'link' | 'local' | 'embed';

const MEDIA_FLAVOURS: MediaFlavour[] = ['video', 'audio'];
const MEDIA_SOURCE_TYPES: MediaSourceType[] = ['link', 'local', 'embed'];

const isMediaElement = (node: Element) =>
  MEDIA_FLAVOURS.includes(node.tagName as MediaFlavour);

const getStringProperty = (
  node: Element | undefined,
  ...keys: string[]
): string => {
  if (!node) return '';

  for (const key of keys) {
    const value = node.properties?.[key];
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0];
    }
  }

  return '';
};

const getNumberProperty = (
  node: Element | undefined,
  ...keys: string[]
): number | undefined => {
  const value = getStringProperty(node, ...keys);
  if (!value) return undefined;

  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
};

const getSourceChild = (node: Element) =>
  node.children.find(
    child => child.type === 'element' && child.tagName === 'source'
  ) as Element | undefined;

const getMediaSourceType = (node: Element): MediaSourceType => {
  const rawValue = getStringProperty(node, 'dataSourceType', 'data-source-type');
  return MEDIA_SOURCE_TYPES.includes(rawValue as MediaSourceType)
    ? (rawValue as MediaSourceType)
    : 'link';
};

const buildMediaSnapshot = (
  flavour: MediaFlavour,
  node: Element
): IBlockSnapshot | null => {
  const sourceNode = getSourceChild(node);
  const url = getStringProperty(node, 'src') || getStringProperty(sourceNode, 'src');
  if (!url) return null;

  const name =
    getStringProperty(node, 'dataName', 'data-name', 'title', 'ariaLabel', 'aria-label') ||
    getStringProperty(sourceNode, 'title');
  const size = getNumberProperty(node, 'dataSize', 'data-size');
  const sourceType = getMediaSourceType(node);

  const props: SimpleRecord = {
    url,
    sourceType,
  };

  if (name) {
    props['name'] = name;
  }
  if (size !== undefined) {
    props['size'] = size;
  }

  if (flavour === 'video') {
    const width = getNumberProperty(node, 'width', 'dataWidth', 'data-width');
    const poster = getStringProperty(node, 'poster');
    const type =
      getStringProperty(node, 'dataType', 'data-type') ||
      getStringProperty(sourceNode, 'type');

    if (width !== undefined) {
      props['width'] = width;
    }
    if (poster) {
      props['poster'] = poster;
    }
    if (type) {
      props['type'] = type;
    }
  }

  return {
    id: generateId(),
    flavour,
    nodeType: BlockNodeType.void,
    props,
    meta: {},
    children: [],
  };
};

const createMediaElement = (o: {node: IBlockSnapshot, flavour: MediaFlavour}): Element | null => {
  const url = typeof o.node.props['url'] === 'string' ? o.node.props['url'] : '';
  if (!url) return null;

  const properties: Properties = {
    controls: true,
    preload: 'metadata',
    src: url,
  };

  const name = typeof o.node.props['name'] === 'string' ? o.node.props['name'] : '';
  const sourceType =
    typeof o.node.props['sourceType'] === 'string' ? o.node.props['sourceType'] : '';
  const size = o.node.props['size'];

  if (name) {
    properties['title'] = name;
    properties['dataName'] = name;
  }
  if (MEDIA_SOURCE_TYPES.includes(sourceType as MediaSourceType)) {
    properties['dataSourceType'] = sourceType;
  }
  if (typeof size === 'number' && size > 0) {
    properties['dataSize'] = size;
  }

  if (o.flavour === 'video') {
    const width = o.node.props['width'];
    const poster = o.node.props['poster'];
    const type = o.node.props['type'];

    if (typeof width === 'number' && width > 0) {
      properties['width'] = width;
    }
    if (typeof poster === 'string' && poster) {
      properties['poster'] = poster;
    }
    if (typeof type === 'string' && type) {
      properties['dataType'] = type;
    }
  }

  return {
    type: 'element',
    tagName: o.flavour,
    properties,
    children: [],
  };
};

export const isMediaContainerHtmlNode = (node: Element): boolean => {
  const meaningfulChildren = node.children.filter(child => {
    if (child.type === 'text') {
      return child.value.trim().length > 0;
    }
    return child.type === 'element';
  });

  return (
    meaningfulChildren.length > 0 &&
    meaningfulChildren.every(
      child => child.type === 'element' && isMediaElement(child)
    )
  );
};

export const mediaBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o => HastUtils.isElement(o.node) && isMediaElement(o.node),
  fromMatch: o => o.node.flavour === 'video' || o.node.flavour === 'audio',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) return;

      const {walkerContext} = context;
      const currentNode = walkerContext.currentNode();
      if (currentNode?.nodeType === 'editable' || currentNode?.nodeType === 'void') {
        walkerContext.closeNode();
      }

      const snapshot = buildMediaSnapshot(o.node.tagName as MediaFlavour, o.node);
      if (!snapshot) return;

      walkerContext.openNode(snapshot, 'children').closeNode();
      walkerContext.skipAllChildren();
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      if (o.node.flavour !== 'video' && o.node.flavour !== 'audio') {
        return;
      }

      const {walkerContext} = context;
      const element = createMediaElement({
        node: o.node,
        flavour: o.node.flavour as MediaFlavour,
      });
      if (!element) return;

      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'figure',
            properties: {},
            children: [element],
          },
          'children'
        )
        .closeNode();
    },
  },
};
