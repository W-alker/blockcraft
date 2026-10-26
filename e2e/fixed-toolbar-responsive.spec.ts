import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 2200, height: 1000 } });

async function start(page: Page, atEnd = false) {
  await page.routeWebSocket("**", (socket) => socket.close());
  await page.goto("/");
  await page.getByRole("button", { name: "初始化", exact: true }).click();
  await page.waitForFunction(
    () =>
      (window as any).ng?.getComponent(
        document.querySelector("block-craft-editor"),
      )?.doc?.isInitialized,
  );
  const toolbar = page.locator("bc-fixed-toolbar");
  await expect(toolbar).toHaveClass(/toolbar-mode--full/);
  await toolbar.getByRole("button", { name: "收起为简略工具栏", exact: true }).click();
  return page.locator("block-craft-editor").evaluate(async (editor, atEnd) => {
    const doc = (window as any).ng.getComponent(editor).doc;
    const p = doc.schemas.createSnapshot("paragraph", ["工具栏响应式验证文本"]);
    doc.crud.insertBlockSnapshots(
      doc.rootId,
      atEnd ? doc.getBlockById(doc.rootId).childrenLength : 0,
      [p],
    );
    await doc.navigateToBlock(p.id);
    doc.selection.setSelection(
      { blockId: p.id, type: "text", offset: 0 },
      { blockId: p.id, type: "text", offset: 6 },
    );
    return p.id as string;
  }, atEnd);
}

async function resizeToolbar(page: Page, width: number) {
  const toolbar = page.locator("bc-fixed-toolbar");
  await toolbar.evaluate(
    (el, value) => ((el as HTMLElement).style.width = `${value}px`),
    width,
  );
  // Let ResizeObserver reset the tier before checking the subsequent fit frames.
  await toolbar.evaluate(() => new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  ));
  await expect
    .poll(() =>
      toolbar
        .locator(".toolbar-body")
        .evaluate((el) => el.scrollWidth - el.clientWidth),
    )
    .toBeLessThanOrEqual(1);
  return toolbar;
}

test("direct toolbar actions show tooltips on hover and keyboard focus", async ({
  page,
  browserName,
}, testInfo) => {
  await start(page);
  const toolbar = page.locator("bc-fixed-toolbar");
  const tooltip = page.getByRole("tooltip");
  const bold = toolbar.getByRole("button", { name: "加粗", exact: true });
  await bold.hover();
  await expect(tooltip).toHaveText("加粗");
  await expect(tooltip).toHaveCSS("opacity", "1");
  await expect(bold).not.toHaveAttribute("title");
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);

  const redo = toolbar.getByRole("button", { name: "重做", exact: true });
  await expect(redo).toBeDisabled();
  await redo.hover();
  await expect(tooltip).toHaveText("重做");
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);

  await toolbar.getByRole("button", { name: "展开为双层工具栏", exact: true }).click();
  await page.mouse.move(0, 0);
  const settings = toolbar.getByRole("button", { name: "文本设置", exact: true });
  await settings.focus();
  await expect(tooltip).toHaveText("文本设置");
  await settings.press("Escape");
  await expect(tooltip).toHaveCount(0);
  // WebKit on macOS uses Option+Tab to include buttons in keyboard navigation.
  await settings.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(bold).toBeFocused();
  await expect(tooltip).toHaveText("加粗");
  await bold.press("Escape");
  await expect(tooltip).toHaveCount(0);

  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
  await bold.hover();
  await expect(tooltip).toHaveText("加粗");
  expect((await tooltip.boundingBox())!.y).toBeGreaterThanOrEqual(
    (await bold.boundingBox())!.y + (await bold.boundingBox())!.height,
  );
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
  // Isolate the toolbar from the Playground's fixed 320px debug sidebar.
  await toolbar.evaluate((el) => Object.assign((el as HTMLElement).style, {
    position: "fixed", left: "20px", top: "8px", width: "320px",
  }));
  await page.setViewportSize({ width: 360, height: 800 });
  await resizeToolbar(page, 320);
  const paragraph = toolbar.getByRole("button", { name: "段落设置", exact: true });
  await paragraph.hover();
  await expect(tooltip).toHaveText("段落设置");
  const bounds = await tooltip.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
  const buttonBounds = await paragraph.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(buttonBounds!.y + buttonBounds!.height);
  await page.screenshot({ path: testInfo.outputPath("narrow-toolbar-tooltip.png") });
});

