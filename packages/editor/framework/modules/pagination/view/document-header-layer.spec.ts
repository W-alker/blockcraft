import {DocumentHeaderLayer} from './document-header-layer';

describe('DocumentHeaderLayer object hit testing', () => {
  let surface: HTMLDivElement;
  let original: HTMLDivElement;
  let header: HTMLElement;
  let root: HTMLDivElement;
  let layer: DocumentHeaderLayer;

  beforeEach(() => {
    surface = document.createElement('div');
    surface.style.cssText = 'position:fixed;left:8px;top:8px;width:400px;height:300px;isolation:isolate;z-index:9999';
    original = document.createElement('div');
    header = document.createElement('header');
    header.style.cssText = 'height:140px;background:blue';
    original.appendChild(header);
    root = document.createElement('div');
    // Same stacking boundaries as the paginated root and its placement plane.
    root.style.cssText = 'position:absolute;top:150px;left:50%;transform:translateX(-50%);width:360px;height:120px;z-index:1;isolation:isolate';
    surface.append(original, root);
    document.body.appendChild(surface);
    layer = new DocumentHeaderLayer(surface, root, {element: header}, () => {});
  });

  afterEach(() => {
    layer.destroy();
    surface.remove();
  });

  it('keeps an overlapping object handle clickable while uncovered header controls remain reachable', () => {
    const coverButton = document.createElement('button');
    coverButton.textContent = 'Cover';
    coverButton.style.cssText = 'position:absolute;left:250px;top:20px;width:60px;height:24px';
    header.appendChild(coverButton);
    const object = document.createElement('div');
    object.style.cssText = 'position:absolute;left:40px;top:-65px;width:80px;height:60px;z-index:2;background:red';
    const handle = document.createElement('button');
    handle.textContent = 'Drag';
    handle.style.cssText = 'position:absolute;left:20px;top:-7px;width:40px;height:14px;z-index:5';
    object.appendChild(handle);
    root.appendChild(object);
    layer.mount({top: 0, width: 360});

    expect(hitCenter(handle)).toBe(handle);
    expect(hitCenter(coverButton)).toBe(coverButton);
    layer.updateLayout({top: 10, width: 340});
    expect(hitCenter(handle)).toBe(handle);
    expect(hitCenter(coverButton)).toBe(coverButton);
  });

  it('preserves root under/flow/over order and restores the original header on teardown', () => {
    const originalStyle = header.getAttribute('style');
    const under = document.createElement('div');
    const flow = document.createElement('div');
    const over = document.createElement('div');
    for (const [index, element] of [under, flow, over].entries()) {
      element.style.cssText = `position:absolute;left:20px;top:20px;width:80px;height:50px;z-index:${index}`;
      root.appendChild(element);
    }
    layer.mount({top: 0, width: 360});
    expect(hitCenter(over)).toBe(over);
    over.remove();
    expect(hitCenter(flow)).toBe(flow);
    flow.remove();
    expect(hitCenter(under)).toBe(under);

    layer.destroy();
    expect(header.parentElement).toBe(original);
    expect(header.getAttribute('style')).toBe(originalStyle);
    expect(header.classList.contains('bc-pagination-document-header')).toBeFalse();
  });
});

function hitCenter(element: HTMLElement): Element | null {
  const rect = element.getBoundingClientRect();
  return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
}


describe('DocumentHeaderLayer layout measurement', () => {
  let surface: HTMLDivElement;
  let header: HTMLElement;
  let root: HTMLDivElement;
  let layer: DocumentHeaderLayer;
  let originalResizeObserver: typeof ResizeObserver;
  let deliverResize: (borderBoxSize?: unknown) => void;
  let heights: number[];

  beforeEach(() => {
    originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        deliverResize = borderBoxSize => callback([
          {target: header, borderBoxSize} as unknown as ResizeObserverEntry,
        ], this);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
    surface = document.createElement('div');
    surface.style.cssText = 'position:fixed;left:0;top:0;width:400px;transform-origin:top left';
    header = document.createElement('header');
    header.style.height = '100px';
    root = document.createElement('div');
    surface.append(header, root);
    document.body.appendChild(surface);
    heights = [];
    layer = new DocumentHeaderLayer(surface, root, {element: header}, height => heights.push(height));
  });

  afterEach(() => {
    layer.destroy();
    surface.remove();
    window.ResizeObserver = originalResizeObserver;
  });

  const entryShapes = [
    {name: 'standard array', size: (height: number) => [{blockSize: height, inlineSize: 360}]},
    {name: 'legacy single object', size: (height: number) => ({blockSize: height, inlineSize: 360})},
    {name: 'missing border box', size: (_height: number) => undefined},
  ];

  for (const shape of entryShapes) {
    for (const scale of [0.5, 1.5]) {
      it(`keeps ${shape.name} notifications in layout pixels at ${scale * 100}% zoom`, () => {
        surface.style.zoom = String(scale);
        layer.mount({top: 0, width: 360});
        expect(header.offsetHeight).toBe(100);
        expect(header.getBoundingClientRect().height).toBeCloseTo(100 * scale, 2);

        deliverResize(shape.size(100));
        expect(layer.measure()).toBe(100);
        deliverResize(shape.size(100));
        expect(heights).toEqual([100]);
      });
    }

    it(`keeps half-pixel ${shape.name} measurements stable and reports real changes once`, () => {
      header.style.height = '100.5px';
      surface.style.transform = 'scale(1.5)';
      layer.mount({top: 0, width: 360});
      const initialHeight = header.offsetHeight;
      expect(header.getBoundingClientRect().height).toBeCloseTo(150.75, 2);

      deliverResize(shape.size(100.5));
      expect(layer.measure()).toBe(initialHeight);
      deliverResize(shape.size(100.5));
      expect(heights).toEqual([initialHeight]);

      header.style.height = '123.5px';
      const changedHeight = header.offsetHeight;
      deliverResize(shape.size(123.5));
      expect(layer.measure()).toBe(changedHeight);
      deliverResize(shape.size(123.5));
      expect(heights).toEqual([initialHeight, changedHeight]);
    });
  }

  it('reports a hidden header as zero and restores its layout height when shown', () => {
    surface.style.zoom = '1.5';
    layer.mount({top: 0, width: 360});
    header.style.display = 'none';
    deliverResize();
    expect(layer.measure()).toBe(0);
    header.style.removeProperty('display');
    deliverResize();
    expect(layer.measure()).toBe(100);
    expect(heights).toEqual([100, 0, 100]);
  });
});
