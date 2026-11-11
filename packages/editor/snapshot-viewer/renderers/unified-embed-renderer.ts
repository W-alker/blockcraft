import {resolveEmbedFrameSize} from '../../blocks/embed-blocks/components/embed-sizing'
import type {IBlockSnapshot} from '../../framework/block-std/types/block.type'
import {resolveEmbedUrl} from '../../blocks/embed-blocks/embed-block/source'
import {createBlockShell} from '../dom/create-block-shell'
import {createSnapshotIframeElement} from '../enhancers/media-enhancer'
import type {SnapshotBlockRenderer, SnapshotRenderContext} from '../types'

function size(card: HTMLElement, snapshot: IBlockSnapshot) {
  const size = resolveEmbedFrameSize(snapshot.props)
  card.style.width = size.width
  card.style.height = size.height
  card.style.aspectRatio = size.aspectRatio
}

function enhance(ctx: SnapshotRenderContext, snapshot: IBlockSnapshot, wrapper: HTMLElement) {
  if (wrapper.querySelector('iframe')) return
  const resolved = resolveEmbedUrl(snapshot.props['url'])
  if (resolved) {
    ctx.scheduleEnhancement({
      // The cached value is only an activation marker; apply owns current source.
      key: `unified-embed:${snapshot.id}`, target: wrapper, load: () => true,
      apply: () => {
        if (wrapper.querySelector('iframe')) return
        const iframe = createSnapshotIframeElement()
        if (new URL(resolved.iframeUrl).origin === window.location.origin) {
          iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups')
        }
        iframe.title = '网页嵌入'
        iframe.src = resolved.iframeUrl
        wrapper.append(iframe)
      },
    })
  }
}

function render(ctx: SnapshotRenderContext, snapshot: IBlockSnapshot) {
  const element = createBlockShell(snapshot)
  element.classList.add('embed-frame-block')
  const card = document.createElement('embed-frame-card')
  size(card, snapshot)
  const wrapper = document.createElement('div')
  wrapper.className = 'iframe-wrapper'
  card.append(wrapper)
  element.append(card)
  enhance(ctx, snapshot, wrapper)
  return {element}
}

export function createUnifiedEmbedRenderer(): SnapshotBlockRenderer {
  return {
    canRender: snapshot => snapshot.flavour === 'embed', render,
    patch(ctx, current, next) {
      const shell = createBlockShell(next)
      shell.classList.add('embed-frame-block')
      current.element.className = shell.className
      current.element.style.cssText = shell.style.cssText
      const previous = current.snapshot.props
      const sourceChanged = previous['url'] !== next.props['url']
      if (sourceChanged) {
        const fresh = render(ctx, next).element
        current.element.replaceChildren(...Array.from(fresh.childNodes))
      } else {
        const card = current.element.querySelector<HTMLElement>('embed-frame-card')
        if (card) {
          size(card, next)
          enhance(ctx, next, card.querySelector<HTMLElement>('.iframe-wrapper')!)
        }
      }
    },
  }
}