test("colour tooltips close when panels open and do not overlap hover menus", async ({
  page,
}) => {
  await start(page);
  const toolbar = page.locator("bc-fixed-toolbar");
  const tooltip = page.getByRole("tooltip");
  for (const label of ["文字颜色", "背景颜色"]) {
    const button = toolbar.getByRole("button", { name: label, exact: true });
    await button.hover();
    await expect(tooltip).toHaveText(label);
    await button.click();
    await expect(page.locator(".toolbar-color-menu")).toBeVisible();
    await expect(tooltip).toHaveCount(0);
    await button.click();
    await expect(page.locator(".toolbar-color-menu")).toHaveCount(0);
    await page.mouse.move(0, 0);
  }
  await toolbar.getByTitle("插入表格", { exact: true }).hover();
  await expect(page.locator("bc-table-size-picker")).toBeVisible();
  await expect(tooltip).toHaveCount(0);
});

test("separate colour buttons apply both colours without nested popups", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const id = await start(page);
  const toolbar = page.locator("bc-fixed-toolbar");
  const textButton = toolbar.getByRole("button", { name: "文字颜色", exact: true });
  const backgroundButton = toolbar.getByRole("button", { name: "背景颜色", exact: true });
  await textButton.click();
  const menu = page.locator(".toolbar-color-menu").filter({ has: page.locator("cs-color-picker-panel") });
  const palette = menu.locator(".cs-color-picker-panel");
  const readDelta = () =>
    page
      .locator("block-craft-editor")
      .evaluate(
        (editor, id) =>
          (window as any).ng.getComponent(editor).doc.model.getTextDeltas(id),
        id,
      );
  const readColor = (key: string) =>
    readDelta().then((delta) => delta[0].attributes?.[key]?.toLowerCase());
  const original = await readDelta();
  await expect(textButton).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("tab")).toHaveCount(0);
  await expect(page.locator(".toolbar-color-menu cs-color-picker-panel")).toHaveCount(1);
  await expect(menu.locator("cs-color-picker-panel")).toHaveCount(1);
  await expect(menu.locator(".cs-color-picker-trigger")).toHaveCount(0);
  await expect(page.locator(".cs-color-picker-overlay-pane")).toHaveCount(0);
  await expect(palette).toHaveCSS("box-shadow", "none");
  await expect(palette.getByRole("radio").count()).resolves.toBeGreaterThan(20);
  await menu.screenshot({
    path: testInfo.outputPath("separate-colour-palette.png"),
  });
  await palette.getByRole("button", { name: "更多颜色", exact: true }).click();
  const hex = palette.getByRole("textbox", { name: "Hex", exact: true });
  await hex.fill("1677AA");
  await hex.press("Enter");
  await expect.poll(() => readColor("s:color")).toBe("#1677aa");
  await expect(
    page.locator(`[data-block-id="${id}"] c-text`).first(),
  ).toHaveCSS("color", "rgb(22, 119, 170)");
  await expect
    .poll(() =>
      hex.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) ===
          el
        );
      }),
    )
    .toBe(true);
  await menu.screenshot({
    path: testInfo.outputPath("separate-colour-advanced.png"),
  });
  await palette
    .getByRole("textbox", { name: "红色通道", exact: true })
    .fill("30");
  // Switching buttons commits the focused field and retains the original range.
  await backgroundButton.click();
  await expect.poll(() => readColor("s:color")).toBe("#1e77aa");
  await expect(backgroundButton).toHaveAttribute("aria-expanded", "true");
  await expect(textButton).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".toolbar-color-menu cs-color-picker-panel")).toHaveCount(1);
  await expect(menu.getByText("背景图形", { exact: true })).toBeVisible();
  await expect(
    palette.getByRole("radiogroup", { name: "最近使用" }),
  ).toHaveCount(0);
  await palette.getByRole("button", { name: "更多颜色", exact: true }).click();
  await hex.fill("FFEEDD");
  await hex.press("Enter");
  await expect.poll(() => readColor("s:background")).toBe("#ffeedd");
  await expect.poll(() => readColor("s:color")).toBe("#1e77aa");
  expect((await readDelta())[1]).toEqual({ insert: "验证文本" });
  await menu.getByRole("button", { name: "圆角背景", exact: true }).click();
  await expect.poll(() => readColor("a:bg")).toBe("r1");
  await menu.getByRole("button", { name: "无背景图形", exact: true }).click();
  await expect.poll(() => readColor("a:bg")).toBeUndefined();
  await palette.getByRole("button", { name: "返回色板", exact: true }).click();
  await menu.screenshot({
    path: testInfo.outputPath("separate-colour-background.png"),
  });
  await palette
    .getByRole("radio", { name: "无背景色", exact: true })
    .press("Enter");
  await expect.poll(() => readColor("s:background")).toBeUndefined();
  await textButton.click();
  await expect(menu.getByText("背景图形", { exact: true })).toHaveCount(0);
  await expect(
    palette.getByRole("radiogroup", { name: "最近使用" }),
  ).toBeVisible();
  await palette
    .getByRole("radio", { name: "自动", exact: true })
    .press("Enter");
  await expect
    .poll(async () => {
      const delta = await readDelta();
      return {
        text: delta.map((r: any) => r.insert).join(""),
        unformatted: delta.every(
          (r: any) => !Object.keys(r.attributes ?? {}).length,
        ),
      };
    })
    .toEqual({
      text: original.map((r: any) => r.insert).join(""),
      unformatted: true,
    });
  // Each button opens its own panel by keyboard; Escape restores the editor range.
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  const editorHasFocus = () => page.locator('block-craft-editor').evaluate(editor =>
    (window as any).ng.getComponent(editor).doc.root.hostElement.contains(document.activeElement));
  await expect.poll(editorHasFocus).toBe(true);
  await backgroundButton.focus();
  await backgroundButton.press("Enter");
  await expect(menu.getByText("背景图形", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(editorHasFocus).toBe(true);
  await page.addStyleTag({
    content: `.document-scale-settings-float{display:none!important}
    bc-fixed-toolbar{position:fixed!important;top:16px!important;left:16px!important;width:calc(100vw - 32px)!important;z-index:500!important}`,
  });
  await page.setViewportSize({ width: 390, height: 820 });
  await toolbar
    .getByRole("button", { name: "展开为双层工具栏", exact: true })
    .click();
  await expect(textButton).toBeVisible();
  await expect(backgroundButton).toBeVisible();
  await expect.poll(() => toolbar.evaluate(el => {
    const text = el.querySelector('.toolbar-color-control--text')!.getBoundingClientRect();
    const background = el.querySelector('.toolbar-color-control--background')!.getBoundingClientRect();
    return background.left - text.right;
  })).toBeGreaterThanOrEqual(0);
  await textButton.click();
  await palette.getByRole("button", { name: "更多颜色", exact: true }).click();
  const bounds = await menu.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await menu.screenshot({
    path: testInfo.outputPath("separate-colour-narrow.png"),
  });
});

