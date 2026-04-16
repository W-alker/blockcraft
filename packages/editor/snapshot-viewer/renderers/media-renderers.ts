import {IBlockSnapshot} from "../../framework/block-std/types/block.type";
import {InlineModel} from "../../framework/block-std/types/inline.type";
import katex from "katex";
import {createBlockShell} from "../dom/create-block-shell";
import {
  createFormulaEnhancementTask,
  createIframeEnhancementTask,
  createImageEnhancementTask,
  createMediaSourceEnhancementTask,
  createMermaidEnhancementTask,
} from "../enhancers";
import {SnapshotBlockRenderer, SnapshotRenderContext} from "../types";

const MEDIA_FLAVOURS = new Set([
  "image",
  "video",
  "audio",
  "attachment",
  "formula",
  "mermaid",
]);

export function createMediaRenderers(): SnapshotBlockRenderer[] {
  return [{
    canRender: (snapshot) => MEDIA_FLAVOURS.has(snapshot.flavour),
    render(ctx, snapshot) {
      switch (snapshot.flavour) {
        case "image":
          return renderImage(snapshot, ctx)
        case "video":
          return renderVideo(snapshot, ctx)
        case "audio":
          return renderAudio(snapshot, ctx)
        case "attachment":
          return renderAttachment(snapshot, ctx)
        case "formula":
          return renderFormula(snapshot, ctx)
        case "mermaid":
          return renderMermaid(snapshot, ctx)
        default:
          return {element: createBlockShell(snapshot)}
      }
    },
  }]
}

function renderImage(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const props = snapshot.props as Record<string, unknown>

  const figure = document.createElement("figure")
  figure.classList.add("image-block__container")
  figure.dataset["align"] = `${props["align"] || "left"}`

  const wrapper = document.createElement("div")
  wrapper.classList.add("img-wrapper")

  const img = document.createElement("img")
  img.loading = "lazy"
  if (props["width"]) {
    img.style.width = `${props["width"]}px`
  }
  if (props["height"]) {
    img.style.height = `${props["height"]}px`
  }
  wrapper.append(img)

  const src = resolveUrl(`${props["src"] || ""}`, ctx.options.baseUrl)
  if (src) {
    ctx.scheduleEnhancement(createImageEnhancementTask(img, src, `image:${snapshot.id}:${src}`))
  } else {
    const placeholder = document.createElement("div")
    placeholder.classList.add("upload-hint")
    placeholder.textContent = "点击插入图片"
    wrapper.replaceChildren(placeholder)
  }

  const childrenContainer = document.createElement("div")
  childrenContainer.classList.add("children-render-container")
  const imageChildren = snapshot.children as IBlockSnapshot[]
  imageChildren.forEach((child) => childrenContainer.append(ctx.renderBlock(child)))

  figure.append(wrapper, childrenContainer)
  element.append(figure)
  return {element}
}

function renderVideo(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const props = snapshot.props as Record<string, unknown>
  const url = resolveUrl(`${props["url"] || ""}`, ctx.options.baseUrl)
  if (!url) {
    element.append(createEmptyMediaState("video"))
    return {element}
  }

  const wrapper = document.createElement("div")
  wrapper.classList.add("video-block__wrapper", "resizable-container")
  if (props["width"]) {
    wrapper.style.width = `${props["width"]}px`
  }

  const container = document.createElement("div")
  container.classList.add("video-block__container")

  if (isEmbedVideo(url, `${props["sourceType"] || ""}`)) {
    const embed = document.createElement("div")
    embed.classList.add("embed-container")
    container.append(embed)

    const embedUrl = toVideoEmbedUrl(url)
    if (embedUrl) {
      ctx.scheduleEnhancement(createIframeEnhancementTask(embed, embedUrl, `video-iframe:${snapshot.id}:${embedUrl}`))
    }
  } else if (isDirectVideo(url, props["type"])) {
    const videoWrapper = document.createElement("div")
    videoWrapper.classList.add("video-wrapper")
    const video = document.createElement("video")
    video.controls = true
    video.preload = "metadata"
    if (props["poster"]) {
      video.poster = `${props["poster"]}`
    }
    videoWrapper.append(video)
    container.append(videoWrapper)
    ctx.scheduleEnhancement(createMediaSourceEnhancementTask(video, url, `video:${snapshot.id}:${url}`))
  } else {
    const preview = document.createElement("div")
    preview.classList.add("video-link-preview")
    preview.innerHTML = `<div class="link-info"><div class="link-title">视频链接</div><a class="link-url" target="_blank" rel="noopener noreferrer" href="${escapeAttribute(url)}">${escapeHtml(url)}</a><div class="link-hint">点击链接在新窗口打开视频</div></div>`
    container.append(preview)
  }

  wrapper.append(container)
  element.append(wrapper)
  return {element}
}

