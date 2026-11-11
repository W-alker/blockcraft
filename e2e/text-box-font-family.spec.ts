import {expect, test} from '@playwright/test'

const fontCases = [
  {name: 'default', family: null, stack: '"PingFang SC", "Microsoft YaHei", SimHei, sans-serif', advanced: false},
  {name: 'shared typography id', family: 'arial', stack: 'Arial, Helvetica, "PingFang SC", "Microsoft YaHei", sans-serif', advanced: false},
  {name: 'custom font stack', family: 'Georgia, serif', stack: 'Georgia, serif', advanced: false},
  {name: 'WordArt font id and gradient', family: 'cjk-kai', stack: 'Kaiti SC, KaiTi, STKaiti, serif', advanced: true},
]

test('text-box fonts and leading spaces match the resolved font in live and snapshot views', async ({page}, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => {
    const editor = document.querySelector('block-craft-editor')
    return editor && (window as any).ng?.getComponent(editor)?.doc?.isInitialized
  })
  const ids = await page.locator('block-craft-editor').evaluate(async (editor, cases) => {
    const doc = (window as any).ng.getComponent(editor).doc
    const snapshots = cases.map(item => doc.schemas.createSnapshot('text-box', [[
      {insert: ' '.repeat(31)},
      {insert: '自我修炼', attributes: {'t:fs': 1.25}},
      {insert: '行内字体', attributes: {'t:ff': 'times'}},
    ], {
      width: 717, height: 42, p: [10, 14],
      ...(item.family ? {textFamily: item.family} : {}),
      ...(item.advanced ? {textFill: 'linear-gradient(90deg, #19324a 0%, #64748b 100%)'} : {}),
    }]))
    doc.crud.insertBlockSnapshots(doc.rootId, 0, snapshots)
    await doc.navigateToBlock(snapshots[0].id)
    return snapshots.map((snapshot: any) => snapshot.id) as string[]
  }, fontCases)

  for (const surface of ['block-craft-editor', 'bc-snapshot-viewer']) {
    if (surface === 'bc-snapshot-viewer') {
      await page.locator('playground-home').evaluate(app => {
        (window as any).ng.getComponent(app).syncSnapshotViewerFromEditor()
      })
    }
    for (const [index, item] of fontCases.entries()) {
      const box = page.locator(`${surface} [data-block-id="${ids[index]}"]`)
      const content = box.locator('.text-box-block__content')
      await expect(content).toBeVisible()
      await expect(content).toContainText(' '.repeat(31) + '自我修炼行内字体')
      const result = await content.evaluate((element, expected) => {
        const style = getComputedStyle(element)
        const texts: Text[] = []
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) texts.push(walker.currentNode as Text)
        const spaces = texts.find(text => text.data === ' '.repeat(31))!
        const title = texts.find(text => text.data === '自我修炼')!
        const override = texts.find(text => text.data === '行内字体')!
        const range = document.createRange()
        range.selectNodeContents(spaces)
        const spaceWidth = range.getBoundingClientRect().width
        const reference = document.createElement('span')
        reference.style.cssText = 'position:absolute;white-space:break-spaces;'
        reference.style.fontFamily = expected.stack
        const spaceStyle = getComputedStyle(spaces.parentElement!)
        reference.style.fontSize = spaceStyle.fontSize
        reference.style.fontWeight = spaceStyle.fontWeight
        reference.style.fontStyle = spaceStyle.fontStyle
        reference.style.letterSpacing = spaceStyle.letterSpacing
        reference.textContent = spaces.data
        document.body.append(reference)
        try {
          return {
            font: style.fontFamily,
            inheritedFont: spaceStyle.fontFamily,
            expectedFont: getComputedStyle(reference).fontFamily,
            spaceWidth,
            expectedSpaceWidth: reference.getBoundingClientRect().width,
            titleSize: getComputedStyle(title.parentElement!).fontSize,
            baseSize: spaceStyle.fontSize,
            overrideFont: getComputedStyle(override.parentElement!).fontFamily,
            advanced: element.classList.contains('text-box-block__content--word-art'),
          }
        } finally { reference.remove() }
      }, item)
      expect(result.font, `${surface}: ${item.name}`).toBe(result.expectedFont)
      expect(result.inheritedFont).toBe(result.expectedFont)
      expect(result.spaceWidth).toBeGreaterThan(0)
      expect(Math.abs(result.spaceWidth - result.expectedSpaceWidth)).toBeLessThan(1)
      expect(result.advanced).toBe(item.advanced)
      if (!item.advanced) {
        expect(parseFloat(result.titleSize)).toBeCloseTo(parseFloat(result.baseSize) * 1.25, 1)
        expect(result.overrideFont).toContain('Times New Roman')
      }
      if (index === 0) await box.screenshot({path: testInfo.outputPath(`${surface}.png`)})
      await testInfo.attach(`${surface}-${index}-font-metrics`, {
        body: JSON.stringify(result), contentType: 'application/json',
      })
    }
  }
  const storedFonts = await page.locator('playground-home').evaluate((app, blockIds) => {
    const snapshot = (window as any).ng.getComponent(app).snapshotViewerSnapshot
    return blockIds.map(id => snapshot.children.find((block: any) => block.id === id).props.textFamily)
  }, ids)
  expect(storedFonts).toEqual(fontCases.map(item => item.family ?? undefined))
})