test("existing library popup reuses the same panel and preserves confirmation", async ({
  page,
}) => {
  const id = await start(page);
  await page.locator("bc-fixed-toolbar").getByRole("button", { name: "展开为双层工具栏", exact: true }).click();
  await page.locator("bc-fixed-toolbar .toolbar-settings-entry--text").click();
  const modal = page.locator("bc-font-settings-dialog");
  const trigger = modal.locator("cs-color-picker").first().getByRole("button");
  await trigger.click();
  const popup = page.locator(".cs-color-picker-popup");
  await expect(popup.locator("cs-color-picker-panel")).toHaveCount(1);
  await expect(popup.locator(".cs-color-picker-panel")).toHaveCSS(
    "box-shadow",
    "none",
  );
  await expect(popup).not.toHaveCSS("box-shadow", "none");
  await popup
    .getByRole("radio", { name: "#1DA9DC", exact: true })
    .press("Enter");
  await expect(popup).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect(modal).toBeHidden();
  await expect
    .poll(() =>
      page
        .locator("block-craft-editor")
        .evaluate(
          (editor, id) =>
            (window as any).ng
              .getComponent(editor)
              .doc.model.getTextDeltas(id)[0]
              .attributes?.["s:color"]?.toLowerCase(),
          id,
        ),
    )
    .toBe("#1da9dc");
});