function renderAudio(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const props = snapshot.props as Record<string, unknown>
  const url = resolveUrl(`${props["url"] || ""}`, ctx.options.baseUrl)
  if (!url) {
    element.append(createEmptyMediaState("audio"))
    return {element}
  }

  const wrapper = document.createElement("div")
  wrapper.classList.add("audio-block__wrapper")

  const player = document.createElement("div")
  player.classList.add("audio-player")

  const info = document.createElement("div")
  info.classList.add("audio-info")
  if (props["name"]) {
    const name = document.createElement("div")
    name.classList.add("audio-name")
    name.textContent = `${props["name"]}`
    info.append(name)
  }

  const audio = document.createElement("audio")
  audio.controls = true
  audio.preload = "metadata"
  info.append(audio)
  player.append(info)
  wrapper.append(player)
  element.append(wrapper)

  ctx.scheduleEnhancement(createMediaSourceEnhancementTask(audio, url, `audio:${snapshot.id}:${url}`))
  return {element}
}

function renderAttachment(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const props = snapshot.props as Record<string, unknown>

  const iconWrapper = document.createElement("div")
  iconWrapper.classList.add("attachment-block__icon-wrapper")
  const iconName = `${props["icon"] || ""}`
  if (iconName && ctx.options.resolveSvgIcon) {
    const matIcon = document.createElement("mat-icon")
    matIcon.setAttribute("svgIcon", iconName)
    matIcon.setAttribute("role", "img")
    matIcon.setAttribute("aria-hidden", "true")
    matIcon.classList.add("mat-icon", "notranslate")
    iconWrapper.append(matIcon)

    ctx.scheduleEnhancement({
      key: `attachment-icon:${snapshot.id}:${iconName}`,
      target: matIcon,
      policy: "eager",
      load: (signal: AbortSignal) => ctx.options.resolveSvgIcon!(iconName, signal),
      apply: (value: SVGElement | null) => {
        if (!value) {
          return
        }
        matIcon.setAttribute("data-mat-icon-type", "svg")
        matIcon.setAttribute("data-mat-icon-name", iconName)
        matIcon.replaceChildren(value.cloneNode(true))
      },
    })
  } else {
    const icon = document.createElement("i")
    icon.className = `${props["icon"] || "bc_icon bc_wenjian-color"}`
    iconWrapper.append(icon)
  }

  const info = document.createElement("div")
  info.classList.add("attachment-block__info")

  const name = document.createElement("div")
  name.classList.add("attachment-block__name")
  name.textContent = `${props["name"] || "附件"}`

  const size = document.createElement("div")
  size.classList.add("attachment-block__size")
  size.textContent = formatFileSize(Number(props["size"] || 0))

  info.append(name, size)
  element.append(iconWrapper, info)
  return {element}
}

function renderFormula(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const props = snapshot.props as Record<string, unknown>

  const container = document.createElement("div")
  container.classList.add("formula-block-container")
  const display = document.createElement("div")
  display.classList.add("formula-display")

  const latex = `${props["latex"] || ""}`
  if (!latex) {
    display.innerHTML = '<span class="formula-placeholder"><span class="formula-placeholder-icon">T<sub>E</sub>X</span> 添加数学公式</span>'
  } else {
    try {
      katex.render(latex, display, {
        displayMode: true,
        throwOnError: false,
        output: "mathml",
      })
    } catch {
      display.textContent = latex
    }

    const customTask = createFormulaEnhancementTask(
      ctx.options,
      latex,
      display,
      `formula:${snapshot.id}:${latex}`
    )
    if (customTask) {
      ctx.scheduleEnhancement(customTask)
    }
  }

  container.append(display)
  element.append(container)
  return {element}
}

