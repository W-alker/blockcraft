import {
  createComponent,
  createEnvironmentInjector,
  EnvironmentInjector,
  importProvidersFrom,
  Injector,
  NgZone,
  PLATFORM_ID,
  Type,
} from '@angular/core'
import {BrowserModule} from '@angular/platform-browser'
import {DOCUMENT} from '@angular/common'
import {IBlockSnapshot} from '../../framework/block-std/types/block.type'
import {DATE_CARD_BOX_STYLE, readDateCardLook} from '../../blocks/dynamic-material-blocks/date-card/date-card-look.util'
import {partsOf} from '../../blocks/dynamic-material-blocks/date-card/date-card-parts.util'
import {DATE_CARD_WATCHED_PROPS} from '../../blocks/dynamic-material-blocks/date-card/date-card-render.component'
import {readPersonCardLook, PERSON_CARD_WATCHED_PROPS} from '../../blocks/dynamic-material-blocks/person-card/person-card-render.component'
import {PERSON_CARD_BOX_STYLE} from '../../blocks/dynamic-material-blocks/person-card/person-card-view.util'
import {personCardContentScale, personCardFonts} from '../../blocks/dynamic-material-blocks/person-card/person-card-layout'
import {readFrozenPersonCardData} from '../../blocks/dynamic-material-blocks/dynamic-material-data'
import {readWeatherLook} from '../../blocks/dynamic-material-blocks/weather/weather-look.util'
import {readFrozenWeather} from '../../blocks/dynamic-material-blocks/weather/weather-anchor.const'
import {WEATHER_WATCHED_PROPS} from '../../blocks/dynamic-material-blocks/weather/weather-render.component'
import {WEATHER_STYLES} from '../../blocks/dynamic-material-blocks/weather/weather.styles'
import {WeatherCardComponent} from '../../blocks/dynamic-material-blocks/weather/weather-card.component'
import {projectDraftProps} from '../../blocks/dynamic-material-blocks/draft-props'
import {
  materialStyleFixedSize,
  migrateLegacyMaterialFixedSize,
  type MaterialStyle,
} from '../../blocks/dynamic-material-blocks/kernel/material-styles.util'
import {createBlockShell} from '../dom/create-block-shell'
import {SnapshotBlockRenderer, SnapshotRenderContext} from '../types'

export function createMaterialRenderers(): SnapshotBlockRenderer[] {
  return [{
    canRender: snapshot => snapshot.flavour === 'date-card' || snapshot.flavour === 'person-card' || snapshot.flavour === 'weather',
    render: (ctx, snapshot) => ({element: renderMaterial(snapshot, ctx)}),
    patch(ctx, current, next) {
      const fresh = renderMaterial(next, ctx)
      const target = current.element
      for (const name of target.getAttributeNames()) target.removeAttribute(name)
      for (const name of fresh.getAttributeNames()) target.setAttribute(name, fresh.getAttribute(name)!)
      target.replaceChildren(...Array.from(fresh.childNodes))
    },
  }]
}

// Share Angular's display-only providers across cards, but release them when
// the final mounted card is removed. No editor document or Yjs store is made.
let cardEnvironment: EnvironmentInjector | null = null
let mountedCardCount = 0

function acquireCardEnvironment(): EnvironmentInjector {
  if (!cardEnvironment) {
    cardEnvironment = createEnvironmentInjector(
      [
        importProvidersFrom(BrowserModule),
        {provide: DOCUMENT, useValue: document},
        {provide: PLATFORM_ID, useValue: 'browser'},
        {provide: NgZone, useFactory: () => new NgZone({enableLongStackTrace: false})},
      ],
      Injector.NULL as EnvironmentInjector,
    )
  }
  mountedCardCount++
  return cardEnvironment
}

function releaseCardEnvironment(): void {
  if (--mountedCardCount === 0) {
    cardEnvironment?.destroy()
    cardEnvironment = null
  }
}

