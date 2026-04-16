import {createBlockShell} from "../dom/create-block-shell";
import {createBookmarkEnhancementTask, createIframeEnhancementTask} from "../enhancers";
import {SnapshotBlockRenderer, SnapshotRenderContext} from "../types";

const EMBED_FLAVOURS = new Set([
  "bookmark",
  "figma-embed",
  "juejin-embed",
]);

export function createEmbedRenderers(): SnapshotBlockRenderer[] {
  return [{
    canRender: (snapshot) => EMBED_FLAVOURS.has(snapshot.flavour),
    render(ctx, snapshot) {
      switch (snapshot.flavour) {
        case "bookmark":
          return renderBookmark(snapshot, ctx)
        case "figma-embed":
          return renderIframeCard(snapshot, ctx, "Figma", "bc_Figma", resolveFigmaUrl(`${snapshot.props["url"] || ""}`))
        case "juejin-embed":
          return renderIframeCard(snapshot, ctx, "掘金", "bc_juejin", `${snapshot.props["url"] || ""}`)
        default:
          return {element: createBlockShell(snapshot)}
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
    banner.textContent = ""
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

function renderIframeCard(snapshot: any, ctx: SnapshotRenderContext, brandTitle: string, brandIcon: string, iframeUrl: string) {
  const element = createBlockShell(snapshot)
  element.classList.add("embed-frame-block")

  const card = document.createElement("embed-frame-card")
  if (snapshot.props.width) {
    card.style.width = `${snapshot.props.width}px`
  }
  if (snapshot.props.height) {
    card.style.height = `${snapshot.props.height}px`
  }

  const iframeWrapper = document.createElement("div")
  iframeWrapper.classList.add("iframe-wrapper")
  const mask = document.createElement("div")
  mask.classList.add("iframe-mask")
  iframeWrapper.append(mask)

  const brand = document.createElement("div")
  brand.classList.add("iframe-brand")
  const brandIconEl = document.createElement("i")
  brandIconEl.className = `bc_icon ${brandIcon}`
  const brandLabel = document.createElement("span")
  brandLabel.textContent = brandTitle
  brand.append(brandIconEl, brandLabel)

  const link = document.createElement("a")
  link.classList.add("iframe-link")
  link.target = "_blank"
  link.href = `${snapshot.props.url || ""}`
  const linkText = document.createElement("span")
  linkText.textContent = hostName(`${snapshot.props.url || ""}`)
  const linkIcon = document.createElement("i")
  linkIcon.className = "bc_icon bc_tiaozhuan"
  link.append(linkText, linkIcon)

  card.append(iframeWrapper, brand, link)
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
