import {expect, test, type Page} from '@playwright/test'

const effects = [
  'none', 'slant-left', 'slant-right', 'slant-up', 'slant-down',
  'perspective-left', 'perspective-right', 'perspective-up', 'perspective-down',
  'wide', 'narrow', 'tall', 'short', 'inflate', 'deflate',
  'arch-up', 'arch-down', 'circle', 'wave',
]
const nonlinear = ['arch-up', 'arch-down', 'circle', 'wave']

async function initialize(page: Page) {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshot = doc.schemas.createSnapshot('word-art', ['艺术字ABC', {
      width: 220, height: 320, textFont: '28px 700 normal',
    }])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    await doc.navigateToBlock(snapshot.id)
    doc.getBlockById(snapshot.id).hostElement.scrollIntoView({block: 'center'})
    doc.selection.setCursorAtBlock(snapshot.id, true, false)
    doc.crud.undoManager.clearHistory()
    return snapshot.id as string
  })
}

async function update(page: Page, id: string, props: Record<string, unknown>) {
  await page.evaluate(({id, props}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.getBlockById(id).updateProps(props)
  }, {id, props})
}

for (const direction of ['vertical-rl', 'rotate-90', 'rotate-270']) {
  test(`${direction} composes with every WordArt effect and returns to horizontal`, async ({page}, testInfo) => {
    const id = await initialize(page)
    const block = page.locator(`.word-art-block[data-block-id="${id}"]`)
    const content = block.locator('.word-art-block__editor')
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
    for (const effect of effects) {
      await update(page, id, {textDirection: direction, textTransform: effect})
      await expect(content).toHaveCSS('writing-mode', direction === 'vertical-rl' ? 'vertical-rl' : 'horizontal-tb')
      if (direction.startsWith('rotate-')) {
        await expect(content).toHaveCSS('width', '320px')
        await expect.poll(() => content.evaluate(el => el.style.transform)).toContain(`rotate(${direction.slice(7)}deg)`)
      }
      const svg = block.locator('svg.word-art-block__projection')
      if (nonlinear.includes(effect)) {
        await expect(svg).toHaveCount(1)
        await expect(svg).toHaveCSS('opacity', '1')
        await expect(content).toHaveCSS('opacity', '0')
        await expect(svg).toHaveAttribute('viewBox', direction === 'vertical-rl' ? '0 0 220 320' : '0 0 320 220')
        const metrics = await svg.locator('text').evaluate((text: SVGTextElement) => {
          const points = Array.from({length: text.getNumberOfChars()}, (_,i) => {
            const p = text.getStartPositionOfChar(i)
            return {x:p.x, y:p.y, angle:text.getRotationOfChar(i)}
          })
          const box = text.getBoundingClientRect()
          return {points, width:box.width, height:box.height}
        })
        expect(metrics.points).toHaveLength(6)
        expect(metrics.width).toBeGreaterThan(5)
        expect(metrics.height).toBeGreaterThan(5)
        expect(metrics.points.every(p => Number.isFinite(p.x + p.y + p.angle))).toBe(true)
        if (direction === 'vertical-rl' && effect !== 'circle') {
          // The baseline actually progresses downward; a writing-mode flag alone
          // on the old horizontal path would fail this geometry assertion.
          expect(metrics.points[5].y).toBeGreaterThan(metrics.points[0].y + 40)
        }
        await block.screenshot({path: testInfo.outputPath(`${direction}-${effect}.png`)})
      } else {
        await expect(svg).toHaveCount(0)
        const metrics = await content.evaluate(el => {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
          let node: Node | null
          while ((node = walker.nextNode())) {
            if (!node.textContent?.includes('艺术字ABC')) continue
            const range = document.createRange()
            const start = node.textContent.indexOf('艺术字ABC')
            range.setStart(node, start); range.setEnd(node, start + 1)
            const first = range.getBoundingClientRect()
            range.setStart(node, start + 1); range.setEnd(node, start + 2)
            const next = range.getBoundingClientRect()
            return {dy: next.y - first.y, dx:next.x-first.x}
          }
          return null
        })
        expect(metrics).not.toBeNull()
        expect(Math.abs(metrics!.dy), effect).toBeGreaterThan(Math.abs(metrics!.dx))
        if (effect === 'none' || effect === 'perspective-up') {
          await block.screenshot({path: testInfo.outputPath(`${direction}-${effect}.png`)})
        }
      }
    }
    await update(page, id, {textDirection: 'horizontal', textTransform: 'none'})
    await expect(content).toHaveCSS('writing-mode', 'horizontal-tb')
    await expect(content).toHaveCSS('position', 'relative')
    await expect(content).toHaveCSS('transform', 'none')
    await expect(content).toHaveCSS('width', '220px')
  })
}