function renderMaterial(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext): HTMLElement {
  switch (snapshot.flavour) {
    case 'date-card': return renderDateCard(snapshot, ctx)
    case 'person-card': return renderPersonCard(snapshot, ctx)
    default: return renderWeather(snapshot, ctx)
  }
}

function renderDateCard(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext): HTMLElement {
  const element = createBlockShell(snapshot)
  const props = presentationProps(snapshot, DATE_CARD_WATCHED_PROPS)
  const look = readDateCardLook(props as Parameters<typeof readDateCardLook>[0])
  const {width, height, unit} = resolveMaterialGeometry(props, look.style, look.format)
  setBlockGeometry(element, width, height)

  const box = document.createElement('div')
  box.classList.add('tpl-date-card')
  box.contentEditable = 'false'
  box.setAttribute('data-bc-selection-interaction-frame', '')
  box.dataset['style'] = look.style.id
  box.style.cssText = DATE_CARD_BOX_STYLE
  box.style.setProperty('--u', `${unit}px`)
  setOptionalStyle(box, '--dc-bg', look.bg)
  setOptionalStyle(box, '--dc-fg', look.fg)
  box.style.setProperty('--dc-bw', look.bw)
  box.style.setProperty('--dc-bs', look.bs)
  box.style.setProperty('--dc-bc', look.bc)
  setOptionalStyle(box, 'font-family', look.fontFamily)
  box.style.setProperty('--dc-font-day', `${look.fontSizes.day}`)
  box.style.setProperty('--dc-font-primary', `${look.fontSizes.primary}`)
  box.style.setProperty('--dc-font-secondary', `${look.fontSizes.secondary}`)

  mountCardComponent(look.style.component, box, ctx, {
    parts: partsOf(typeof props['date'] === 'string' ? props['date'] : null),
    format: look.format,
  })
  element.append(box)
  return element
}

function renderPersonCard(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext): HTMLElement {
  const element = createBlockShell(snapshot)
  const props = presentationProps(snapshot, PERSON_CARD_WATCHED_PROPS)
  const look = readPersonCardLook(props, readFrozenPersonCardData(props['person']))
  const {width, height, unit} = resolveMaterialGeometry(props, look.style, null)
  setBlockGeometry(element, width, height)
  element.style.setProperty('--pc-scale', `${personCardContentScale(props, unit)}`)

  const box = document.createElement('div')
  box.className = 'tpl-person-card'
  box.contentEditable = 'false'
  box.setAttribute('data-bc-selection-interaction-frame', '')
  box.dataset['style'] = look.style.id
  box.style.cssText = PERSON_CARD_BOX_STYLE
  box.style.setProperty('--pc-color', look.color)
  box.style.setProperty('--pc-avatar-radius', look.avatarRadius)
  box.style.setProperty('--pc-avatar-scale', look.avatarScale)
  box.style.setProperty('--pc-border-size', `${Number.parseFloat(look.bw) || 0}`)
  box.style.setProperty('--pc-bs', look.bs)
  box.style.setProperty('--pc-bc', look.bc)
  const fontSizes: Record<string, number> = {name: 15, pinyin: 9.5, desc: 12}
  for (const font of personCardFonts(look.style.id, props)) fontSizes[font.role] = font.size
  box.style.setProperty('--pc-name-size', `${fontSizes['name']}`)
  box.style.setProperty('--pc-pinyin-size', `${fontSizes['pinyin']}`)
  box.style.setProperty('--pc-desc-size', `${fontSizes['desc']}`)
  const viewport = document.createElement('div')
  viewport.className = 'person-card__viewport'
  mountCardComponent(look.style.component, viewport, ctx, {view: look.view})
  box.append(viewport)
  element.append(box)
  return element
}

