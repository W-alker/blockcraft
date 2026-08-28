import type {Html, Link, Paragraph, PhrasingContent} from 'mdast';
import {BlockMarkdownAdapterMatcher} from "../../../adapters/markdown-adapter/block-adapter";
import {BlockNodeType, generateId, IBlockSnapshot} from "../../../framework";
import {MarkdownAST} from "../../../adapters/markdown-adapter/type";
import {SimpleRecord} from "../../../global";
import {
  decodeAdapterProps,
  sanitizeAdapterProps,
} from '../../../adapters/generic';

type MediaFlavour = 'video' | 'audio';
type MediaSourceType = 'link' | 'local' | 'embed';

type MediaDirective = MarkdownAST & {
  type: 'containerDirective' | 'leafDirective';
  name: 'bc-video' | 'bc-audio';
  attributes?: Record<string, string | null | undefined> | null;
  children: MarkdownAST[];
};

const LINK_TITLE_PREFIX = 'blockcraft:';
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', '3gp', 'ogv', 'mpeg', 'ts'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'aac', 'flac', 'm4a', 'wma', 'opus', 'oga', 'weba', 'mid', 'midi'];
const VIDEO_PLATFORM_PATTERNS = [
  /(?:^|\.)youtube\.com$/i,
  /(?:^|\.)youtu\.be$/i,
  /(?:^|\.)bilibili\.com$/i,
  /(?:^|\.)b23\.tv$/i,
  /(?:^|\.)vimeo\.com$/i,
  /(?:^|\.)player\.vimeo\.com$/i,
  /(?:^|\.)youku\.com$/i,
  /(?:^|\.)qq\.com$/i,
  /(?:^|\.)ixigua\.com$/i,
  /(?:^|\.)dailymotion\.com$/i,
  /(?:^|\.)tiktok\.com$/i,
  /(?:^|\.)douyin\.com$/i,
  /(?:^|\.)acfun\.cn$/i,
];

const getTextContent = (children: PhrasingContent[]): string =>
  children
    .map(child => {
      if ('value' in child && typeof child.value === 'string') {
        return child.value;
      }
      if ('children' in child) {
        return getTextContent(child.children as PhrasingContent[]);
      }
      return '';
    })
    .join('');

const getMediaTitleHint = (title: string | null | undefined): MediaFlavour | null => {
  if (!title) return null;
  const normalized = title.trim().toLowerCase();
  if (normalized === `${LINK_TITLE_PREFIX}video`) return 'video';
  if (normalized === `${LINK_TITLE_PREFIX}audio`) return 'audio';
  return null;
};

const getUrlExtension = (url: string): string => {
  try {
    const pathname = new URL(url, 'https://blockcraft.local').pathname;
    return pathname.split('.').pop()?.toLowerCase() ?? '';
  } catch {
    return '';
  }
};

const getMediaFlavourFromUrl = (url: string): MediaFlavour | null => {
  try {
    const normalized = new URL(url, 'https://blockcraft.local');
    if (VIDEO_PLATFORM_PATTERNS.some(pattern => pattern.test(normalized.hostname))) {
      return 'video';
    }
  } catch {
    // Ignore URL parse failures and fall back to extension detection.
  }

  const ext = getUrlExtension(url);
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  return null;
};

const getMeaningfulChildren = (node: Paragraph) =>
  node.children.filter(child => {
    if (child.type !== 'text') return true;
    return child.value.trim().length > 0;
  });

type MediaInfo = {
  flavour: MediaFlavour;
  url: string;
  name?: string;
  poster?: string;
  width?: number;
  sourceType?: MediaSourceType;
  type?: string;
  size?: number;
};

const getMediaInfoFromLink = (link: Link): MediaInfo | null => {
  const flavour = getMediaTitleHint(link.title) ?? getMediaFlavourFromUrl(link.url);
  if (!flavour) return null;

  const text = getTextContent(link.children).trim();
  return {
    flavour,
    url: link.url,
    name: text && text !== link.url ? text : undefined,
  };
};

const getMediaInfoFromParagraph = (node: Paragraph): MediaInfo | null => {
  const meaningfulChildren = getMeaningfulChildren(node);
  if (meaningfulChildren.length === 0) return null;

  if (meaningfulChildren.every(child => child.type === 'html')) {
    return getMediaInfoFromHtml({
      type: 'html',
      value: meaningfulChildren.map(child => child.value).join(''),
    });
  }

  if (meaningfulChildren.length !== 1) return null;

  const [child] = meaningfulChildren;
  if (child.type !== 'link') return null;

  return getMediaInfoFromLink(child);
};

const getStringAttribute = (raw: string, name: string): string => {
  const match = raw.match(
    new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i')
  );
  return match?.[1] || match?.[2] || match?.[3] || '';
};

