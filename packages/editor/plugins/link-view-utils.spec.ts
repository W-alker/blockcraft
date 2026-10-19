import {getEmbedViewFlavour} from './link-view-utils'

describe('link view embed capability', () => {
  const schemas = (...flavours: string[]) => ({has: (flavour: string) => flavours.includes(flavour)})

  it('uses the unified schema for webpages, HTML files and platform links', () => {
    for (const url of ['https://example.com/report.html', 'https://www.figma.com/design/abc/Report', 'https://juejin.cn/post/123']) {
      expect(getEmbedViewFlavour(url, schemas('embed', 'figma-embed', 'juejin-embed'))).toBe('embed')
    }
  })

  it('retains legacy platform conversion for manually assembled hosts', () => {
    const legacy = schemas('figma-embed', 'juejin-embed')
    expect(getEmbedViewFlavour('https://www.figma.com/file/abcdefghijklmnopqrstuv/Report', legacy)).toBe('figma-embed')
    expect(getEmbedViewFlavour('https://juejin.cn/post/123', legacy)).toBe('juejin-embed')
    expect(getEmbedViewFlavour('https://example.com/report.html', legacy)).toBeNull()
  })

  it('does not expose an embed target for unsupported URLs or missing schemas', () => {
    for (const url of ['mailto:test@example.com', 'javascript:alert(1)', '<iframe></iframe>']) {
      expect(getEmbedViewFlavour(url, schemas('embed'))).toBeNull()
    }
    expect(getEmbedViewFlavour('https://example.com/report.html', schemas('bookmark'))).toBeNull()
  })
})
