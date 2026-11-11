import {Injector} from '@angular/core'
import {getEmbedViewFlavour, resolveLinkBlockTarget, LinkBlockMenuState} from './link-view-utils'
import {Subject} from 'rxjs'
import {LINK_BLOCK_RESOLVER, type LinkBlockResolver, type LinkBlockTarget} from './link-block-resolver'

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


describe('link to registered block resolution', () => {
  const url = 'https://example.com/report.html'
  const attachment: LinkBlockTarget<'attachment'> = {kind: 'block' as const, label: '附件预览', flavour: 'attachment' as const,
    params: [{url: 'https://example.com/file.pdf', name: '报告.pdf', type: 'application/pdf', size: 42}]}
  function create(resolver?: LinkBlockResolver, flavours = ['embed', 'attachment']) {
    return {
      injector: Injector.create({providers: resolver ? [{provide: LINK_BLOCK_RESOLVER, useValue: resolver}] : []}),
      schemas: {has: (flavour: string) => flavours.includes(flavour),
        get: (flavour: string) => ({nodeType: flavour === 'root' ? 'root' : 'void'})},
      onDestroy$: new Subject<void>(), isDestroyed: false
    } as unknown as BlockCraft.Doc
  }
  const context = () => ({phase: 'menu' as const, signal: new AbortController().signal})

  it('preserves builtin fallback without a resolver and when explicitly unhandled', async () => {
    expect((await resolveLinkBlockTarget(url, create(), context()))?.flavour).toBe('embed')
    expect((await resolveLinkBlockTarget(url, create({resolve: () => ({kind: 'unhandled'})}), context()))?.flavour).toBe('embed')
  })

  it('accepts a registered host target and supplies normalized URL, phase and cancellation', async () => {
    const resolve = jasmine.createSpy('resolve').and.returnValue(attachment)
    const ctx = context()
    expect(await resolveLinkBlockTarget('  //EXAMPLE.com/report.html  ', create({resolve}), ctx)).toEqual(attachment)
    expect(resolve).toHaveBeenCalledOnceWith(url, ctx)
  })

  it('never falls back for blocked, failed, malformed or unregistered targets', async () => {
    expect(await resolveLinkBlockTarget(url, create({resolve: () => ({kind: 'blocked'})}), context())).toBeNull()
    expect(await resolveLinkBlockTarget(url, create({resolve: () => attachment}, ['embed']), context())).toBeNull()
    await expectAsync(resolveLinkBlockTarget(url, create({resolve: () => {throw new Error('拒绝访问')}}), context())).toBeRejectedWithError('拒绝访问')
    await expectAsync(resolveLinkBlockTarget(url, create({resolve: () => ({kind: 'unknown'} as any)}), context())).toBeRejected()
  })

  it('does not invoke host resolution for invalid or cancelled inputs', async () => {
    const resolve = jasmine.createSpy('resolve').and.returnValue(attachment)
    const doc = create({resolve})
    expect(await resolveLinkBlockTarget('javascript:alert(1)', doc, context())).toBeNull()
    const controller = new AbortController(); controller.abort()
    expect(await resolveLinkBlockTarget(url, doc, {phase: 'convert', signal: controller.signal})).toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('discards late async results after cancellation', async () => {
    let finish!: (value: typeof attachment) => void
    const doc = create({resolve: () => new Promise(resolve => finish = resolve)})
    const controller = new AbortController()
    const pending = resolveLinkBlockTarget(url, doc, {phase: 'convert', signal: controller.signal})
    controller.abort(); finish(attachment)
    expect(await pending).toBeNull()
  })

  it('isolates document resolvers and rejects root targets', async () => {
    const deny = create({resolve: () => ({kind: 'blocked'})})
    const allow = create({resolve: () => attachment})
    expect(await resolveLinkBlockTarget(url, deny, context())).toBeNull()
    expect((await resolveLinkBlockTarget(url, allow, context()))?.flavour).toBe('attachment')
    expect(await resolveLinkBlockTarget(url, create({resolve: () => ({...attachment, flavour: 'root'} as any)}, ['root']), context())).toBeNull()
  })

  it('menu loading, cancellation and errors cannot expose stale actions', async () => {
    let finish!: (value: typeof attachment) => void
    const pendingDoc = create({resolve: () => new Promise(resolve => finish = resolve)})
    const state = new LinkBlockMenuState()
    state.load(url, pendingDoc)
    expect(state.loading()).toBeTrue()
    state.cancel(); finish(attachment)
    for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(state.target()).toBeNull()
    expect(state.loading()).toBeFalse()
    state.load(url, create({resolve: () => Promise.reject(new Error('失败'))}))
    for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(state.failed()).toBeTrue()
    expect(state.target()).toBeNull()
    state.cancel()
  })
})
