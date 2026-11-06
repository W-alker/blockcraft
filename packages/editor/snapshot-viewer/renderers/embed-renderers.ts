import {resolveEmbedFrameSize} from '../../blocks/embed-blocks/components/embed-sizing';
import {createBlockShell} from "../dom/create-block-shell";
import {createBookmarkEnhancementTask, createIframeEnhancementTask} from "../enhancers";
import {SnapshotBlockRenderer, SnapshotRenderContext} from "../types";
import {createUnifiedEmbedRenderer} from './unified-embed-renderer';

const EMBED_FLAVOURS = new Set([
  "figma-embed",
  "juejin-embed",
]);

export function createEmbedRenderers(): SnapshotBlockRenderer[] {
  return [createUnifiedEmbedRenderer(), {
    canRender: snapshot => snapshot.flavour === 'bookmark',
    render: (ctx, snapshot) => renderBookmark(snapshot, ctx),
  }, {
    canRender: (snapshot) => EMBED_FLAVOURS.has(snapshot.flavour),
    render(ctx, snapshot) {
      switch (snapshot.flavour) {
        case "figma-embed":
          return renderIframeCard(snapshot, ctx, resolveFigmaUrl(`${snapshot.props["url"] || ""}`))
        case "juejin-embed":
          return renderIframeCard(snapshot, ctx, `${snapshot.props["url"] || ""}`)
        default:
          return {element: createBlockShell(snapshot)}
      }
    },
    patch(ctx, current, next) {
      const shell = createBlockShell(next)
      shell.classList.add('embed-frame-block')
      current.element.className = shell.className
      current.element.style.cssText = shell.style.cssText
      const url = `${next.props['url'] || ''}`
      const iframeUrl = next.flavour === 'figma-embed' ? resolveFigmaUrl(url) : url
      if (current.snapshot.props['url'] !== next.props['url']) {
        const fresh = renderIframeCard(next, ctx, iframeUrl).element
        current.element.replaceChildren(...Array.from(fresh.childNodes))
      } else {
        const card = current.element.querySelector<HTMLElement>('embed-frame-card')!
        const size = resolveEmbedFrameSize(next.props)
        card.style.width = size.width
        card.style.height = size.height
        card.style.aspectRatio = size.aspectRatio
        const wrapper = card.querySelector<HTMLElement>('.iframe-wrapper')!
        if (iframeUrl && !wrapper.querySelector('iframe')) {
          ctx.scheduleEnhancement(createIframeEnhancementTask(wrapper, iframeUrl, `iframe:${next.id}:${iframeUrl}`))
        }
      }
    },
  }]
}

function renderBookmark(snapshot: any, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const props = snapshot.props as Record<string, unknown>

  const content = document.createElement("div")
  content.classList.add("bookmark-content")

  const titleRow = document.createElement("div")
  titleRow.classList.add("bookmark-title")

  const iconContainer = document.createElement("div")
  iconContainer.classList.add("bookmark-icon")
  const icon = document.createElement("img")
  icon.alt = ""
  if (props["icon"]) {
    setImageSource(icon, `${props["icon"]}`, ctx)
    iconContainer.append(icon)
  } else {
    const fallbackIcon = document.createElement("i")
    fallbackIcon.className = "bc_icon bc_wangluo"
    iconContainer.append(fallbackIcon)
  }

  const title = document.createElement("h3")
  title.classList.add("title")
  title.textContent = `${props["title"] || props["url"] || ""}`
  titleRow.append(iconContainer, title)

  const description = document.createElement("p")
  description.classList.add("bookmark-description")
  description.textContent = `${props["description"] || "暂无更多信息"}`

  const link = document.createElement("a")
  link.classList.add("bookmark-link")
  link.target = "_blank"
  link.href = `${props["url"] || ""}`
  const linkText = document.createElement("span")
  linkText.textContent = hostName(`${props["url"] || ""}`)
  const linkIcon = document.createElement("i")
  linkIcon.className = "bc_icon bc_tiaozhuan"
  link.append(linkText, linkIcon)

  content.append(titleRow, description, link)

  const banner = document.createElement("div")
  banner.classList.add("bookmark-banner")
  if (props["image"]) {
    const image = document.createElement("img")
    setImageSource(image, `${props["image"]}`, ctx)
    banner.append(image)
  } else {
    banner.append(createBookmarkPlaceholder())
  }

  element.append(content, banner)

  const task = createBookmarkEnhancementTask(
    ctx.options,
    `${props["url"] || ""}`,
    element,
    `bookmark:${snapshot.id}:${props["url"] || ""}`,
    (value) => {
      if (value["title"]) {
        title.textContent = `${value["title"]}`
      }
      if (value["description"]) {
        description.textContent = `${value["description"]}`
      }
      if (value["icon"]) {
        iconContainer.replaceChildren(icon)
        setImageSource(icon, `${value["icon"]}`, ctx)
      }
      if (value["image"]) {
        const image = banner.querySelector("img") ?? document.createElement("img")
        if (!banner.contains(image)) {
          banner.replaceChildren(image)
        }
        setImageSource(image as HTMLImageElement, `${value["image"]}`, ctx)
      }
    }
  )
  if (task) {
    ctx.scheduleEnhancement(task)
  }

  return {element}
}

