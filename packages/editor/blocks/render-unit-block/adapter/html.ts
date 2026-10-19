import {decodeAdapterProps} from '../../../adapters/generic'
import {normalizeRegionBorders} from '../borders'
import {
  normalizeRenderUnitBlockProps,
  RenderUnitBlockSchema,
  type RenderUnitBlockProps,
} from '..'
import {HastUtils} from '../../../adapters/utils'
import type {BlockHtmlAdapterMatcher} from '../../../adapters/html-adapter/block-adapter'
import {
  blockSurfacePropsFromHtml,
  blockSurfacePropsToHtml,
  stringProperty,
  numberProperty,
} from '../../../framework/block-std/block/adapter/block-surface-properties'

/** Surface-preserving HTML envelope for the opt-in render-unit contract. */
export const renderUnitBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o =>
    HastUtils.isElement(o.node) &&
    o.node.tagName === 'section' &&
    o.node.properties?.['dataBcBlock'] === 'render-unit',
  fromMatch: o => o.node.flavour === 'render-unit',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) return
      const rawProps: Partial<RenderUnitBlockProps> = {
        ...blockSurfacePropsFromHtml(o.node),
        border: stringProperty(o.node, 'dataBcBorder'),
        borders: normalizeRegionBorders(o.node.properties?.['dataBcBorders'])
          ?? normalizeRegionBorders(decodeAdapterProps(o.node.properties?.['dataBcBorders'])),
        borderTop: stringProperty(o.node, 'dataBcBorderTop'),
        borderRight: stringProperty(o.node, 'dataBcBorderRight'),
        borderBottom: stringProperty(o.node, 'dataBcBorderBottom'),
        borderLeft: stringProperty(o.node, 'dataBcBorderLeft'),
        backColor: stringProperty(o.node, 'dataBcBackColor'),
        backOpacity: numberProperty(o.node, 'dataBcBackOpacity'),
        borderColor: stringProperty(o.node, 'dataBcBorderColor'),
        textFamily: stringProperty(o.node, 'dataBcTextFamily'),
        textFont: stringProperty(o.node, 'dataBcTextFont'),
        textSpacing: stringProperty(o.node, 'dataBcTextSpacing'),
        textFill: stringProperty(o.node, 'dataBcTextFill'),
        wr: numberProperty(o.node, 'dataBcWr'),
        ar: numberProperty(o.node, 'dataBcAr'),
        width: numberProperty(o.node, 'dataBcWidth'),
        height: numberProperty(o.node, 'dataBcHeight'),
      }
      context.walkerContext.openNode(
        RenderUnitBlockSchema.createSnapshot({}, rawProps),
        'children',
      )
    },
    leave: (_, context) => {
      context.walkerContext.closeNode()
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const props = normalizeRenderUnitBlockProps(
        o.node.props as Record<string, unknown>,
      )
      context.walkerContext.openNode({
        type: 'element',
        tagName: 'section',
        properties: {
          dataBcBlock: 'render-unit',
          dataBcBorder: props.border,
          dataBcBorderTop: props.borderTop,
          dataBcBorderRight: props.borderRight,
          dataBcBorderBottom: props.borderBottom,
          dataBcBorderLeft: props.borderLeft,
          dataBcBackColor: props.backColor,
          dataBcBackOpacity: props.backOpacity,
          dataBcBorderColor: props.borderColor,
          dataBcTextFamily: props.textFamily,
          dataBcTextFont: props.textFont,
          dataBcTextSpacing: props.textSpacing,
          dataBcTextFill: props.textFill,
          dataBcWr: props.wr,
          dataBcAr: props.ar,
          dataBcWidth: props.width,
          dataBcHeight: props.height,
          ...blockSurfacePropsToHtml(props),
        },
        children: [],
      }, 'children')
    },
    leave: (_, context) => {
      context.walkerContext.closeNode()
    },
  },
}