test("container width progressively removes shortcuts while preserving named destinations and row count", async ({
  page,
}, testInfo) => {
  await start(page);
  const toolbar = page.locator("bc-fixed-toolbar");
  for (const mode of ["简略", "双层"]) {
    if (mode === "双层") {
      await toolbar
        .getByRole("button", { name: "展开为双层工具栏", exact: true })
        .click();
    }
    const counts: number[] = [];
    for (const width of [1800, 1440, 1200, 1000, 900, 760, 560, 390, 320]) {
      await resizeToolbar(page, width);
      for (const settings of ["text", "paragraph"]) {
        await expect(toolbar.locator(`.toolbar-settings-entry--${settings}`)).toBeVisible({visible: mode === "双层"});
      }
      if (mode === "简略") {
        await expect(toolbar.getByRole("button", {name: "链接", exact: true})).toBeVisible();
      }
      const formula = toolbar.getByRole("button", {name: "行内公式", exact: true});
      const spacing = toolbar.locator(".toolbar-letter-spacing, .toolbar-line-height");
      if (width === 1800) {
        await expect(formula).toBeVisible();
        for (const button of await spacing.all()) await expect(button).toBeVisible();
      } else if (width <= 760) {
        await expect(formula).toBeHidden();
        for (const button of await spacing.all()) await expect(button).toBeHidden();
      }
      // Specialist controls collapse before the common image/table shortcuts.
      if (!(await toolbar.locator(".toolbar-insert-shortcut--image").isVisible())) {
        await expect(formula).toBeHidden();
        for (const button of await spacing.all()) await expect(button).toBeHidden();
      }
      await expect(toolbar.locator(".toolbar-insert-menu")).toBeVisible();
      await expect(toolbar.locator(".toolbar-btn--font-size")).toBeVisible();
      await expect
        .poll(() =>
          toolbar
            .locator(".toolbar-body")
            .evaluate((el) => el.getBoundingClientRect().height),
        )
        .toBeLessThanOrEqual(mode === "简略" ? 30 : 62);
      if (mode === "简略" && width === 1440) {
        await expect(
          toolbar.locator(".toolbar-insert-shortcut--image"),
        ).toBeVisible();
        await expect(
          toolbar.locator(".toolbar-insert-shortcut--table"),
        ).toBeVisible();
        const occupiedWidth = await toolbar
          .locator(".toolbar-surface")
          .evaluate((el) => el.getBoundingClientRect().width);
        expect(occupiedWidth).toBeGreaterThan(1000);
      }
      if (mode === "双层" && width === 320) {
        await expect(toolbar.locator(".toolbar-body")).toHaveCSS(
          "display",
          "grid",
        );
        const commands = toolbar.locator(
          '[data-inline-action="bold"], [data-inline-action="italic"], [data-inline-action="underline"], .toolbar-font-combo, .toolbar-color-control',
        );
        const tops = await commands.evaluateAll((els) =>
          els.map((el) => Math.round(el.getBoundingClientRect().top)),
        );
        expect(new Set(tops).size).toBe(1);
      }
      if (mode === "简略" && width === 1000) {
        await expect(
          toolbar.locator(".toolbar-btn--font-family"),
        ).toBeVisible();
      }
      if ([1440, 760, 320].includes(width)) {
        await page.mouse.move(0, 0);
        await toolbar.screenshot({
          path: testInfo.outputPath(
            `toolbar-${mode === "双层" ? "full" : "simple"}-${width}.png`,
          ),
        });
      }
      const centerOffset = await toolbar.evaluate((el) => {
        const host = el.getBoundingClientRect();
        const content = el
          .querySelector(".toolbar-surface")!
          .getBoundingClientRect();
        return Math.abs(
          (content.left + content.right - host.left - host.right) / 2,
        );
      });
      expect(centerOffset).toBeLessThanOrEqual(1);
      counts.push(
        await toolbar.locator(".toolbar-body button:visible").count(),
      );
    }
    expect(counts[counts.length - 1]).toBeLessThan(counts[0]);
    await expect(
      toolbar.locator(".toolbar-insert-shortcut--shape"),
    ).toBeHidden();
    await resizeToolbar(page, 1800);
    await expect(toolbar.locator(".toolbar-btn--font-family")).toBeVisible();
    await expect
      .poll(() => toolbar.locator(".toolbar-body button:visible").count())
      .toBe(counts[0]);
  }
});