function renderMermaid(snapshot: IBlockSnapshot, ctx: SnapshotRenderContext) {
  const element = createBlockShell(snapshot)
  const props = snapshot.props as Record<string, unknown>
  const mode = `${props["mode"] || "text"}`
  element.setAttribute("data-mode", mode)

  const head = document.createElement("div")
  head.classList.add("head")
  const label = document.createElement("div")
  label.classList.add("btn")
  label.textContent = "Mermaid"
  head.append(label)

  const content = document.createElement("div")
  content.classList.add("content")

  const textContainer = document.createElement("div")
  textContainer.classList.add("text-container", "children-render-container")
  const mermaidChildren = snapshot.children as IBlockSnapshot[]
  mermaidChildren.forEach((child) => textContainer.append(ctx.renderBlock(child)))

  const graphContainer = document.createElement("div")
  graphContainer.classList.add("graph-container")
  const graphCon = document.createElement("div")
  graphCon.classList.add("graph-con")
  graphContainer.append(graphCon)

  content.append(textContainer, graphContainer)
  element.append(head, content)

  const source = collectMermaidSource(snapshot)
  if (mode !== "text") {
    const task = createMermaidEnhancementTask(
      ctx.options,
      source,
      graphCon,
      `mermaid:${snapshot.id}:${source}`
    )
    if (task) {
      ctx.scheduleEnhancement(task)
    } else if (!source.trim()) {
      graphCon.textContent = "Mermaid"
    } else {
      graphCon.textContent = source
    }
  }

  return {element}
}

function createEmptyMediaState(kind: "video" | "audio") {
  const wrapper = document.createElement("div")
  wrapper.classList.add("bc-snapshot-empty-state", `bc-snapshot-empty-state--${kind}`)

  const icon = document.createElement("i")
  icon.className = `bc_icon ${kind === "video" ? "bc_shipin" : "bc_yinpin"}`

  const title = document.createElement("div")
  title.classList.add("bc-snapshot-empty-state__title")
  title.textContent = kind === "video" ? "无视频资源" : "无音频资源"

  wrapper.append(icon, title)
  return wrapper
}

function collectMermaidSource(snapshot: IBlockSnapshot): string {
  const children = snapshot.children as IBlockSnapshot[]
  const textarea = children[0]
  if (!textarea) {
    return ""
  }
  const content = textarea.children as InlineModel
  return content
    .map((item: InlineModel[number]) => typeof item.insert === "string" ? item.insert : "")
    .join("")
}

function resolveUrl(url: string, baseUrl?: string): string {
  if (!url) {
    return ""
  }
  if (!baseUrl) {
    return url
  }

  try {
    return new URL(url, baseUrl).toString()
  } catch {
    return url
  }
}

function isEmbedVideo(url: string, sourceType: string): boolean {
  if (sourceType === "embed") {
    return true
  }
  return /youtube\.com|youtu\.be|bilibili\.com|b23\.tv|vimeo\.com|youku\.com/.test(url)
}

function toVideoEmbedUrl(url: string): string | null {
  const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/)
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}?rel=0`
  }

  const bilibiliMatch = url.match(/(?:bilibili\.com\/video\/|b23\.tv\/)(BV[a-zA-Z0-9]+)/)
  if (bilibiliMatch) {
    return `https://player.bilibili.com/player.html?bvid=${bilibiliMatch[1]}&page=1&high_quality=1&danmaku=0&autoplay=0`
  }

  const vimeoMatch = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/)
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  }

  return url
}

function isDirectVideo(url: string, type: unknown): boolean {
  if (typeof type === "string" && type.startsWith("video/")) {
    return true
  }
  return /\.(mp4|webm|ogg|mov|avi|mkv|m4v|3gp)(\?.*)?$/i.test(url)
}

function formatFileSize(size: number): string {
  if (!size) {
    return "0 B"
  }
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function escapeAttribute(value: string): string {
  return escapeHtml(value)
}
