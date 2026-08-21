import {
  normalizeWordArtProps,
  resolveWordArtPresentation,
  type WordArtBlockProps,
} from '../../blocks'
import type {InlineModel} from '../../framework/block-std/types/inline.type'
import {createBlockShell} from '../dom/create-block-shell'
import {projectAlwaysPlaceholder} from '../dom/always-placeholder'
import type {SnapshotBlockRenderer} from '../types'

export function createWordArtRenderers(): SnapshotBlockRenderer[] {
  return [{
    canRender: snapshot => snapshot.flavour === 'word-art',
    render(ctx, snapshot) {
      const element = createBlockShell(snapshot)
      const props = normalizeWordArtProps(
        snapshot.props as Partial<WordArtBlockProps>,
      )
      const presentation = resolveWordArtPresentation(props)

      const surface = document.createElement('div')
      surface.classList.add('word-art-block__surface')
      surface.setAttribute('data-bc-print-visual-surface', '')
      surface.style.width = `${props.width}px`
      surface.style.height = `${props.height}px`
      surface.style.transform = props.rotation === 0
        ? ''
        : `rotate(${props.rotation}deg)`
      surface.style.alignItems =
        props.verticalAlign === 'top'
          ? 'flex-start'
          : props.verticalAlign === 'bottom'
            ? 'flex-end'
            : 'center'

      const content = document.createElement('div')
      content.classList.add('word-art-block__editor', 'edit-container')
      content.dataset['bcWordArtPrintProps'] = JSON.stringify(props)
      content.style.fontFamily = presentation.fontFamily
      content.style.fontSize = `${props.fontSize}px`
      content.style.fontWeight = `${props.fontWeight}`
      content.style.fontStyle = props.fontStyle
      content.style.letterSpacing = `${props.letterSpacingEm}em`
      content.style.lineHeight = `${props.lineHeight}`
      content.style.textAlign = props.horizontalAlign
      content.style.color = presentation.textColor
      content.style.webkitTextFillColor = presentation.textColor
      content.style.caretColor = presentation.fallbackColor
      content.style.backgroundImage = presentation.backgroundImage
      content.style.backgroundClip = 'text'
      content.style.setProperty('-webkit-background-clip', 'text')
      content.style.setProperty(
        '-webkit-text-stroke',
        presentation.textStroke,
      )
      content.style.textShadow = presentation.textShadow
      content.style.transform = presentation.effectTransform
      content.dataset['bcWordArtEffectTransform'] =
        presentation.effectTransform
      content.append(
        ctx.createInlineContent(snapshot.children as InlineModel),
      )
      // Word-art is an editable flavour too — a fill-in region with
      // meta.plh/plhMode:'always' must show its hint here, same as paragraphs.
      projectAlwaysPlaceholder(element, content, snapshot)

      surface.append(content)
      element.append(surface)
      return {element}
    },
  }]
}
