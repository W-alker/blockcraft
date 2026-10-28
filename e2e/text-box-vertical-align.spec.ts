import {expect, test, type Locator, type Page} from '@playwright/test'

async function initialize(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.setViewportSize({width: 1440, height: 1200})
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
}

async function measure(content: Locator) {
  return content.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const children = Array.from(element.children) as HTMLElement[]
    const first = children[0].getBoundingClientRect()
    const last = children.at(-1)!.getBoundingClientRect()
    const vertical = getComputedStyle(element).writingMode === 'vertical-rl'
    return {
      before: vertical ? bounds.right - first.right : first.top - bounds.top,
      after: vertical ? last.left - bounds.left : bounds.bottom - last.bottom,
      lastGrow: getComputedStyle(children.at(-1)!).flexGrow,
    }
  })
}

async function expectAlignment(content: Locator, alignment: string) {
  await expect(content).toBeVisible()
  if (alignment === 'top') {
    await expect.poll(async () => Math.abs((await measure(content)).before)).toBeLessThan(2)
  } else {
    await expect.poll(async () => (await measure(content)).before).toBeGreaterThan(30)
    await expect.poll(async () => {
      const {before, after} = await measure(content)
      return Math.abs(alignment === 'middle' ? before - after : after)
    }).toBeLessThan(2)
  }
}

test('文本框通过工具栏切换垂直对齐并更新快照', async ({page}) => {
  await initialize(page)
  const id = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const box = doc.schemas.createSnapshot('text-box', ['第一段', {width: 320, height: 240}])
    box.children.push(doc.schemas.createSnapshot('paragraph', ['第二段']))
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [box])
    await doc.navigateToBlock(box.id)
    doc.selection.selectBlock(doc.getBlockById(box.id))
    return box.id as string
  })
  const content = page.locator(`block-craft-editor [data-block-id="${id}"] .text-box-block__content`)
  const viewerContent = page.locator(`bc-snapshot-viewer [data-block-id="${id}"] .text-box-block__content`)
  const syncViewer = () => page.locator('playground-home').evaluate(app => {
    (window as any).ng.getComponent(app).syncSnapshotViewerFromEditor()
  })
  const toolbar = page.locator('[data-bc-object-format-toolbar]')
  await toolbar.getByRole('button', {name: '文本选项', exact: true}).click()
  const select = toolbar.locator('label').filter({hasText: '垂直对齐'}).locator('cs-select')
  for (const [value, label] of [['middle', '居中'], ['bottom', '底端'], ['top', '顶端']]) {
    await select.click()
    await page.getByRole('option', {name: label, exact: true}).click()
    expect(await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      return doc.objectFormat.resolve(id).textFrame.verticalAlign
    }, id)).toBe(value)
    await expectAlignment(content, value)
    await syncViewer()
    await expectAlignment(viewerContent, value)
    expect((await measure(viewerContent)).lastGrow).toBe(value === 'top' ? '1' : '0')
    await page.locator('playground-home').evaluate(app => {
      (window as any).ng.getComponent(app).setMainTab('editor')
    })
  }
  await expectAlignment(content, 'top')
  expect((await measure(content)).lastGrow).toBe('1')
})

test('保存的横排、竖排和效果文本框保持对齐，溢出内容的开头仍可见', async ({page}) => {
  await initialize(page)
  const cases = [
    {direction: 'horizontal', alignment: 'middle', effects: false, overflow: false},
    {direction: 'horizontal', alignment: 'bottom', effects: false, overflow: false},
    {direction: 'vertical-rl', alignment: 'middle', effects: false, overflow: false},
    {direction: 'vertical-rl', alignment: 'bottom', effects: false, overflow: false},
    {direction: 'horizontal', alignment: 'middle', effects: true, overflow: false},
    {direction: 'horizontal', alignment: 'bottom', effects: false, overflow: true},
    {direction: 'vertical-rl', alignment: 'middle', effects: false, overflow: true},
  ]
  const ids = await page.evaluate(async cases => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const boxes = cases.map(item => {
      const box = source.schemas.createSnapshot('text-box', ['第一段', {
        width: 320, height: 240, textDirection: item.direction,
        textAlignment: `left ${item.alignment}`,
        ...(item.effects ? {textFill: 'linear-gradient(90deg, #123456, #654321)'} : {}),
      }])
      for (let i = 0; i < (item.overflow ? 15 : 1); i++) {
        box.children.push(source.schemas.createSnapshot('paragraph', [`第 ${i + 2} 段`]))
      }
      return box
    })
    // Reopen serialized snapshots in a fresh editor to exercise persisted props.
    const snapshot = JSON.parse(JSON.stringify(source.schemas.createSnapshot('root', ['align-reopen', boxes])))
    const mount = document.createElement('div')
    mount.id = 'alignment-reopened'
    document.body.append(mount)
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(),
      docId: snapshot.id, plugins: [], virtualization: {enabled: false}})
    doc.initBySnapshot(snapshot, mount)
    ;(window as any).alignmentReopenedDoc = doc
    return boxes.map(box => box.id) as string[]
  }, cases)
  try {
    await page.locator('playground-home').evaluate(element => {
      const app = (window as any).ng.getComponent(element)
      app.syncSnapshotViewerFromEditor()
      app.snapshotViewerSnapshot = (window as any).alignmentReopenedDoc.exportSnapshot()
    })
    for (const surface of ['#alignment-reopened', 'bc-snapshot-viewer']) {
      for (const [index, item] of cases.entries()) {
        const content = page.locator(`${surface} [data-block-id="${ids[index]}"] .text-box-block__content`)
        await expectAlignment(content, item.overflow ? 'top' : item.alignment)
        expect((await measure(content)).lastGrow).toBe('0')
      }
    }
  } finally {
    await page.evaluate(() => {
      (window as any).alignmentReopenedDoc.destroy()
      document.getElementById('alignment-reopened')?.remove()
    })
  }
})
