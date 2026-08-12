import {expect, test, type Page} from "@playwright/test";

const editorSelector = "block-craft-editor";

async function initialize(page: Page) {
  await page.goto("/");
  await page.getByRole("button", {name: "初始化", exact: true}).click();
  await page.waitForFunction((selector) => {
    const editor = document.querySelector(selector);
    const debug = (window as unknown as {
      ng?: {getComponent: (target: Element) => {doc?: {isInitialized?: boolean}}};
    }).ng;
    return !!editor && debug?.getComponent(editor)?.doc?.isInitialized === true;
  }, editorSelector);
}

async function insertFormula(page: Page) {
  return page.evaluate(async (selector) => {
    const editor = document.querySelector(selector)!;
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}};
    }).ng;
    const doc = debug.getComponent(editor).doc;
    const snapshot = doc.schemas.createSnapshot("formula", ["x^2 + y^2 = z^2"]);
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot]);
    await doc.navigateToBlock(snapshot.id);
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return snapshot.id as string;
  }, editorSelector);
}

test("formula editor keeps its native textarea and scoped styles", async ({page}) => {
  await initialize(page);
  const formulaId = await insertFormula(page);

  await page.locator(
    `${editorSelector} .formula-block[data-block-id="${formulaId}"] .formula-block-container`,
  ).click();

  const input = page.locator(".formula-toolbar textarea.ft-input");
  await expect(input).toBeVisible();
  await expect(input).not.toHaveClass(/\bcs-input\b/);
  await expect(input).not.toHaveAttribute("cs-input", "");
  await expect(input).toHaveCSS("border-top-style", "none");
  await expect(input).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(input).toHaveCSS("resize", "none");
});
