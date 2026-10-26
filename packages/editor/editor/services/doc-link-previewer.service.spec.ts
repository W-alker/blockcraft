import {DocLinkPreviewerService, isAbortError} from './doc-link-previewer.service';
import {DocWeatherService} from './doc-weather.service';

describe('default host query services', () => {
  let service: DocLinkPreviewerService;
  let fetchSpy: jasmine.Spy<typeof fetch>;

  beforeEach(() => {
    service = new DocLinkPreviewerService();
    fetchSpy = spyOn(window, 'fetch');
    spyOn(console, 'error');
  });

  it('keeps the link endpoint, cancellation signal and HTML-to-text projection', async () => {
    fetchSpy.and.resolveTo(new Response(JSON.stringify({
      title: '<b>Title &amp; text</b>', description: '<em>Description</em>',
      favicons: ['icon-1', 'icon-2'], images: ['image-1', 'image-2'],
    })));
    const signal = new AbortController().signal;
    expect(await service.query('https://example.com', signal)).toEqual({
      title: 'Title & text', description: 'Description', icon: 'icon-1', image: 'image-1',
    });
    expect(fetchSpy).toHaveBeenCalledOnceWith(
      'https://affine-worker.toeverything.workers.dev/api/worker/link-preview',
      {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{"url":"https://example.com"}', signal},
    );
  });

  it('keeps absent preview fields nullable or undefined', async () => {
    fetchSpy.and.resolveTo(new Response('{}'));
    expect(await service.query('https://example.com')).toEqual({
      title: null, description: null, icon: undefined, image: undefined,
    });
  });

  it('returns an empty preview without logging when normal requests are aborted', async () => {
    const error = new DOMException('aborted', 'AbortError');
    fetchSpy.and.rejectWith(error);
    expect(isAbortError(error)).toBeTrue();
    expect(isAbortError({name: 'AbortError'})).toBeFalse();
    expect(await service.query('https://example.com')).toEqual({});
    expect(console.error).not.toHaveBeenCalled();
  });

  it('keeps the empty fallback and error logging for failed HTTP responses', async () => {
    fetchSpy.and.resolveTo(new Response('', {status: 503}));
    expect(await service.query('https://example.com')).toEqual({});
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it('does not silently swallow malformed successful response JSON', async () => {
    fetchSpy.and.resolveTo(new Response('invalid json'));
    await expectAsync(service.query('https://example.com')).toBeRejected();
  });

  it('keeps the Twitter adapter and photo/banner fallback', async () => {
    const tweet = {author: {name: 'Author', avatar_url: 'avatar', banner_url: 'banner'}, text: 'Tweet'};
    fetchSpy.and.resolveTo(new Response(JSON.stringify({tweet})));
    const signal = new AbortController().signal;
    expect(await service.query('https://x.com/user/status/123', signal)).toEqual({
      title: 'Author', icon: 'avatar', description: 'Tweet', image: 'banner',
    });
    expect(fetchSpy).toHaveBeenCalledWith('https://api.fxtwitter.com/status/123', {signal});
    fetchSpy.and.resolveTo(new Response(JSON.stringify({tweet: {...tweet, media: {photos: [{url: 'photo'}]}}})));
    expect((await service.query('https://twitter.com/user/status/123')).image).toBe('photo');
  });

  it('preserves Twitter abort handling separately from normal link requests', async () => {
    fetchSpy.and.rejectWith(new DOMException('aborted', 'AbortError'));
    expect(await service.query('https://x.com/user/status/123')).toEqual({});
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it('keeps the explicit unconfigured weather rejection', async () => {
    await expectAsync(new DocWeatherService().query())
      .toBeRejectedWithError('DocWeatherService is not configured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
