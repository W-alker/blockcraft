import type {Element} from 'hast'
import {
  WordArtBlockSchema,
  normalizeWordArtProps,
  resolveWordArtPresentation,
  wordArtPresentationToInlineStyle,
  type WordArtBlockProps,
} from '../../../blocks'
import type {DeltaInsert} from '../../../framework'
import {HastUtils} from '../../utils'
import type {BlockHtmlAdapterMatcher} from '../block-adapter'

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

const surfaceStyle = (props: WordArtBlockProps): string =>
  [
    `width:${props.width}px`,
    `height:${props.height}px`,
    `transform:${props.rotation === 0
      ? 'none'
      : `rotate(${props.rotation}deg)`}`,
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
        width: numberProperty(o.node, 'dataWordArtWidth'),
        height: numberProperty(o.node, 'dataWordArtHeight'),
        rotation: numberProperty(o.node, 'dataWordArtRotation'),
        fontFamily: stringProperty(o.node, 'dataWordArtFontFamily') as
          WordArtBlockProps['fontFamily'],
        fontSize: numberProperty(o.node, 'dataWordArtFontSize'),
        fontWeight: numberProperty(o.node, 'dataWordArtFontWeight') as
          WordArtBlockProps['fontWeight'],
        fontStyle: stringProperty(o.node, 'dataWordArtFontStyle') as
          WordArtBlockProps['fontStyle'],
        letterSpacingEm: numberProperty(
          o.node,
          'dataWordArtLetterSpacing',
        ),
        lineHeight: numberProperty(o.node, 'dataWordArtLineHeight'),
        horizontalAlign: stringProperty(
          o.node,
          'dataWordArtHorizontalAlign',
        ) as WordArtBlockProps['horizontalAlign'],
        verticalAlign: stringProperty(
          o.node,
          'dataWordArtVerticalAlign',
        ) as WordArtBlockProps['verticalAlign'],
        fillType: stringProperty(o.node, 'dataWordArtFillType') as
          WordArtBlockProps['fillType'],
        fillColor: stringProperty(o.node, 'dataWordArtFillColor'),
        gradientAngle: numberProperty(o.node, 'dataWordArtGradientAngle'),
        gradientColors: arrayProperty<string>(
          o.node,
          'dataWordArtGradientColors',
          'string',
        ),
        gradientStops: arrayProperty<number>(
          o.node,
          'dataWordArtGradientStops',
          'number',
        ),
        outlineColor: stringProperty(o.node, 'dataWordArtOutlineColor'),
        outlineWidthEm: numberProperty(o.node, 'dataWordArtOutlineWidth'),
        shadowEnabled: booleanProperty(o.node, 'dataWordArtShadowEnabled'),
        shadowColor: stringProperty(o.node, 'dataWordArtShadowColor'),
        shadowOpacity: numberProperty(o.node, 'dataWordArtShadowOpacity'),
        shadowOffsetXEm: numberProperty(o.node, 'dataWordArtShadowOffsetX'),
        shadowOffsetYEm: numberProperty(o.node, 'dataWordArtShadowOffsetY'),
        shadowBlurEm: numberProperty(o.node, 'dataWordArtShadowBlur'),
        effect: stringProperty(o.node, 'dataWordArtEffect') as
          WordArtBlockProps['effect'],
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
      const presentation = resolveWordArtPresentation(props)
      const position = props.position
      const delta = sanitizePlainTextDelta(
        o.node.children as DeltaInsert[],
      )

      walkerContext.openNode({
        type: 'element',
        tagName: 'figure',
        properties: {
          dataBcBlock: 'word-art',
          dataWordArtWidth: props.width,
          dataWordArtHeight: props.height,
          dataWordArtRotation: props.rotation,
          dataWordArtFontFamily: props.fontFamily,
          dataWordArtFontSize: props.fontSize,
          dataWordArtFontWeight: props.fontWeight,
          dataWordArtFontStyle: props.fontStyle,
          dataWordArtLetterSpacing: props.letterSpacingEm,
          dataWordArtLineHeight: props.lineHeight,
          dataWordArtHorizontalAlign: props.horizontalAlign,
          dataWordArtVerticalAlign: props.verticalAlign,
          dataWordArtFillType: props.fillType,
          dataWordArtFillColor: props.fillColor,
          dataWordArtGradientAngle: props.gradientAngle,
          dataWordArtGradientColors: JSON.stringify(props.gradientColors),
          dataWordArtGradientStops: JSON.stringify(props.gradientStops),
          dataWordArtOutlineColor: props.outlineColor,
          dataWordArtOutlineWidth: props.outlineWidthEm,
          dataWordArtShadowEnabled: String(props.shadowEnabled),
          dataWordArtShadowColor: props.shadowColor,
          dataWordArtShadowOpacity: props.shadowOpacity,
          dataWordArtShadowOffsetX: props.shadowOffsetXEm,
          dataWordArtShadowOffsetY: props.shadowOffsetYEm,
          dataWordArtShadowBlur: props.shadowBlurEm,
          dataWordArtEffect: props.effect,
          ...(position ? {
            dataWordArtPlacementMode: 'absolute',
            dataWordArtPlacementX: position.x,
            dataWordArtPlacementY: position.y,
            dataWordArtPlacementLayer:
              props.placementLayer === 'under' ? 'under' : 'over',
          } : {}),
          style: surfaceStyle(props),
        },
        children: [{
          type: 'element',
          tagName: 'div',
          properties: {
            dataBcWordArtText: true,
            style: wordArtPresentationToInlineStyle({
              ...props,
              rotation: 0,
            }),
            title: presentation.props.effect === 'none'
              ? undefined
              : '艺术字',
          },
          children: deltaConverter.deltaToAST(delta),
        }],
      }, 'children').closeNode()
      walkerContext.skipAllChildren()
    },
  },
}