function createBookmarkPlaceholder(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("width", "340")
  svg.setAttribute("height", "170")
  svg.setAttribute("viewBox", "0 0 340 170")
  svg.setAttribute("fill", "none")
  svg.setAttribute("aria-hidden", "true")

  const shapes = [
    [
      "path",
      "M0.000108291 4C4.84837e-05 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4L340.005 170H0.00460238L0.000108291 4Z",
      "#F4F4F5",
    ],
    [
      "path",
      "M47.4226 181.578L133.723 53.5251C136.164 49.904 141.057 48.9089 144.718 51.2892L345.111 181.578H47.4226Z",
      "#C0BFC1",
    ],
    [
      "path",
      "M0.00305283 184.375L71.1716 78.1816C73.6115 74.5409 78.5267 73.5413 82.195 75.9397L248.044 184.375H0.00305283Z",
      "#E3E2E4",
    ],
  ] as const
  shapes.forEach(([tag, d, fill]) => {
    const shape = document.createElementNS("http://www.w3.org/2000/svg", tag)
    shape.setAttribute("d", d)
    shape.setAttribute("fill", fill)
    svg.append(shape)
  })

  const ellipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse")
  ellipse.setAttribute("cx", "19.6135")
  ellipse.setAttribute("cy", "19.8036")
  ellipse.setAttribute("rx", "19.6135")
  ellipse.setAttribute("ry", "19.8036")
  ellipse.setAttribute("transform", "matrix(1 0 2.70729e-05 1 38 17)")
  ellipse.setAttribute("fill", "#C0BFC1")
  svg.append(ellipse)
  return svg
}

function renderIframeCard(snapshot: any, ctx: SnapshotRenderContext, iframeUrl: string) {
  const element = createBlockShell(snapshot)
  element.classList.add("embed-frame-block")

  const card = document.createElement("embed-frame-card")
  const size = resolveEmbedFrameSize(snapshot.props)
  card.style.width = size.width
  card.style.height = size.height
  card.style.aspectRatio = size.aspectRatio

  const iframeWrapper = document.createElement("div")
  iframeWrapper.classList.add("iframe-wrapper")
  const mask = document.createElement("div")
  mask.classList.add("iframe-mask")
  iframeWrapper.append(mask)

  card.append(iframeWrapper)
  element.append(card)

  if (iframeUrl) {
    ctx.scheduleEnhancement(createIframeEnhancementTask(iframeWrapper, iframeUrl, `iframe:${snapshot.id}:${iframeUrl}`))
  }

  return {element}
}

function resolveFigmaUrl(url: string): string {
  if (!url) {
    return ""
  }
  return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`
}

function hostName(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function setImageSource(image: HTMLImageElement, value: string, ctx: SnapshotRenderContext) {
  image.setAttribute("src", resolveAssetUrl(value, ctx))
}

function resolveAssetUrl(url: string, ctx: SnapshotRenderContext) {
  if (!url) {
    return ""
  }

  if (!ctx.options.baseUrl) {
    return url
  }

  try {
    return new URL(url, ctx.options.baseUrl).toString()
  } catch {
    return url
  }
}
