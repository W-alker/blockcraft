import {
  ObjectDrawInsertController,
  type ObjectDrawInsertGeometry,
} from "./object-draw-insert.controller";

describe("ObjectDrawInsertController", () => {
  const makeHarness = (
    options: { padding?: string; scrollRect?: DOMRect } = {},
  ) => {
    const scrollContainer = document.createElement("div");
    scrollContainer.dataset["bcObjectDrawTestScrollContainer"] = "true";
    const root = document.createElement("div");
    const surface = document.createElement("div");
    if (options.padding) surface.style.padding = options.padding;
    root.appendChild(surface);
    scrollContainer.appendChild(root);
    document.body.appendChild(scrollContainer);

    const rootRect = new DOMRect(100, 50, 800, 600);
    spyOn(root, "getBoundingClientRect").and.returnValue(rootRect);
    spyOn(scrollContainer, "getBoundingClientRect").and.returnValue(
      options.scrollRect ?? rootRect,
    );
    spyOn(surface, "getBoundingClientRect").and.returnValue(
      new DOMRect(100, 50, 800, 600),
    );
    Object.defineProperty(surface, "clientWidth", {
      configurable: true,
      value: 400,
    });

    const commit = jasmine.createSpy("commit");
    const doc = {
      isReadonly: false,
      root: {
        hostElement: root,
        childrenRenderRef: { containerElement: surface },
      },
      scrollContainer,
      logger: { warn: jasmine.createSpy("warn") },
    } as any;
    const controller = new ObjectDrawInsertController(doc);
    const arm = () =>
      controller.arm({
        defaultWidth: 180,
        defaultHeight: 100,
        commit,
      });
    const layer = () =>
      document.querySelector<HTMLElement>(
        '[data-bc-object-draw-layer="true"]',
      )!;

    return { root, scrollContainer, commit, controller, arm, layer };
  };

  afterEach(() => {
    document
      .querySelectorAll('[data-bc-object-draw-layer="true"]')
      .forEach((element) => element.remove());
    document
      .querySelectorAll('[data-bc-object-draw-test-scroll-container="true"]')
      .forEach((element) => element.remove());
  });

  it("commits the scale-normalized drag rectangle only on pointer release", async () => {
    const { root, commit, controller, arm, layer } = makeHarness();
    expect(arm()).toBeTrue();

    layer().dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        button: 0,
        isPrimary: true,
        clientX: 200,
        clientY: 150,
        bubbles: true,
        cancelable: true,
      }),
    );
    layer().dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: 600,
        clientY: 350,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(commit).not.toHaveBeenCalled();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    const preview = document.querySelector<HTMLElement>(
      '[data-bc-object-draw-preview="true"]',
    )!;
    expect(preview.style.display).toBe("block");
    expect(preview.style.width).toBe("400px");
    expect(preview.style.height).toBe("200px");

    layer().dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 1,
        button: 0,
        clientX: 600,
        clientY: 350,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(commit).toHaveBeenCalledTimes(1);
    const geometry = commit.calls.mostRecent()
      .args[0] as ObjectDrawInsertGeometry;
    expect(geometry.width).toBe(200);
    expect(geometry.height).toBe(100);
    expect(geometry.anchorRect.left).toBe(200);
    expect(geometry.anchorRect.top).toBe(150);
    expect(
      document.querySelector('[data-bc-object-draw-layer="true"]'),
    ).toBeNull();

    controller.destroy();
    root.remove();
  });

  it("uses the object defaults for a click without a drag", () => {
    const { root, commit, controller, arm, layer } = makeHarness();
    expect(arm()).toBeTrue();

    layer().dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 2,
        button: 0,
        isPrimary: true,
        clientX: 300,
        clientY: 250,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(commit).not.toHaveBeenCalled();

    layer().dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 2,
        button: 0,
        clientX: 302,
        clientY: 251,
        bubbles: true,
        cancelable: true,
      }),
    );

    const geometry = commit.calls.mostRecent()
      .args[0] as ObjectDrawInsertGeometry;
    expect(geometry.width).toBe(180);
    expect(geometry.height).toBe(100);
    expect(geometry.anchorRect.left).toBe(300);
    expect(geometry.anchorRect.top).toBe(250);

    controller.destroy();
    root.remove();
  });

  it("cancels the armed tool on Escape without mutating the document", () => {
    const { root, commit, controller, arm } = makeHarness();
    expect(arm()).toBeTrue();

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(commit).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-bc-object-draw-layer="true"]'),
    ).toBeNull();

    controller.destroy();
    root.remove();
  });

  it("ignores scroll events from an unrelated dropdown overlay", () => {
    const { root, commit, controller, arm, layer } = makeHarness();
    const overlay = document.createElement("div");
    document.body.appendChild(overlay);
    expect(arm()).toBeTrue();

    overlay.dispatchEvent(new Event("scroll"));

    expect(layer()).not.toBeNull();
    expect(commit).not.toHaveBeenCalled();

    controller.destroy();
    overlay.remove();
    root.remove();
  });

  it("draws onto the editor padding instead of snapping into the content box", () => {
    // Padding 40/24 over a 2x visual scale puts the content origin at
    // (148, 130); the click below lands on the padding, left of and above it.
    const { root, commit, controller, arm, layer } = makeHarness({
      padding: "40px 24px",
    });
    expect(arm()).toBeTrue();

    layer().dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 5,
        button: 0,
        isPrimary: true,
        clientX: 110,
        clientY: 60,
        bubbles: true,
        cancelable: true,
      }),
    );
    layer().dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 5,
        button: 0,
        clientX: 110,
        clientY: 60,
        bubbles: true,
        cancelable: true,
      }),
    );

    const geometry = commit.calls.mostRecent()
      .args[0] as ObjectDrawInsertGeometry;
    expect(geometry.anchorRect.left).toBe(110);
    expect(geometry.anchorRect.top).toBe(60);

    controller.destroy();
    root.remove();
  });

  it("still stops at the scroll container edge, not at the content edge", () => {
    const { root, commit, controller, arm, layer } = makeHarness({
      padding: "40px 24px",
    });
    expect(arm()).toBeTrue();

    layer().dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 6,
        button: 0,
        isPrimary: true,
        clientX: -400,
        clientY: -400,
        bubbles: true,
        cancelable: true,
      }),
    );
    layer().dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 6,
        button: 0,
        clientX: -400,
        clientY: -400,
        bubbles: true,
        cancelable: true,
      }),
    );

    const geometry = commit.calls.mostRecent()
      .args[0] as ObjectDrawInsertGeometry;
    // The scroll container corner: the object never leaves the drawing viewport.
    expect(geometry.anchorRect.left).toBe(100);
    expect(geometry.anchorRect.top).toBe(50);

    controller.destroy();
    root.remove();
  });

  it("uses the scroll container instead of root as the drawing boundary", () => {
    const { root, scrollContainer, commit, controller, arm, layer } =
      makeHarness({ scrollRect: new DOMRect(40, 20, 1000, 720) });
    expect(arm()).toBeTrue();
    expect(layer().style.left).toBe("40px");
    expect(layer().style.top).toBe("20px");
    expect(layer().style.width).toBe("1000px");
    expect(layer().style.height).toBe("720px");

    layer().dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 7,
        button: 0,
        isPrimary: true,
        clientX: 950,
        clientY: 700,
        bubbles: true,
        cancelable: true,
      }),
    );
    layer().dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 7,
        button: 0,
        clientX: 950,
        clientY: 700,
        bubbles: true,
        cancelable: true,
      }),
    );

    const geometry = commit.calls.mostRecent()
      .args[0] as ObjectDrawInsertGeometry;
    expect(geometry.anchorRect.left).toBe(680);
    expect(geometry.anchorRect.top).toBe(540);
    expect(geometry.anchorRect.right).toBe(1040);
    expect(geometry.anchorRect.bottom).toBe(740);

    controller.destroy();
    scrollContainer.remove();
    root.remove();
  });

  it("cancels when the editor drawing surface scrolls", () => {
    const { root, scrollContainer, commit, controller, arm } = makeHarness();
    expect(arm()).toBeTrue();

    scrollContainer.dispatchEvent(new Event("scroll"));

    expect(
      document.querySelector('[data-bc-object-draw-layer="true"]'),
    ).toBeNull();
    expect(commit).not.toHaveBeenCalled();

    controller.destroy();
    root.remove();
  });
});
