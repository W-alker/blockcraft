import {normalizeObjectAnimation, storeObjectAnimation} from './config';

describe('object animation CSS contract', () => {
  it('round trips CSS shorthand with seconds, arbitrary token order and timing functions', () => {
    const config = normalizeObjectAnimation('1s cubic-bezier(.22, 1, .36, 1) 200ms infinite alternate both bc-slide-in-left')!;
    expect(config).toEqual({effect: 'slide', duration: 1000, delay: 200, iterations: 'infinite', direction: 'left', easing: 'cubic-bezier(.22, 1, .36, 1)', playbackDirection: 'alternate', fill: 'both'});
    const stored = storeObjectAnimation(config)!;
    expect(normalizeObjectAnimation(stored)).toEqual(config);
    const element = document.createElement('div');
    element.style.animation = stored;
    expect(element.style.animationName).toBe('bc-slide-in-left');
    expect(element.style.animationIterationCount).toBe('infinite');
  });
  it('uses a single CSS field and removes the disabled setting', () => {
    expect(storeObjectAnimation({effect: 'fade'})).toBe('bc-fade-in 600ms ease-out 0ms 1 normal both');
    expect(storeObjectAnimation(null)).toBeNull();
    expect(storeObjectAnimation('bc-fade-in 1s')).toBe('bc-fade-in 1000ms ease 0ms 1 normal none');
  });
  it('rejects unsupported keyframes, compound animations and invalid CSS tokens', () => {
    for (const value of ['none', 'fade 600 0 1', 'evil 1s', 'bc-fade-in 1s, bc-pulse 2s', 'bc-fade-in 1s url(x)', 'bc-fade-in 1s ease linear', 'bc-fade-in 1s cubic-bezier(2,0,1,1)']) {
      expect(normalizeObjectAnimation(value)).withContext(value).toBeNull();
    }
  });
  it('bounds authored timing without persisting playback state', () => {
    expect(normalizeObjectAnimation({effect: 'pulse', duration: Infinity, delay: -1, iterations: 100})).toEqual({
      effect: 'pulse', duration: 600, delay: 0, iterations: 10, direction: 'up', easing: 'ease-out', playbackDirection: 'normal', fill: 'both',
    });
  });
});
