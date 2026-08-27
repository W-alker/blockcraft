import type {Element} from 'hast'
import {
  WordArtBlockSchema,
  WORD_ART_OBJECT_FORMAT_CAPABILITY,
  normalizeWordArtProps,
  resolveWordArtPresentation,
  resolveWordArtProjectionPath,
  wordArtPresentationToInlineStyle,
  type WordArtBlockProps,
} from '../../../blocks'
import type {DeltaInsert} from '../../../framework'
import {
  normalizeBlockObjectFormat,
  objectEffectsFilter,
  objectPicturePreserveAspectRatio,
} from '../../../framework'
import {HastUtils} from '../../utils'
import type {BlockHtmlAdapterMatcher} from '../block-adapter'
import {
  objectFormatPropsFromHtml,
  objectFormatPropsToHtml,
} from './object-format-properties'

const property = (
  node: Element,
  name: string,
): string | number | boolean | null | undefined =>
  node.properties?.[name] as
    string | number | boolean | null | undefined

const stringProperty = (
  node: Element,
  name: string,
): string | undefined => {
  const value = property(node, name)
  return typeof value === 'string' ? value : undefined
}

const numberProperty = (
  node: Element,
  name: string,
): number | undefined => {
  const value = property(node, name)
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const booleanProperty = (
  node: Element,
  name: string,
): boolean | undefined => {
  const value = property(node, name)
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
}

const arrayProperty = <T extends string | number>(
  node: Element,
  name: string,
  type: 'string' | 'number',
): T[] | undefined => {
  const value = stringProperty(node, name)
  if (!value || value.length > 512) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.length > 4) return undefined
    return parsed.every(item => typeof item === type)
      ? parsed as T[]
      : undefined
  } catch {
    return undefined
  }
}

const findTextElement = (node: Element): Element | null =>
  node.children.find(child =>
    HastUtils.isElement(child) &&
    child.properties?.['dataBcWordArtText'] != null
  ) as Element | undefined ?? null

const sanitizePlainTextDelta = (value: DeltaInsert[]): DeltaInsert[] => {
  const result: DeltaInsert[] = []
  for (const item of value) {
    if (typeof item.insert === 'string') {
      if (item.insert) result.push({insert: item.insert})
      continue
    }
    if (item.insert?.['break']) {
      result.push({insert: {break: '\n'}})
    }
  }
  return result
}

const surfaceStyle = (
  props: {width: number; height: number; rotation: number},
): string =>
  [
    `width:${props.width}px`,
    `height:${props.height}px`,
    `transform:${props.rotation === 0
      ? 'none'
      : `rotate(${props.rotation}deg)`}`,
    'position:relative',
  ].join(';')

export const wordArtBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o =>
    HastUtils.isElement(o.node) &&
    o.node.tagName === 'figure' &&
    o.node.properties?.['dataBcBlock'] === 'word-art',
  fromMatch: o => o.node.flavour === 'word-art',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) return
      const {walkerContext, deltaConverter} = context
      const textElement = findTextElement(o.node)
      const text = sanitizePlainTextDelta(
        textElement ? deltaConverter.astToDelta(textElement) : [],
      )
      const rawProps: Partial<WordArtBlockProps> = {
        depth: 0,
        ...objectFormatPropsFromHtml(o.node),
      }
      if (
        stringProperty(o.node, 'dataWordArtPlacementMode') === 'absolute'
      ) {
        rawProps.position = {
          x: numberProperty(o.node, 'dataWordArtPlacementX') ?? 0,
          y: numberProperty(o.node, 'dataWordArtPlacementY') ?? 0,
        }
        if (stringProperty(o.node, 'dataWordArtPlacementLayer') === 'under') {
          rawProps.placementLayer = 'under'
        }
      }
      const snapshot = WordArtBlockSchema.createSnapshot(text, rawProps)
      walkerContext.openNode(snapshot).closeNode()
      walkerContext.skipAllChildren()
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext, deltaConverter} = context
      const props = normalizeWordArtProps(
        o.node.props as Partial<WordArtBlockProps>,
      )
      const presentation = resolveWordArtPresentation(
        o.node.props as Partial<WordArtBlockProps>,
      )
      const format = normalizeBlockObjectFormat(
        o.node.props as Partial<WordArtBlockProps>,
        WORD_ART_OBJECT_FORMAT_CAPABILITY,
      )
      const position = props.position
      const delta = sanitizePlainTextDelta(
        o.node.children as DeltaInsert[],
      )
      const projectionPath = resolveWordArtProjectionPath(
        props.effect,
        props.width,
        props.height,
      )
      const projection = projectionPath
        ? wordArtProjectionNode(
            o.node.id,
            projectionPath,
            deltaPlainText(delta),
            props,
            format.textStyle!,
            presentation.fontFamily,
          )
        : null

      walkerContext.openNode({
        type: 'element',
        tagName: 'figure',
        properties: {
          dataBcBlock: 'word-art',
          ...objectFormatPropsToHtml(
            o.node.props as Partial<WordArtBlockProps>,
            WORD_ART_OBJECT_FORMAT_CAPABILITY,
          ),
          ...(position ? {
            dataWordArtPlacementMode: 'absolute',
            dataWordArtPlacementX: position.x,
            dataWordArtPlacementY: position.y,
            dataWordArtPlacementLayer:
              props.placementLayer === 'under' ? 'under' : 'over',
          } : {}),
          style: surfaceStyle(props),
        },
        children: [
          ...(projection ? [projection] : []),
          {
          type: 'element',
          tagName: 'div',
          properties: {
            dataBcWordArtText: true,
            style: wordArtPresentationToInlineStyle({
              ...(o.node.props as Partial<WordArtBlockProps>),
              width: props.width,
              height: props.height,
              rotation: 0,
            }) + (projection
              ? ';position:absolute;inset:0;opacity:0;pointer-events:none'
              : ''),
            title: presentation.props.effect === 'none'
              ? undefined
              : '艺术字',
          },
          children: deltaConverter.deltaToAST(delta),
          },
        ],
      }, 'children').closeNode()
      walkerContext.skipAllChildren()
    },
  },
}

