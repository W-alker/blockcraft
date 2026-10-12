import { expect, test, type Page } from "@playwright/test";

const editorSelector = "block-craft-editor";

test.beforeEach(async ({page}) => {
  await page.routeWebSocket('**', socket => socket.close());
});

async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction((selector) => {
    const editor = document.querySelector(selector);
    const debug = (
      window as unknown as {
        ng?: {
          getComponent: (target: Element) => {
            doc?: { isInitialized?: boolean };
          };
        };
      }
    ).ng;
    return !!editor && !!debug?.getComponent(editor)?.doc?.isInitialized;
  }, editorSelector);
}

test("fixed toolbar draws a shape without editor focus or selection", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "初始化", exact: true }).click();
  await waitForEditor(page);

  const beforeIds = await page.evaluate((selector) => {
    const editor = document.querySelector(selector)!;
    const debug = (
      window as unknown as {
        ng: { getComponent: (target: Element) => { doc: any } };
      }
    ).ng;
    const doc = debug.getComponent(editor).doc;
    doc.selection.blur();
    if (doc.selection.value !== null) {
      throw new Error("Editor selection did not clear before drawing");
    }
    return doc.placement
      .getAbsoluteBlockIds()
      .filter((id: string) => doc.model.getFlavour(id) === "shape");
  }, editorSelector);

  const trigger = page.locator('bc-fixed-toolbar [aria-label="插入形状"]');
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await page.locator('[data-shape-type="diamond"]').click();

  const drawLayer = page.locator('[data-bc-object-draw-layer="true"]');
  await expect(drawLayer).toBeVisible();
  expect(
    await page.evaluate((selector) => {
      const editor = document.querySelector(selector)!;
      const debug = (
        window as unknown as {
          ng: { getComponent: (target: Element) => { doc: any } };
        }
      ).ng;
      const doc = debug.getComponent(editor).doc;
      return doc.placement
        .getAbsoluteBlockIds()
        .filter((id: string) => doc.model.getFlavour(id) === "shape").length;
    }, editorSelector),
  ).toBe(beforeIds.length);

  const layerBox = await drawLayer.boundingBox();
  if (!layerBox) throw new Error("Drawing layer has no visual bounds");
  const start = {
    x: layerBox.x + Math.min(140, layerBox.width / 3),
    y: layerBox.y + Math.min(160, layerBox.height / 3),
  };
  const end = { x: start.x + 220, y: start.y + 120 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await expect(
    page.locator('[data-bc-object-draw-preview="true"]'),
  ).toBeVisible();
  await page.mouse.up();
  await expect(drawLayer).toHaveCount(0);

  const inserted = await page.evaluate(
    ({ selector, oldIds }) => {
      const editor = document.querySelector(selector)!;
      const debug = (
        window as unknown as {
          ng: { getComponent: (target: Element) => { doc: any } };
        }
      ).ng;
      const doc = debug.getComponent(editor).doc;
      const id = doc.placement
        .getAbsoluteBlockIds()
        .find(
          (candidate: string) =>
            doc.model.getFlavour(candidate) === "shape" &&
            !oldIds.includes(candidate),
        );
      if (!id) return null;
      const props = doc.model.getProps(id);
      const host = doc.getBlockById(id).hostElement.getBoundingClientRect();
      return {
        id,
        shapeType: props.shape,
        width: props.width,
        height: props.height,
        visualWidth: host.width,
        visualHeight: host.height,
        selectedId: doc.selection.value?.firstBlockId ?? null,
      };
    },
    { selector: editorSelector, oldIds: beforeIds },
  );

  expect(inserted).not.toBeNull();
  expect(inserted!.shapeType).toBe("diamond");
  expect(inserted!.width).toBe(220);
  expect(inserted!.height).toBe(120);
  expect(inserted!.visualWidth).toBeCloseTo(220, 0);
  expect(inserted!.visualHeight).toBeCloseTo(120, 0);
  expect(inserted!.selectedId).toBe(inserted!.id);
});

test("fixed toolbar draws WordArt after choosing a preset", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "初始化", exact: true }).click();
  await waitForEditor(page);

  const trigger = page.locator('bc-fixed-toolbar [aria-label="插入艺术字"]');
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await page.locator('[data-preset-id="ocean"]').click();

  const drawLayer = page.locator('[data-bc-object-draw-layer="true"]');
  await expect(drawLayer).toBeVisible();
  const layerBox = await drawLayer.boundingBox();
  if (!layerBox) throw new Error("Drawing layer has no visual bounds");

  const start = {
    x: layerBox.x + Math.min(140, layerBox.width / 3),
    y: layerBox.y + Math.min(160, layerBox.height / 3),
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 240, start.y + 100, { steps: 4 });
  await page.mouse.up();
  await expect(drawLayer).toHaveCount(0);

  const inserted = await page.evaluate((selector) => {
    const editor = document.querySelector(selector)!;
    const debug = (
      window as unknown as {
        ng: { getComponent: (target: Element) => { doc: any } };
      }
    ).ng;
    const doc = debug.getComponent(editor).doc;
    const id = doc.placement
      .getAbsoluteBlockIds()
      .find(
        (candidate: string) => doc.model.getFlavour(candidate) === "word-art",
      );
    if (!id) return null;
    const props = doc.model.getProps(id);
    return { id, width: props.width, height: props.height };
  }, editorSelector);

  expect(inserted).not.toBeNull();
  expect(inserted!.width).toBe(240);
  expect(inserted!.height).toBe(100);
});

