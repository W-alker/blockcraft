import type {Element} from 'hast'
import {
  ShapeBlockSchema,
  isShapeKind,
  normalizeShapeProps,
  type ShapeBlockProps,
} from '../../../blocks'
import type {DeltaInsert, IBlockSnapshot} from '../../../framework'
import {HastUtils} from '../../utils'
import type {BlockHtmlAdapterMatcher} from '../block-adapter'

const property = (
  node: Element,
  name: string,
): string | number | boolean | null | undefined =>
  node.properties?.[name] as string | number | boolean | null | undefined

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

const findTextElement = (node: Element): Element | null =>
  node.children.find(child =>
    HastUtils.isElement(child) &&
    child.properties?.['dataBcShapeText'] != null
  ) as Element | undefined ?? null

const hasDeltaContent = (delta: DeltaInsert[]): boolean =>
  delta.some(item => {
    if (typeof item.insert === 'string') return item.insert.length > 0
    return item.insert != null
  })

export const shapeBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o =>
    HastUtils.isElement(o.node) &&
    o.node.tagName === 'figure' &&
    o.node.properties?.['dataBcBlock'] === 'shape',
  fromMatch: o => o.node.flavour === 'shape',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) return
      const {walkerContext, deltaConverter} = context
      const textElement = findTextElement(o.node)
      const text = textElement
        ? deltaConverter.astToDelta(textElement)
        : []
      const typeValue = stringProperty(o.node, 'dataShapeType')
      const snapshot = ShapeBlockSchema.createSnapshot(
        isShapeKind(typeValue) ? typeValue : undefined,
        text,
      )
      const rawProps: Partial<ShapeBlockProps> = {
        shapeType: isShapeKind(typeValue) ? typeValue : undefined,
        width: numberProperty(o.node, 'dataShapeWidth'),
        height: numberProperty(o.node, 'dataShapeHeight'),
        rotation: numberProperty(o.node, 'dataShapeRotation'),
        fillColor: stringProperty(o.node, 'dataShapeFill'),
        fillOpacity: numberProperty(o.node, 'dataShapeFillOpacity'),
        strokeColor: stringProperty(o.node, 'dataShapeStroke'),
        strokeWidth: numberProperty(o.node, 'dataShapeStrokeWidth'),
        strokeStyle: stringProperty(o.node, 'dataShapeStrokeStyle') as
          ShapeBlockProps['strokeStyle'],
        textColor: stringProperty(o.node, 'dataShapeTextColor'),
        shapeTextAlign: stringProperty(o.node, 'dataShapeTextAlign') as
          ShapeBlockProps['shapeTextAlign'],
        verticalAlign: stringProperty(o.node, 'dataShapeVerticalAlign') as
          ShapeBlockProps['verticalAlign'],
      }
      if (stringProperty(o.node, 'dataShapePlacementMode') === 'absolute') {
        rawProps.placement = {
          mode: 'absolute',
          x: numberProperty(o.node, 'dataShapePlacementX') ?? 0,
          y: numberProperty(o.node, 'dataShapePlacementY') ?? 0,
          layer: stringProperty(o.node, 'dataShapePlacementLayer') === 'under'
            ? 'under'
            : 'over',
        }
      }
      snapshot.props = normalizeShapeProps(rawProps)
      walkerContext.openNode(snapshot).closeNode()
      walkerContext.skipAllChildren()
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const {walkerContext, deltaConverter} = context
      const props = normalizeShapeProps(o.node.props as Partial<ShapeBlockProps>)
      const textSnapshot = o.node.children[0] as
        IBlockSnapshot | undefined
      const delta = textSnapshot?.flavour === 'shape-text'
        ? textSnapshot.children as DeltaInsert[]
        : []
      const placement = props.placement?.mode === 'absolute'
        ? props.placement
        : null

      walkerContext.openNode({
        type: 'element',
        tagName: 'figure',
        properties: {
          dataBcBlock: 'shape',
          dataShapeType: props.shapeType,
          dataShapeWidth: props.width,
          dataShapeHeight: props.height,
          dataShapeRotation: props.rotation,
          dataShapeFill: props.fillColor,
          dataShapeFillOpacity: props.fillOpacity,
          dataShapeStroke: props.strokeColor,
          dataShapeStrokeWidth: props.strokeWidth,
          dataShapeStrokeStyle: props.strokeStyle,
          dataShapeTextColor: props.textColor,
          dataShapeTextAlign: props.shapeTextAlign,
          dataShapeVerticalAlign: props.verticalAlign,
          ...(placement ? {
            dataShapePlacementMode: 'absolute',
            dataShapePlacementX: placement.x ?? 0,
            dataShapePlacementY: placement.y ?? 0,
            dataShapePlacementLayer:
              placement.layer === 'under' ? 'under' : 'over',
          } : {}),
        },
        children: hasDeltaContent(delta)
          ? [{
              type: 'element',
              tagName: 'div',
              properties: {dataBcShapeText: true},
              children: deltaConverter.deltaToAST(delta),
            }]
          : [],
      }, 'children').closeNode()
      walkerContext.skipAllChildren()
    },
  },
}
