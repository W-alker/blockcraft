import type {Element} from 'hast'
import {normalizeStickerRotation, resolveStickerDimensions, roundStickerNumber} from './sticker-size'
import {parseBlockPosition, storeBlockPosition} from '../../framework/modules/object/block-placement/state'
import type {BlockHtmlAdapterMatcher} from '../../adapters/html-adapter/block-adapter'
import type {BlockMarkdownAdapterMatcher} from '../../adapters/markdown-adapter/block-adapter'
import type {MarkdownAST} from '../../adapters/markdown-adapter/type'
import type {BlockAdapterContribution} from '../../adapters/registry'
import {DEFAULT_MARKDOWN_ADAPTER_PROFILE, MARKDOWN_ADAPTER_PROFILE_CONFIG} from '../../adapters/registry'
import {createMarkdownPropsNode, readMarkdownPropsNode} from '../../adapters/generic'
import {HastUtils} from '../../adapters/utils'
import {StickerBlockSchema, createStickerProps} from './index'
import {getStickerPreset, normalizeStickerColors, renderStickerDataUrl} from './presets'

const property = (node: Element, key: string): unknown =>
  node.properties?.[key] ?? node.properties?.[key.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())]

const positive = (value: unknown): number | undefined => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

const finite = (value: unknown): number => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const readSize = (width: unknown, height: unknown) => {
  const w = positive(width), h = positive(height)
  if (w && h) return resolveStickerDimensions({width: w, height: h})
  return {}
}

export const stickerBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  priority: 110,
  consumes: true,
  toMatch: o => HastUtils.isElement(o.node)
    && o.node.tagName === 'figure'
    && property(o.node, 'data-bc-block') === 'sticker',
  fromMatch: o => o.node.flavour === 'sticker',
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!HastUtils.isElement(o.node)) return
      const id = property(o.node, 'data-sticker-id')
      const version = positive(property(o.node, 'data-sticker-version'))
      if (typeof id !== 'string' || id.length > 100 || !version || !Number.isInteger(version)) {
        context.walkerContext.skipAllChildren()
        return
      }
      let rawColors: unknown = undefined
      const serialized = property(o.node, 'data-sticker-colors')
      if (typeof serialized === 'string' && serialized.length <= 1024) {
        try { rawColors = JSON.parse(serialized) } catch { /* invalid overrides are ignored */ }
      }
      const snapshot = StickerBlockSchema.createSnapshot(id, rawColors, version)
      const size = readSize(property(o.node, 'data-sticker-width'), property(o.node, 'data-sticker-height'))
      const rotation = normalizeStickerRotation(property(o.node, 'data-sticker-rotation'))
      snapshot.props = {
        ...snapshot.props,
        ...size,
        ...(rotation ? {rotation} : {}),
        ...(property(o.node, 'data-sticker-placement-mode') === 'absolute'
          ? {
              position: storeBlockPosition({
                x: finite(property(o.node, 'data-sticker-x')),
                y: finite(property(o.node, 'data-sticker-y')),
              }),
              ...(property(o.node, 'data-sticker-layer') === 'under'
                ? {placementLayer: 'under' as const} : {}),
            }
          : {}),
      }
      context.walkerContext.openNode(snapshot).closeNode().skipAllChildren()
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const {presetId, presetVersion} = o.node.props as {presetId?: unknown; presetVersion?: unknown}
      const preset = getStickerPreset(presetId, presetVersion)
      const url = renderStickerDataUrl(presetId, presetVersion, o.node.props['colors'])
      const overrides = preset ? normalizeStickerColors(preset, o.node.props['colors']) : {}
      const position = parseBlockPosition(o.node.props['position'])
      context.walkerContext.openNode({
        type: 'element',
        tagName: 'figure',
        properties: {
          dataBcBlock: 'sticker',
          dataStickerId: presetId as string,
          dataStickerVersion: presetVersion as number,
          ...(Object.keys(overrides).length ? {dataStickerColors: JSON.stringify(overrides)} : {}),
          ...(positive(o.node.props['width']) ? {dataStickerWidth: Math.max(.01, roundStickerNumber(positive(o.node.props['width'])!))} : {}),
          ...(positive(o.node.props['height']) ? {dataStickerHeight: Math.max(.01, roundStickerNumber(positive(o.node.props['height'])!))} : {}),
          ...(normalizeStickerRotation(o.node.props['rotation']) ? {dataStickerRotation: normalizeStickerRotation(o.node.props['rotation'])} : {}),
          ...(position ? {
            dataStickerPlacementMode: 'absolute',
            dataStickerX: position.x,
            dataStickerY: position.y,
            ...(o.node.props['placementLayer'] === 'under' ? {dataStickerLayer: 'under'} : {}),
          } : {}),
        },
        children: url ? [{
          type: 'element', tagName: 'img',
          properties: {src: url, alt: preset?.label ?? '贴纸'},
          children: [],
        }] : [],
      }, 'children').closeNode()
    },
  },
}