for (const {flavour, label, preset} of [
  {flavour: 'text-box', label: '文本框', preset: 'office-simple'},
  {flavour: 'word-art', label: '艺术字', preset: 'ocean'},
]) {
  for (const gesture of ['click', 'drag']) {
    test(`${label} ${gesture} creation chooses content fit or fixed size and survives undo`, async ({page}) => {
      await page.goto('/');
      await page.getByRole('button', {name: '初始化', exact: true}).click();
      await waitForEditor(page);
      const oldIds = await page.evaluate(() => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
        doc.selection.blur();
        doc.crud.undoManager.clearHistory();
        return doc.placement.getAbsoluteBlockIds();
      });
      await page.locator(`bc-fixed-toolbar [aria-label="插入${label}"]`).click();
      await page.locator(`[data-preset-id="${preset}"]`).click();
      const layer = page.locator('[data-bc-object-draw-layer="true"]');
      await expect(layer).toBeVisible();
      const box = (await layer.boundingBox())!;
      const start = {x: box.x + 100, y: box.y + 100};
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      if (gesture === 'drag') {
        await page.mouse.move(start.x + 240, start.y + 100, {steps: 4});
      } else {
        // Normal hand jitter below the controller's drag threshold is a click.
        await page.mouse.move(start.x + 2, start.y + 1);
      }
      await page.mouse.up();
      await expect(layer).toHaveCount(0);
      const id = await page.evaluate(({oldIds, flavour}) => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
        return doc.placement.getAbsoluteBlockIds().find((id: string) =>
          !oldIds.includes(id) && doc.model.getFlavour(id) === flavour);
      }, {oldIds, flavour});
      expect(id).toBeTruthy();
      const measure = () => page.evaluate(id => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
        const block = doc.getBlockById(id);
        const surface = block.hostElement.querySelector('[data-bc-object-surface]');
        const style = getComputedStyle(surface);
        const textId = block.flavour === 'text-box' ? doc.model.getChildrenIds(id)[0] : id;
        return {
          mode: block.props.textAutoFit ?? 'none',
          width: parseFloat(style.width), height: parseFloat(style.height),
          authoredWidth: block.props.width, authoredHeight: block.props.height,
          text: doc.getBlockById(textId).textContent(),
        };
      }, id);
      const expectedMode = gesture === 'click' ? 'resize-shape' : 'none';
      await expect.poll(async () => (await measure()).mode).toBe(expectedMode);
      if (gesture === 'click') {
        await expect.poll(async () => {
          const size = await measure();
          return size.height < size.authoredHeight;
        }).toBe(true);
      } else {
        await expect.poll(async () => (await measure()).height).toBe(100);
        expect((await measure()).width).toBe(240);
      }
      const initial = await measure();

      // Initial fitting must remain part of the insertion, not another undo item.
      await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo());
      await expect.poll(() => page.evaluate(id => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
        return doc.placement.getAbsoluteBlockIds().includes(id);
      }, id)).toBe(false);
      await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.redo());
      await expect.poll(async () => (await measure()).height).toBe(initial.height);
      expect((await measure()).mode).toBe(expectedMode);

      await page.evaluate(id => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc;
        const block = doc.getBlockById(id);
        const textId = block.flavour === 'text-box' ? doc.model.getChildrenIds(id)[0] : id;
        doc.selection.setCursorAtBlock(textId, false, false);
      }, id);
      const typed = 'Text content should wrap and grow. '.repeat(4);
      await page.keyboard.type(typed);
      await expect.poll(async () => (await measure()).text).toContain(typed);
      if (gesture === 'click') {
        await expect.poll(async () => (await measure()).height).toBeGreaterThan(initial.height);
      } else {
        // Wait until typing has rendered before checking that the frame stayed fixed.
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        expect((await measure()).height).toBe(initial.height);
      }
      const final = await measure();
      expect(final.width).toBe(initial.width);
      expect(final.authoredHeight).toBe(initial.authoredHeight);
      expect(final.mode).toBe(expectedMode);
    });
  }
}