test("named settings preserve the selected range through mode changes and cancellation", async ({
  page,
}) => {
  const id = await start(page, true);
  const toolbar = await resizeToolbar(page, 320);
  await toolbar
    .getByRole("button", { name: "展开为双层工具栏", exact: true })
    .click();
  const scrollTop = await page
    .locator("block-craft-editor")
    .evaluate(
      (editor) =>
        (window as any).ng.getComponent(editor).doc.scrollContainer.scrollTop,
    );
  await toolbar.locator(".toolbar-settings-entry--text").click();
  await expect(page.locator("bc-font-settings-dialog")).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await toolbar.locator(".toolbar-settings-entry--paragraph").click();
  await expect(page.locator("bc-paragraph-settings-dialog")).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("block-craft-editor")
        .evaluate(
          (editor) =>
            (window as any).ng.getComponent(editor).doc.scrollContainer
              .scrollTop,
        ),
    )
    .toBe(scrollTop);
  await toolbar.getByRole("button", { name: "加粗", exact: true }).click();
  await expect
    .poll(() =>
      page.locator("block-craft-editor").evaluate((editor, id) => {
        const doc = (window as any).ng.getComponent(editor).doc;
        return doc.model
          .getTextDeltas(id)
          .some((delta: any) => delta.attributes?.["a:bold"]);
      }, id),
    )
    .toBe(true);
});

test("compact insertion menu retains the real table picker and command", async ({
  page,
}) => {
  await start(page);
  const toolbar = await resizeToolbar(page, 320);
  const tableCount = () =>
    page.locator("block-craft-editor").evaluate((editor) => {
      const doc = (window as any).ng.getComponent(editor).doc;
      return doc
        .getBlockById(doc.rootId)
        .childrenIds.filter(
          (id: string) => doc.model.getFlavour(id) === "table",
        ).length;
    });
  const before = await tableCount();
  await toolbar.locator(".toolbar-insert-menu").click();
  const menu = page.locator('[csMenu][aria-label="插入内容"]');
  await expect(menu).toBeVisible();
  await expect(menu.getByText("图片", { exact: true })).toBeVisible();
  await expect(menu.getByText("形状", { exact: true })).toBeVisible();
  await expect(menu.getByText("文本框", { exact: true })).toBeVisible();
  await menu.getByText("表格", { exact: true }).hover();
  const picker = page.locator("bc-table-size-picker:visible");
  await expect(picker).toBeVisible();
  await picker
    .locator(".bc-table-size-picker-row")
    .nth(1)
    .locator("button")
    .nth(1)
    .click();
  await expect(menu).toBeHidden();
  await expect.poll(tableCount).toBe(before + 1);
});

test("extension actions keep two rows and remain callable from overflow", async ({
  page,
}) => {
  await start(page);
  const toolbar = await resizeToolbar(page, 1440);
  await toolbar
    .getByRole("button", { name: "展开为双层工具栏", exact: true })
    .click();
  await toolbar.evaluate((el) => {
    const ng = (window as any).ng;
    const component = ng.getComponent(el);
    component.extensionActions = Array.from({ length: 6 }, (_, index) => ({
      key: `extension-${index}`,
      icon: "bc_wenben",
      title: `扩展操作 ${index + 1}`,
    }));
    component.extensionAction.subscribe((event: any) =>
      el.setAttribute("data-last-extension", event.action.key),
    );
    ng.applyChanges(component);
  });
  await expect
    .poll(() =>
      toolbar
        .locator(".toolbar-body")
        .evaluate((el) => el.getBoundingClientRect().height),
    )
    .toBeLessThanOrEqual(62);
  await resizeToolbar(page, 320);
  await expect(toolbar.locator(".toolbar-group--extensions")).toBeHidden();
  await toolbar.getByRole("button", { name: "更多格式", exact: true }).click();
  await page
    .locator(".responsive-more-menu")
    .getByText("扩展操作 6", { exact: true })
    .click();
  await expect(toolbar).toHaveAttribute("data-last-extension", "extension-5");
});