function renderWeather(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext): HTMLElement {
  const element = createBlockShell(snapshot)
  const props = presentationProps(snapshot, WEATHER_WATCHED_PROPS)
  const look = readWeatherLook(props)
  const style = WEATHER_STYLES.resolve(look.style)
  const {width, height, unit} = resolveMaterialGeometry(props, style, null)
  setBlockGeometry(element, width, height)

  const box = document.createElement('span')
  box.className = 'tpl-weather-chip'
  box.contentEditable = 'false'
  box.setAttribute('data-bc-selection-interaction-frame', '')
  box.dataset['style'] = look.style
  box.style.cssText = 'position:relative;display:block;width:100%;height:100%;box-sizing:border-box;padding:calc(4 * var(--u,1px));border-radius:calc(6 * var(--u,1px));max-width:100%;line-height:1.2;'
  box.style.setProperty('--u', `${unit}px`)
  box.style.setProperty('--wt-fg', look.fg)
  box.style.setProperty('--wt-accent', look.accent)
  box.style.setProperty('--wt-line', look.line)
  box.style.setProperty('--wt-bg', look.bg)
  box.style.color = look.fg
  box.style.borderWidth = look.bw
  box.style.borderStyle = look.bs
  box.style.borderColor = look.bc
  const weather = typeof props['date'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(props['date'])
    ? readFrozenWeather(props['frozen']) : null
  mountCardComponent(WeatherCardComponent, box, ctx, {
    layout: look.style, weather, status: 'idle', showRange: look.showRange, iconMode: look.iconMode,
  })
  element.append(box)
  return element
}

function presentationProps(snapshot: IBlockSnapshot, keys: readonly string[]): Record<string, unknown> {
  return projectDraftProps(snapshot.props as Record<string, unknown>, snapshot.meta as Record<string, unknown>, keys)
}

function setBlockGeometry(element: HTMLElement, width: number, height: number): void {
  element.style.width = `${width}px`
  element.style.height = `${height}px`
  element.style.maxWidth = '100%'
}

function resolveMaterialGeometry(
  props: Record<string, unknown>,
  style: MaterialStyle,
  variant: string | null,
): {width: number; height: number; unit: number} {
  const fallback = materialStyleFixedSize(style, variant)
  const fixedWidth = positive(props['width'])
  const fixedHeight = positive(props['height'])
  const legacyUnit = positive(props['u'])
  const width = fixedWidth ?? (legacyUnit === null
    ? fallback.width
    : fallback.width * legacyUnit / (style.baseU || 1))
  const legacyRatio = positive(props['ar'])
  const height = fixedHeight ?? (legacyUnit !== null
    ? fallback.height * legacyUnit / (style.baseU || 1)
    : legacyRatio !== null
      ? width / legacyRatio
      : fallback.height * width / fallback.width)
  const migrated = fixedWidth !== null && fixedHeight !== null
    ? migrateLegacyMaterialFixedSize(style, variant, {width, height})
    : null
  const resolved = migrated ?? {width, height}
  return {
    ...resolved,
    unit: (style.baseU || 1) * resolved.width / fallback.width,
  }
}

function positive(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function setOptionalStyle(element: HTMLElement, name: string, value: string | null): void {
  if (value !== null) element.style.setProperty(name, value)
}

function mountCardComponent(
  component: Type<unknown>,
  container: HTMLElement,
  ctx: SnapshotRenderContext,
  inputs: Record<string, unknown>,
): void {
  const environment = acquireCardEnvironment()
  const host = document.createElement(component === WeatherCardComponent ? 'bc-weather-card' : 'div')
  let ref: ReturnType<typeof createComponent> | null = null
  try {
    const mounted = createComponent(component, {environmentInjector: environment, hostElement: host})
    ref = mounted
    for (const [name, value] of Object.entries(inputs)) {
      ;(mounted.instance as Record<string, unknown>)[name] = value
    }
    mounted.changeDetectorRef.detectChanges()
    container.append(host)
    ctx.registerDisposable?.(host, () => {
      mounted.destroy()
      releaseCardEnvironment()
    })
  } catch (error) {
    ref?.destroy()
    releaseCardEnvironment()
    throw error
  }
}
