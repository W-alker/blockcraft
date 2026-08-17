import { expect, test, type Page } from "@playwright/test";

const editorSelector = "block-craft-editor";

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
        shapeType: props.shapeType,
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
