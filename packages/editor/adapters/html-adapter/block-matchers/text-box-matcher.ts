import {
  findTextBoxArtworkBySrc,
  normalizeTextBoxProps,
  ParagraphBlockSchema,
  resolveTextBoxArtworkSrc,
  TextBoxBlockSchema,
  textBoxArtworkRef,
  type TextBoxBlockProps,
} from '../../../blocks'
import type {BlockPosition, IBlockSnapshot} from '../../../framework'
import {HastUtils} from '../../utils'
import type {BlockHtmlAdapterMatcher} from '../block-adapter'
import {
  blockSurfacePropsFromHtml,
  blockSurfacePropsToHtml,
  numberProperty,
  stringProperty,
} from './block-surface-properties'

/**
 * Exported HTML has to stand on its own in whatever opens it, so a `bc:`
 * reference is expanded back into the drawing it names. Nothing else is
 * touched: uploaded images are already URLs, and an unknown reference is
 * dropped rather than written out as an unloadable `src`.
 */
function expandArtwork(
  properties: NonNullable<ReturnType<typeof blockSurfacePropsToHtml>>,
): typeof properties {
  const src = properties['dataBcBgi']
  if (typeof src !== 'string' || !src) return properties
  return {...properties, dataBcBgi: resolveTextBoxArtworkSrc(src) ?? undefined}
}

/**
 * The inverse, on the way in. Without it a round trip through HTML would leave
 * the expanded copy sitting in the document — the very thing the reference
 * exists to keep out of snapshots. A drawing this build does not recognise
 * (someone else's image, or a newer catalog) stays as it arrived.
 */
function collapseArtwork(
  surface: ReturnType<typeof blockSurfacePropsFromHtml>,
): typeof surface {
  const artwork = findTextBoxArtworkBySrc(surface.bgi)
  return artwork ? {...surface, bgi: textBoxArtworkRef(artwork.id)} : surface
}

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
      const props: Partial<TextBoxBlockProps> = {
        ...collapseArtwork(blockSurfacePropsFromHtml(o.node)),
        width: numberProperty(o.node, 'dataTextBoxWidth'),
        height: numberProperty(o.node, 'dataTextBoxHeight'),
        rotation: numberProperty(o.node, 'dataTextBoxRotation'),
        backColor: stringProperty(o.node, 'dataBcBackColor'),
        borderColor: stringProperty(o.node, 'dataBcBorderColor'),
        sh: stringProperty(o.node, 'dataBcSh') as TextBoxBlockProps['sh'],
        fo: numberProperty(o.node, 'dataBcFo'),
        bw: numberProperty(o.node, 'dataBcBw'),
        bs: stringProperty(o.node, 'dataBcBs') as TextBoxBlockProps['bs'],
        wm: stringProperty(o.node, 'dataBcWm') as TextBoxBlockProps['wm'],
        wa: wordArtProperty(o.node),
        ...placementFromHtml(o.node),
      }
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
          dataTextBoxWidth: props.width,
          dataTextBoxHeight: props.height,
          dataTextBoxRotation: props.rotation,
          dataBcBackColor: props.backColor,
          dataBcBorderColor: props.borderColor,
          dataBcSh: props.sh,
          dataBcFo: props.fo,
          dataBcBw: props.bw,
          dataBcBs: props.bs,
          dataBcWm: props.wm,
          dataBcWa: props.wa,
          ...placementToHtml(props.position, props.placementLayer),
          ...expandArtwork(blockSurfacePropsToHtml(props)),
        },
        children: [],
      }, 'children')
    },
    leave: (_, context) => {
      context.walkerContext.closeNode()
    },
  },
}

function wordArtProperty(
  node: Parameters<typeof stringProperty>[0],
): TextBoxBlockProps['wa'] | undefined {
  const value = stringProperty(node, 'dataBcWa')
  if (!value || value.length > 16_000) return undefined
  return value
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
