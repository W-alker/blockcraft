import {
  ObjectGroupBlockSchema,
} from '..'
import {
  normalizeBlockObjectGroupProps,
  type BlockObjectGroupProps,
  type BlockPosition,
  type IBlockSnapshot,
} from '../../../framework'
import {HastUtils} from '../../../adapters/utils'
import type {BlockHtmlAdapterMatcher} from '../../../adapters/html-adapter/block-adapter'
import {numberProperty, stringProperty} from '../../../framework/block-std/block/adapter/block-surface-properties'

export const objectGroupBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o =>
    HastUtils.isElement(o.node) &&
    o.node.tagName === 'figure' &&
    o.node.properties?.['dataBcBlock'] === 'object-group',
  fromMatch: o => o.node.flavour === 'object-group',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) return
      const snapshot = ObjectGroupBlockSchema.createSnapshot({
        width: numberProperty(o.node, 'dataObjectGroupWidth'),
        height: numberProperty(o.node, 'dataObjectGroupHeight'),
      })
      snapshot.props = {
        ...snapshot.props,
        ...placementFromHtml(o.node),
      }
      snapshot.children = []
      context.walkerContext.openNode(snapshot, 'children')
    },
    leave: (_, context) => {
      const snapshot = context.walkerContext.currentNode() as
        (IBlockSnapshot & {children: IBlockSnapshot[]}) | undefined
      if (snapshot?.flavour !== 'object-group') return
      snapshot.children = snapshot.children.filter(child =>
        child.flavour !== 'root' &&
        child.flavour !== 'placement-layout' &&
        child.flavour !== 'object-group',
      )
      context.walkerContext.closeNode()
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const props = normalizeBlockObjectGroupProps(
        o.node.props as Partial<BlockObjectGroupProps>,
      )
      const position = o.node.props['position'] as BlockPosition | undefined
      context.walkerContext.openNode({
        type: 'element',
        tagName: 'figure',
        properties: {
          dataBcBlock: 'object-group',
          dataObjectGroupWidth: props.width,
          dataObjectGroupHeight: props.height,
          ...placementToHtml(
            position,
            o.node.props['placementLayer'] === 'under' ? 'under' : undefined,
          ),
          style: `position: relative; width: ${props.width}px; height: ${props.height}px;`,
        },
        children: [],
      }, 'children')
    },
    leave: (_, context) => {
      context.walkerContext.closeNode()
    },
  },
}

function placementFromHtml(
  node: Parameters<typeof numberProperty>[0],
): Pick<BlockObjectGroupProps, 'position' | 'placementLayer'> {
  if (stringProperty(node, 'dataObjectGroupPlacementMode') !== 'absolute') {
    return {}
  }
  return {
    position: {
      x: numberProperty(node, 'dataObjectGroupPlacementX') ?? 0,
      y: numberProperty(node, 'dataObjectGroupPlacementY') ?? 0,
    },
    ...(stringProperty(node, 'dataObjectGroupPlacementLayer') === 'under'
      ? {placementLayer: 'under' as const}
      : {}),
  }
}

function placementToHtml(
  position: BlockPosition | undefined,
  layer: 'under' | undefined,
) {
  if (!position) return {}
  return {
    dataObjectGroupPlacementMode: 'absolute',
    dataObjectGroupPlacementX: position.x,
    dataObjectGroupPlacementY: position.y,
    dataObjectGroupPlacementLayer: layer === 'under' ? 'under' : 'over',
  }
}