test("double-row groups balance real commands without empty style or insertion slots", async ({
  page,
}) => {
  await start(page);
  const toolbar = await resizeToolbar(page, 1440);
  await toolbar
    .getByRole("button", { name: "展开为双层工具栏", exact: true })
    .click();
  await expect(toolbar).toHaveClass(/toolbar-layout--wide/);
  for (const group of ["font", "paragraph", "insert"]) {
    const rows = toolbar.locator(`.toolbar-group--${group} .toolbar-row`);
    await expect(rows).toHaveCount(2);
    const density = await rows.evaluateAll((elements) =>
      elements.map((row) => {
        const commands = Array.from(row.children).filter(
          (el) => el.getBoundingClientRect().width > 0,
        );
        return (
          commands.reduce(
            (sum, el) => sum + el.getBoundingClientRect().width,
            0,
          ) / row.getBoundingClientRect().width
        );
      }),
    );
    for (const value of density) expect(value).toBeGreaterThan(0.8);
  }
});

test("overflow items use the menu appearance and preserve keyboard commands", async ({
  page,
}, testInfo) => {
  const id = await start(page);
  const toolbar = await resizeToolbar(page, 320);
  await toolbar.getByRole("button", { name: "加粗", exact: true }).click();
  await toolbar.getByRole("button", { name: "更多格式", exact: true }).click();
  const menu = page.locator(".responsive-more-menu");
  const clear = menu.getByRole("menuitem", { name: "清除格式", exact: true });
  await expect(clear).toBeVisible();
  await expect(clear).toHaveCSS("border-top-width", "0px");
  await expect(clear).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await menu.screenshot({ path: testInfo.outputPath("overflow-menu.png") });
  await clear.focus();
  await clear.press("Enter");
  await expect(menu).toBeHidden();
  await expect
    .poll(() =>
      page.locator("block-craft-editor").evaluate((editor, id) => {
        const doc = (window as any).ng.getComponent(editor).doc;
        return doc.model
          .getTextDeltas(id)
          .some((delta: any) => delta.attributes?.["a:bold"]);
      }, id),
    )
    .toBe(false);
});

test("nested insertion pickers share one popup surface while standalone pickers retain their chrome", async ({
  page,
}, testInfo) => {
  await start(page);
  const toolbar = await resizeToolbar(page, 320);
  await toolbar.locator(".toolbar-insert-menu").click();
  const menu = page.locator('[csMenu][aria-label="插入内容"]');
  const pickers = [
    ["表格", ".bc-table-size-picker"],
    ["形状", ".shape-picker"],
    ["文本框", ".text-box-preset-picker"],
    ["艺术字", ".word-art-preset-picker"],
    ["分栏", ".bc-column-count-picker"],
  ];
  for (const [label, selector] of pickers) {
    await menu.getByText(label, { exact: true }).hover();
    const content = page.locator(
      `.bc-fixed-toolbar-submenu ${selector}:visible`,
    );
    await expect(content).toBeVisible();
    await expect(content).toHaveCSS("box-shadow", "none");
    await expect(content).toHaveCSS("border-top-width", "0px");
    await expect(content).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    if (label === "表格") {
      await page
        .locator(".bc-fixed-toolbar-submenu:visible")
        .screenshot({ path: testInfo.outputPath("table-submenu.png") });
    }
  }
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await resizeToolbar(page, 1440);
  await toolbar
    .getByRole("button", { name: "展开为双层工具栏", exact: true })
    .click();
  await toolbar.getByTitle("插入表格", { exact: true }).click();
  const standalone = page.locator(".bc-table-size-picker:visible");
  await expect(standalone).toHaveCSS("border-top-width", "1px");
  await expect(standalone).not.toHaveCSS("box-shadow", "none");
});
