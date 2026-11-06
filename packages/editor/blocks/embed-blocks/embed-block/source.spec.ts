import {normalizeEmbedUrl, resolveEmbedUrl} from './source'

describe('unified embed sources', () => {
  const examples = [
    ['https://www.figma.com/design/abc/Test?node-id=1-2', 'https://embed.figma.com/design/abc/Test?node-id=1-2&embed-host=blockcraft', 'Figma'],
    ['https://www.figma.com/file/abc/Test', 'https://embed.figma.com/design/abc/Test?embed-host=blockcraft', 'Figma'],
    ['https://www.figma.com/proto/abc/Test?page-id=0%3A1', 'https://embed.figma.com/proto/abc/Test?page-id=0%3A1&embed-host=blockcraft', 'Figma'],
    ['https://www.bilibili.com/video/BV1B7411m7LV?p=2', 'https://player.bilibili.com/player.html?bvid=BV1B7411m7LV&page=2&autoplay=0', '哔哩哔哩'],
    ['https://www.bilibili.com/video/av123/', 'https://player.bilibili.com/player.html?aid=123&autoplay=0', '哔哩哔哩'],
    ['https://youtu.be/M7lc1UVf-VE?t=1m30s', 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?start=90', 'YouTube'],
    ['https://www.youtube.com/watch?v=M7lc1UVf-VE', 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE', 'YouTube'],
    ['https://www.youtube.com/shorts/M7lc1UVf-VE', 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE', 'YouTube'],
    ['https://vimeo.com/76979871/abcdef1234', 'https://player.vimeo.com/video/76979871?h=abcdef1234', 'Vimeo'],
    ['https://www.loom.com/share/abc123?t=10', 'https://www.loom.com/embed/abc123?t=10', 'Loom'],
    ['https://miro.com/app/board/o9J_kkQxX78=/?moveToWidget=12', 'https://miro.com/app/live-embed/o9J_kkQxX78=/?moveToWidget=12', 'Miro'],
    ['https://codepen.io/alice/pen/abcdef', 'https://codepen.io/alice/embed/abcdef?default-tab=result', 'CodePen'],
    ['https://jsfiddle.net/zalun/NmudS/2/', 'https://jsfiddle.net/zalun/NmudS/2/embedded/result,js,html,css/', 'JSFiddle'],
    ['https://open.spotify.com/intl-zh/track/abc123?si=x', 'https://open.spotify.com/embed/track/abc123?si=x', 'Spotify'],
    ['https://soundcloud.com/alice/song', 'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Falice%2Fsong&auto_play=false', 'SoundCloud'],
    ['https://www.youtube.com/playlist?list=PLabc123', 'https://www.youtube-nocookie.com/embed/videoseries?list=PLabc123', 'YouTube'],
    ['https://docs.google.com/document/d/abc/edit', 'https://docs.google.com/document/d/abc/preview', 'Google 文档'],
    ['https://docs.google.com/spreadsheets/d/e/abc/pubhtml?gid=1', 'https://docs.google.com/spreadsheets/d/e/abc/pubhtml?gid=1&embedded=true', 'Google 文档'],
    ['https://drive.google.com/file/d/abc/view?resourcekey=secret', 'https://drive.google.com/file/d/abc/preview?resourcekey=secret', 'Google Drive'],
    ['https://docs.google.com/presentation/d/e/2PACX/pub?start=false', 'https://docs.google.com/presentation/d/e/2PACX/embed?start=false', 'Google 文档'],
    ['https://docs.google.com/forms/d/e/abc/viewform', 'https://docs.google.com/forms/d/e/abc/viewform?embedded=true', 'Google 表单'],
  ]
  for (const [input, expected, platform] of examples) {
    it(`resolves ${platform}: ${input}`, () => {
      const resolved = resolveEmbedUrl(input)!
      expect(resolved.iframeUrl).toBe(expected)
      expect(resolved.platform).toBe(platform)
      expect(resolved.url).toBe(input)
    })
  }
  it('preserves generated embeds and their access parameters', () => {
    for (const url of [
      'https://embed.figma.com/proto/abc?embed-host=existing&node-id=1-2',
      'https://www.figma.com/embed?embed_host=share&url=https%3A%2F%2Fwww.figma.com%2Ffile%2Fabc',
      'https://player.bilibili.com/player.html?bvid=BV1B7411m7LV&page=2',
      'https://player.vimeo.com/video/123?h=secret',
      'https://www.youtube.com/embed/M7lc1UVf-VE?start=30',
    ]) expect(resolveEmbedUrl(url)!.iframeUrl).toBe(url)
  })
  it('keeps arbitrary URLs and host lookalikes as generic web embeds', () => {
    for (const url of ['https://example.com/page?q=1#section', 'https://youtube.com.evil.example/watch?v=M7lc1UVf-VE', 'http://127.0.0.1:9000/demo', 'https://www.figma.com:9000/design/abc/Test']) {
      expect(resolveEmbedUrl(url)).toEqual({url, iframeUrl: url, platform: '网页'})
    }
  })
  it('accepts protocol-relative iframe sources but rejects active schemes and credentials', () => {
    expect(normalizeEmbedUrl('//player.bilibili.com/player.html')).toBe('https://player.bilibili.com/player.html')
    for (const value of ['', 'javascript:alert(1)', 'data:text/html,<script></script>', 'file:///tmp/a', 'https://a:b@example.com', 'https://example.com/\npage', {}]) {
      expect(normalizeEmbedUrl(value)).toBeNull()
      expect(resolveEmbedUrl(value)).toBeNull()
    }
  })
  it('accepts HTML file links and rejects raw HTML as a URL', () => {
    const url = 'https://example.com/report.html?version=2#details'
    expect(resolveEmbedUrl(url)).toEqual({url, iframeUrl: url, platform: '网页'})
    expect(normalizeEmbedUrl('<h1>示例</h1>')).toBeNull()
    expect(normalizeEmbedUrl('https://example.com/?q=' + '中'.repeat(1000))).toBeNull()
  })
})
