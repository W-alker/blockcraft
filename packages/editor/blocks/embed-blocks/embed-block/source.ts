/** Embedded content stays data until the sandboxed iframe boundary. */
export interface ResolvedEmbedUrl {url: string; iframeUrl: string; platform: string}

export function normalizeEmbedUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > 8192 || /[\u0000-\u0020\u007f]/.test(text)) return null
  try {
    const url = new URL(text.startsWith('//') ? `https:${text}` : text)
    return ['https:', 'http:'].includes(url.protocol) && url.hostname && !url.username && !url.password && url.href.length <= 8192 ? url.href : null
  } catch { return null }
}

const hostIs = (url: URL, ...hosts: string[]) => hosts.includes(url.hostname.toLowerCase())
const result = (url: URL, iframeUrl: string, platform: string): ResolvedEmbedUrl => ({url: url.href, iframeUrl, platform})
function timeInSeconds(value: string | null): number | null {
  if (!value) return null
  if (/^\d+$/.test(value)) return Number(value)
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  return match && match[0] ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : null
}

/** Pure, bounded resolution shared by the editor and readonly snapshots. */
export function resolveEmbedUrl(value: unknown): ResolvedEmbedUrl | null {
  const normalized = normalizeEmbedUrl(value)
  if (!normalized) return null
  const url = new URL(normalized)
  if (url.port) return result(url, url.href, '网页')
  const path = url.pathname
  let match: RegExpExecArray | null
  // Figma Embed Kit 2.0; generated embed links remain intact.
  if (hostIs(url, 'embed.figma.com')) return result(url, url.href, 'Figma')
  if (hostIs(url, 'figma.com', 'www.figma.com')) {
    if (path === '/embed') return result(url, url.href, 'Figma')
    if (/^\/(design|file|board|proto)\/[\w-]+(?:\/.*)?$/.test(path)) {
      const embed = new URL(url.href)
      embed.hostname = 'embed.figma.com'
      embed.protocol = 'https:'
      embed.pathname = path.replace(/^\/file\//, '/design/')
      embed.searchParams.set('embed-host', 'blockcraft')
      return result(url, embed.href, 'Figma')
    }
  }
  if (hostIs(url, 'player.bilibili.com')) return result(url, url.href, '哔哩哔哩')
  if (hostIs(url, 'bilibili.com', 'www.bilibili.com', 'm.bilibili.com')) {
    match = /^\/video\/(BV[\w]+|av\d+)\/?$/.exec(path)
    if (match) {
      const embed = new URL('https://player.bilibili.com/player.html')
      embed.searchParams.set(match[1].startsWith('BV') ? 'bvid' : 'aid', match[1].replace(/^av/, ''))
      for (const key of ['p', 't']) {
        const value = url.searchParams.get(key)
        if (value && /^\d+$/.test(value)) embed.searchParams.set(key === 'p' ? 'page' : key, value)
      }
      embed.searchParams.set('autoplay', '0')
      return result(url, embed.href, '哔哩哔哩')
    }
  }
  if (hostIs(url, 'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com')) {
    if (path.startsWith('/embed/')) return result(url, url.href, 'YouTube')
    const id = hostIs(url, 'youtu.be') ? path.slice(1) : url.searchParams.get('v') || /^\/(?:shorts|live)\/([\w-]+)/.exec(path)?.[1]
    const list = url.searchParams.get('list')
    if ((id && /^[\w-]{11}$/.test(id)) || (list && /^[\w-]+$/.test(list))) {
      const embed = new URL(`https://www.youtube-nocookie.com/embed/${id && /^[\w-]{11}$/.test(id) ? id : 'videoseries'}`)
      if (list && /^[\w-]+$/.test(list)) embed.searchParams.set('list', list)
      const start = timeInSeconds(url.searchParams.get('t') || url.searchParams.get('start'))
      if (start !== null && Number.isSafeInteger(start)) embed.searchParams.set('start', String(start))
      return result(url, embed.href, 'YouTube')
    }
  }
  if (hostIs(url, 'player.vimeo.com')) return result(url, url.href, 'Vimeo')
  if (hostIs(url, 'vimeo.com', 'www.vimeo.com')) {
    match = /^\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d+)(?:\/([\da-f]+))?\/?$/.exec(path)
    if (match) {
      const embed = new URL(`https://player.vimeo.com/video/${match[1]}`)
      const hash = url.searchParams.get('h') || match[2]
      if (hash) embed.searchParams.set('h', hash)
      return result(url, embed.href, 'Vimeo')
    }
  }
  if (hostIs(url, 'loom.com', 'www.loom.com')) {
    match = /^\/(share|embed)\/([\w-]+)\/?$/.exec(path)
    if (match) {
      const embed = new URL(url.href)
      embed.pathname = `/embed/${match[2]}`
      return result(url, embed.href, 'Loom')
    }
  }
  if (hostIs(url, 'miro.com', 'www.miro.com')) {
    match = /^\/app\/(board|live-embed)\/([^/]+)\/?$/.exec(path)
    if (match) {
      const embed = new URL(url.href)
      embed.pathname = `/app/live-embed/${match[2]}/`
      return result(url, embed.href, 'Miro')
    }
  }
  if (hostIs(url, 'codepen.io', 'www.codepen.io')) {
    match = /^\/([\w-]+)\/(pen|full|embed)\/([\w-]+)\/?$/.exec(path)
    if (match) {
      const embed = new URL(url.href)
      embed.pathname = `/${match[1]}/embed/${match[3]}`
      if (!embed.searchParams.has('default-tab')) embed.searchParams.set('default-tab', 'result')
      return result(url, embed.href, 'CodePen')
    }
  }
  if (hostIs(url, 'jsfiddle.net', 'www.jsfiddle.net')) {
    if (path.includes('/embedded/')) return result(url, url.href, 'JSFiddle')
    if (/^\/(?:[\w-]+\/)?[\w]+(?:\/\d+)?\/?$/.test(path)) {
      const embed = new URL(url.href)
      embed.pathname = `${path.replace(/\/$/, '')}/embedded/result,js,html,css/`
      return result(url, embed.href, 'JSFiddle')
    }
  }
  if (hostIs(url, 'open.spotify.com')) {
    match = /^\/(?:intl-[\w-]+\/)?(?:embed\/)?(track|album|playlist|artist|episode|show)\/([\w]+)\/?$/.exec(path)
    if (match) {
      const embed = new URL(url.href)
      embed.pathname = `/embed/${match[1]}/${match[2]}`
      return result(url, embed.href, 'Spotify')
    }
  }
  if (hostIs(url, 'w.soundcloud.com')) return result(url, url.href, 'SoundCloud')
  if (hostIs(url, 'soundcloud.com', 'www.soundcloud.com') && /^\/[^/]+\/[^/]+/.test(path)) {
    const embed = new URL('https://w.soundcloud.com/player/')
    embed.searchParams.set('url', url.href)
    embed.searchParams.set('auto_play', 'false')
    return result(url, embed.href, 'SoundCloud')
  }
  if (hostIs(url, 'drive.google.com')) {
    match = /^\/file\/d\/([^/]+)(?:\/(?:view|edit|preview))?\/?$/.exec(path)
    if (match) {
      const embed = new URL(url.href)
      embed.pathname = `/file/d/${match[1]}/preview`
      return result(url, embed.href, 'Google Drive')
    }
  }
  // Published Google documents have a different public ID; never invent it.
  if (hostIs(url, 'docs.google.com')) {
    match = /^\/(document|spreadsheets|presentation)\/d\/(e\/)?([^/]+)\/(edit|view|pub|pubhtml|preview|embed)\/?$/.exec(path)
    if (match) {
      const embed = new URL(url.href)
      const suffix = match[2] ? (match[1] === 'presentation' ? 'embed' : match[4]) : match[1] === 'presentation' ? 'embed' : 'preview'
      embed.pathname = `/${match[1]}/d/${match[2] || ''}${match[3]}/${suffix}`
      if (match[2] && match[1] !== 'presentation') embed.searchParams.set('embedded', 'true')
      return result(url, embed.href, 'Google 文档')
    }
    if (/^\/forms\/d\/(?:e\/)?[^/]+\/viewform\/?$/.test(path)) {
      const embed = new URL(url.href)
      embed.searchParams.set('embedded', 'true')
      return result(url, embed.href, 'Google 表单')
    }
  }
  return result(url, url.href, hostIs(url, 'juejin.cn', 'www.juejin.cn') ? '掘金' : '网页')
}