type StickerDirective = MarkdownAST & {
  type: 'containerDirective' | 'leafDirective'
  name: 'bc-sticker'
  children: MarkdownAST[]
}

export const stickerBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  priority: 110,
  consumes: true,
  toMatch: o => (o.node.type === 'containerDirective' || o.node.type === 'leafDirective')
    && (o.node as StickerDirective).name === 'bc-sticker',
  fromMatch: o => o.node.flavour === 'sticker',
  toBlockSnapshot: {
    enter: (o, context) => {
      const raw = readMarkdownPropsNode((o.node as StickerDirective).children[0])
      const id = raw['presetId']
      const version = positive(raw['presetVersion'])
      if (typeof id !== 'string' || id.length > 100 || !version || !Number.isInteger(version)) {
        context.walkerContext.skipAllChildren()
        return
      }
      const snapshot = StickerBlockSchema.createSnapshot(id, raw['colors'], version)
      const position = parseBlockPosition(raw['position'])
      snapshot.props = {
        ...snapshot.props,
        ...readSize(raw['width'], raw['height']),
        ...(normalizeStickerRotation(raw['rotation']) ? {rotation: normalizeStickerRotation(raw['rotation'])} : {}),
        ...(position ? {position: storeBlockPosition(position)} : {}),
        ...(raw['placementLayer'] === 'under' ? {placementLayer: 'under' as const} : {}),
      }
      context.walkerContext.openNode(snapshot).closeNode().skipAllChildren()
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const profile = context.configs?.get(MARKDOWN_ADAPTER_PROFILE_CONFIG)
        ?? DEFAULT_MARKDOWN_ADAPTER_PROFILE
      if (profile === 'portable') {
        context.walkerContext.openNode({
          type: 'paragraph',
          children: [{type: 'text', value: '贴纸'}],
        } as MarkdownAST, 'children').closeNode()
        return
      }
      const source = o.node.props
      const id = typeof source['presetId'] === 'string' ? source['presetId'] : ''
      const version = positive(source['presetVersion']) ?? 1
      const position = parseBlockPosition(source['position'])
      const props = {
        ...createStickerProps(id, version, source['colors']),
        ...readSize(source['width'], source['height']),
        ...(normalizeStickerRotation(source['rotation']) ? {rotation: normalizeStickerRotation(source['rotation'])} : {}),
        ...(position ? {position: storeBlockPosition(position)} : {}),
        ...(source['placementLayer'] === 'under' ? {placementLayer: 'under' as const} : {}),
      }
      const propsNode = createMarkdownPropsNode(props)
      context.walkerContext.openNode({
        type: 'containerDirective', name: 'bc-sticker', attributes: {},
        children: propsNode ? [propsNode] : [],
      } as StickerDirective, 'children').closeNode()
      context.walkerContext.skipAllChildren()
    },
  },
}

export const stickerBlockAdapters: BlockAdapterContribution = {
  id: 'sticker',
  flavours: ['sticker'],
  html: [stickerBlockHtmlAdapterMatcher],
  markdown: [stickerBlockMarkdownAdapterMatcher],
}
