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
        backColor: stringProperty(o.node, 'dataBcBackColor'),
        borderColor: stringProperty(o.node, 'dataBcBorderColor'),
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
          dataBcBackColor: props.backColor,
          dataBcBorderColor: props.borderColor,
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