const getNumberAttribute = (raw: string, name: string): number | undefined => {
  const value = getStringAttribute(raw, name);
  if (!value) return undefined;

  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
};

const getMediaInfoFromHtml = (node: Html): MediaInfo | null => {
  const tagMatch = node.value.match(/^\s*<(video|audio)\b([^>]*)>/i);
  if (!tagMatch) return null;

  const flavour = tagMatch[1].toLowerCase() as MediaFlavour;
  const attrSource = tagMatch[2] || '';
  const sourceUrl =
    getStringAttribute(attrSource, 'src') ||
    getStringAttribute(node.value, 'src');

  if (!sourceUrl) return null;

  const sourceType = getStringAttribute(attrSource, 'data-source-type');
  const name =
    getStringAttribute(attrSource, 'data-name') ||
    getStringAttribute(attrSource, 'title');
  const size = getNumberAttribute(attrSource, 'data-size');

  return {
    flavour,
    url: sourceUrl,
    name: name || undefined,
    size,
    sourceType:
      sourceType === 'link' || sourceType === 'local' || sourceType === 'embed'
        ? (sourceType as MediaSourceType)
        : 'link',
    poster: flavour === 'video' ? getStringAttribute(attrSource, 'poster') || undefined : undefined,
    width: flavour === 'video' ? getNumberAttribute(attrSource, 'width') : undefined,
    type:
      flavour === 'video'
        ? getStringAttribute(attrSource, 'data-type') || undefined
        : undefined,
  };
};

const getMediaInfo = (node: MarkdownAST): MediaInfo | null => {
  switch (node.type) {
    case 'paragraph':
      return getMediaInfoFromParagraph(node);
    case 'html':
      return getMediaInfoFromHtml(node);
    default:
      return null;
  }
};

const isMediaDirective = (node: MarkdownAST): node is MediaDirective =>
  (node.type === 'containerDirective' || node.type === 'leafDirective') &&
  ((node as MediaDirective).name === 'bc-video' ||
    (node as MediaDirective).name === 'bc-audio');

const createMediaSnapshot = (info: MediaInfo): IBlockSnapshot => {
  const props: SimpleRecord = {
    url: info.url,
    sourceType: info.sourceType || 'link',
  };

  if (info.name) {
    props['name'] = info.name;
  }
  if (typeof info.size === 'number') {
    props['size'] = info.size;
  }
  if (info.flavour === 'video') {
    if (typeof info.width === 'number') {
      props['width'] = info.width;
    }
    if (info.poster) {
      props['poster'] = info.poster;
    }
    if (info.type) {
      props['type'] = info.type;
    }
  }

  return {
    id: generateId(),
    flavour: info.flavour,
    nodeType: BlockNodeType.void,
    props,
    meta: {},
    children: [],
  };
};

export const isMediaMarkdownNode = (node: MarkdownAST): boolean => !!getMediaInfo(node);

export const mediaBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  priority: 200,
  consumes: true,
  toMatch: o => isMediaDirective(o.node) || isMediaMarkdownNode(o.node),
  fromMatch: o => o.node.flavour === 'video' || o.node.flavour === 'audio',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (isMediaDirective(o.node)) {
        const flavour = o.node.name === 'bc-video' ? 'video' : 'audio';
        const props = sanitizeAdapterProps(
          decodeAdapterProps(o.node.attributes?.['props'])
        );
        const url = typeof props['url'] === 'string' ? props['url'] : '';
        if (!url) {
          context.walkerContext.skipAllChildren();
          return;
        }
        context.walkerContext
          .openNode({
            id: generateId(),
            flavour,
            nodeType: BlockNodeType.void,
            props: {...props, url},
            meta: {},
            children: [],
          } as IBlockSnapshot, 'children')
          .closeNode();
        context.walkerContext.skipAllChildren();
        return;
      }
      const info = getMediaInfo(o.node);
      if (!info) return;

      context.walkerContext.openNode(createMediaSnapshot(info), 'children').closeNode();
      context.walkerContext.skipAllChildren();
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      if (o.node.flavour !== 'video' && o.node.flavour !== 'audio') {
        return;
      }

      const props = sanitizeAdapterProps(o.node.props);
      const url = typeof props['url'] === 'string' ? props['url'] : '';
      if (!url) return;

      const label =
        typeof props['name'] === 'string' && props['name'].trim()
          ? props['name']
          : url;

      context.walkerContext
        .openNode(
          {
            type: 'paragraph',
            children: [],
          },
          'children'
        )
        .openNode(
          {
            type: 'link',
            url,
            title: `${LINK_TITLE_PREFIX}${o.node.flavour}`,
            children: [
              {
                type: 'text',
                value: label,
              },
            ],
          },
          'children'
        )
        .closeNode()
        .closeNode();
    },
  },
};