function deltaPlainText(delta: readonly DeltaInsert[]): string {
  return delta.map(item => typeof item.insert === 'string'
    ? item.insert
    : item.insert?.['break'] ? '\n' : '').join('')
}

function wordArtProjectionNode(
  blockId: string,
  pathValue: string,
  textValue: string,
  props: {width: number; height: number},
  style: NonNullable<ReturnType<typeof normalizeBlockObjectFormat>['textStyle']>,
  fontFamily: string,
): Element {
  const token = blockId.replace(/[^a-zA-Z0-9_-]/g, '-')
  const pathId = `bc-word-art-html-path-${token}`
  const gradientId = `${pathId}-gradient`
  const gradient = style.fill.type === 'linear-gradient'
    ? [{
        type: 'element' as const,
        tagName: 'linearGradient',
        properties: {id: gradientId},
        children: style.fill.stops.map(stop => ({
          type: 'element' as const,
          tagName: 'stop',
          properties: {
            offset: `${stop.offset}`,
            stopColor: stop.color,
            stopOpacity: `${stop.opacity}`,
          },
          children: [],
        })),
      }]
    : []
  const picture = style.fill.type === 'picture' && style.fill.src
    ? [{
        type: 'element' as const,
        tagName: 'pattern',
        properties: {
          id: `${pathId}-picture`, width: '1', height: '1',
          patternContentUnits: 'objectBoundingBox',
        },
        children: [{
          type: 'element' as const,
          tagName: 'image',
          properties: {
            href: style.fill.src, width: '1', height: '1',
            preserveAspectRatio: objectPicturePreserveAspectRatio(style.fill),
          },
          children: [],
        }],
      }]
    : []
  const fill = style.fill.type === 'none'
    ? 'none'
    : style.fill.type === 'linear-gradient'
      ? `url(#${gradientId})`
      : style.fill.type === 'picture' && style.fill.src
        ? `url(#${pathId}-picture)`
      : style.fill.type === 'solid' ? style.fill.color : 'none'
  return {
    type: 'element',
    tagName: 'svg',
    properties: {
      dataBcWordArtProjection: true,
      viewBox: `0 0 ${props.width} ${props.height}`,
      preserveAspectRatio: 'none',
      style: 'position:absolute;inset:0;width:100%;height:100%;overflow:visible',
      ariaHidden: 'true',
    },
    children: [{
      type: 'element',
      tagName: 'defs',
      properties: {},
      children: [{
        type: 'element',
        tagName: 'path',
        properties: {id: pathId, d: pathValue},
        children: [],
      }, ...gradient, ...picture],
    }, {
      type: 'element',
      tagName: 'text',
      properties: {
        textAnchor: 'middle',
        fill,
        fillOpacity: `${style.fill.type === 'none' ? 0 : style.fill.opacity}`,
        stroke: style.outline.type === 'none' ? 'none' : style.outline.color,
        strokeWidth: `${style.outline.type === 'none' ? 0 : style.outline.width}`,
        style: [
          `font-family:${fontFamily}`,
          `font-size:${style.fontSize}px`,
          `font-weight:${style.fontWeight}`,
          `font-style:${style.fontStyle}`,
          `letter-spacing:${style.letterSpacingEm}em`,
          `filter:${objectEffectsFilter(style.effects) || 'none'}`,
        ].join(';'),
      },
      children: [{
        type: 'element',
        tagName: 'textPath',
        properties: {href: `#${pathId}`, startOffset: '50%'},
        children: [{type: 'text', value: textValue}],
      }],
    }],
  }
}
