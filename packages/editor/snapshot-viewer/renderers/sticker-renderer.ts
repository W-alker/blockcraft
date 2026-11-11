import {renderStickerDataUrl} from '../../blocks/sticker-block/presets'
import {normalizeStickerRotation, resolveStickerDimensions} from '../../blocks/sticker-block/sticker-size'
import type {StickerBlockProps} from '../../blocks/sticker-block'
import {IBlockSnapshot} from '../../framework/block-std/types/block.type'
import {createBlockShell} from '../dom/create-block-shell'
import {SnapshotBlockRenderer} from '../types'

export function createStickerRenderer(): SnapshotBlockRenderer {
  return {
    canRender: snapshot => snapshot.flavour === 'sticker',
    render(_ctx, snapshot: IBlockSnapshot) {
      const element = createBlockShell(snapshot)
      const props = snapshot.props as Record<string, unknown>
      const {width, height} = resolveStickerDimensions(props as Partial<StickerBlockProps>)
      const rotation = normalizeStickerRotation(props['rotation'])
      const surface = document.createElement('div')
      surface.classList.add('sticker-block__surface')
      surface.setAttribute('data-bc-object-drag-surface', '')
      surface.setAttribute('data-bc-print-visual-surface', '')
      surface.style.width = `${width}px`
      surface.style.aspectRatio = `${width / height}`
      if (rotation) surface.style.transform = `rotate(${rotation}deg)`

      const imageUrl = renderStickerDataUrl(
        props['presetId'], props['presetVersion'], props['colors'],
      )
      if (imageUrl) {
        const image = document.createElement('img')
        image.src = imageUrl
        image.alt = ''
        image.draggable = false
        image.contentEditable = 'false'
        surface.append(image)
      } else {
        const missing = document.createElement('span')
        missing.classList.add('sticker-block__missing')
        missing.contentEditable = 'false'
        missing.textContent = '贴纸预设不可用'
        surface.append(missing)
      }
      element.append(surface)
      return {element}
    },
  }
}