test('direction menu, editing, undo/redo and snapshot reload preserve curved effects', async ({page}, testInfo) => {
  const id = await initialize(page)
  await update(page, id, {textTransform: 'wave'})
  const block = page.locator(`.word-art-block[data-block-id="${id}"]`)
  await block.hover()
  await block.locator('.word-art-block__object-handle').click()
  const toolbar = page.locator('[data-bc-object-format-toolbar]')
  await toolbar.getByRole('button', {name: '文本选项', exact: true}).click()
  const panel = page.locator('.object-format__panel')
  await panel.getByText('文本框', {exact: true}).first().click()
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.clearHistory())
  await panel.locator('label').filter({hasText:'文字方向'}).locator('cs-select').click()
  await page.getByText('竖排', {exact:true}).last().click()
  await expect(block.locator('.word-art-block__editor')).toHaveCSS('writing-mode', 'vertical-rl')
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.getBlockById(id).enterEditing()
  }, id)
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.stopCapturing())
  await page.keyboard.type('Z')
  await expect(block.locator('.word-art-block__editor')).toContainText('艺术字ABCZ')
  await expect(block.locator('svg')).toHaveCSS('opacity','0')
  await expect(block.locator('.word-art-block__editor')).toHaveCSS('opacity', '1')
  await page.keyboard.press('Escape')
  await expect(block.locator('svg')).toHaveCSS('opacity','1')
  await expect(block.locator('textPath')).toHaveText('艺术字ABCZ')
  // Exercise renderer replay through the existing tracked block-props path.
  // Toolbar writes use an untracked origin (a separate pre-existing issue).
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.stopCapturing())
  await update(page, id, {textDirection: 'rotate-90'})
  await expect(block.locator('.word-art-block__editor')).toHaveCSS('writing-mode', 'horizontal-tb')
  for (const redo of [false, true, false]) {
    await page.evaluate(redo => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      redo ? doc.crud.undoManager.redo() : doc.crud.undoManager.undo()
    }, redo)
    await expect(block.locator('.word-art-block__editor')).toHaveCSS('writing-mode', redo ? 'horizontal-tb' : 'vertical-rl')
  }
  const restoredId = await page.evaluate(async id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const saved = JSON.parse(JSON.stringify(doc.getBlockById(id).toSnapshot()))
    const restored = doc.schemas.createSnapshot('word-art', [saved.children, saved.props])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [restored])
    return restored.id
  }, id)
  const restored = page.locator(`.word-art-block[data-block-id="${restoredId}"]`)
  await expect(restored.locator('.word-art-block__editor')).toHaveCSS('writing-mode','vertical-rl')
  await expect(restored.locator('textPath')).toHaveText('艺术字ABCZ')
  await page.locator('playground-home').evaluate(app => (window as any).ng.getComponent(app).syncSnapshotViewerFromEditor())
  const viewer = page.locator(`.bc-snapshot-viewer [data-block-id="${restoredId}"]`)
  await expect(viewer.locator('svg text')).toHaveCSS('writing-mode','vertical-rl')
  await expect(viewer.locator('textPath')).toHaveText('艺术字ABCZ')
  await viewer.screenshot({path:testInfo.outputPath('viewer-vertical-wave.png')})
})
