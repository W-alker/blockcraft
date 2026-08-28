import {
  normalizeTextBoxProps,
  normalizeTextBoxSnapshotProps,
  findTextBoxArtworkBySrc,
  resolveTextBoxArtworkSrc,
  textBoxArtworkRef,
  TEXT_BOX_OBJECT_FORMAT_CAPABILITY,
  TextBoxBlockSchema,
  type TextBoxBlockProps,
} from '..'
import {ParagraphBlockSchema} from '../../paragraph-block'
import type {BlockPosition, IBlockSnapshot} from '../../../framework'
import {HastUtils} from '../../../adapters/utils'
import type {BlockHtmlAdapterMatcher} from '../../../adapters/html-adapter/block-adapter'
import {numberProperty, stringProperty} from '../../../framework/block-std/block/adapter/block-surface-properties'
import {
  objectFormatPropsFromHtml,
  objectFormatPropsToHtml,
} from '../../../framework/block-std/block/adapter/object-format-properties'

const TEXT_BOX_CHILD_FLAVOURS = new Set([
  'paragraph',
  'bullet',
  'ordered',
  'todo',
  'blockquote',
])

export const textBoxBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  toMatch: o =>
    HastUtils.isElement(o.node) &&
    o.node.tagName === 'figure' &&
    o.node.properties?.['dataBcBlock'] === 'text-box',
  fromMatch: o => o.node.flavour === 'text-box',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) return
      const props = normalizeTextBoxSnapshotProps({
        ...objectFormatPropsFromHtml(o.node),
        ...placementFromHtml(o.node),
        ...artworkFromHtml(o.node),
      } as Partial<TextBoxBlockProps>)
      const snapshot = TextBoxBlockSchema.createSnapshot('', props)
      snapshot.children = []
      context.walkerContext
        .openNode(snapshot, 'children')
        .setNodeContext('text-box:owner', snapshot.id)
    },
    leave: (_, context) => {
      if (context.walkerContext.getNodeContext('text-box:owner') == null) return
      const snapshot = context.walkerContext.currentNode() as
        (IBlockSnapshot & {children: IBlockSnapshot[]}) | undefined
      if (snapshot?.flavour !== 'text-box') return
      snapshot.children = snapshot.children.filter(child =>
        TEXT_BOX_CHILD_FLAVOURS.has(child.flavour),
      )
      if (!snapshot.children.length) {
        context.walkerContext
          .openNode(ParagraphBlockSchema.createSnapshot())
          .closeNode()
      }
      context.walkerContext.closeNode()
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const props = normalizeTextBoxProps(
        o.node.props as Partial<TextBoxBlockProps>,
      )
      context.walkerContext.openNode({
        type: 'element',
        tagName: 'figure',
        properties: {
          dataBcBlock: 'text-box',
          ...objectFormatPropsToHtml(
            o.node.props as Partial<TextBoxBlockProps>,
            TEXT_BOX_OBJECT_FORMAT_CAPABILITY,
          ),
          ...(props.artwork && resolveTextBoxArtworkSrc(props.artwork)
            ? {dataBcObjectArtwork: resolveTextBoxArtworkSrc(props.artwork)!}
            : {}),
          ...placementToHtml(props.position, props.placementLayer),
        },
        children: [],
      }, 'children')
    },
    leave: (_, context) => {
      context.walkerContext.closeNode()
    },
  },
}

function artworkFromHtml(
  node: Parameters<typeof stringProperty>[0],
): Pick<TextBoxBlockProps, 'artwork'> {
  const source = stringProperty(node, 'dataBcObjectArtwork')
  const artwork = findTextBoxArtworkBySrc(source)
  return artwork ? {artwork: textBoxArtworkRef(artwork.id)} : {}
}

function placementFromHtml(
  node: Parameters<typeof numberProperty>[0],
): Pick<TextBoxBlockProps, 'position' | 'placementLayer'> {
  const mode = stringProperty(node, 'dataTextBoxPlacementMode')
  if (mode !== 'absolute') return {}
  return {
    position: {
      x: numberProperty(node, 'dataTextBoxPlacementX') ?? 0,
      y: numberProperty(node, 'dataTextBoxPlacementY') ?? 0,
    },
    ...(stringProperty(node, 'dataTextBoxPlacementLayer') === 'under'
      ? {placementLayer: 'under' as const}
      : {}),
  }
}

function placementToHtml(
  position: BlockPosition | null | undefined,
  layer: TextBoxBlockProps['placementLayer'],
) {
  if (!position) return {}
  return {
    dataTextBoxPlacementMode: 'absolute',
    dataTextBoxPlacementX: position.x,
    dataTextBoxPlacementY: position.y,
    dataTextBoxPlacementLayer: layer === 'under' ? 'under' : 'over',
  }
}
