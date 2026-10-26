import {expect, test} from '@playwright/test'
import {SHAPE_DEFINITIONS} from '../packages/editor/blocks/shape-block/shape-definitions'

test('catalogue contours stay inside their declared viewBox', async ({page}) => {
  const overflow = await page.evaluate(definitions => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    document.body.append(svg)
    try {
      return definitions.flatMap(definition =>
        [definition.path, definition.detailPath].filter(Boolean).flatMap(data => {
          const path = document.createElementNS(svg.namespaceURI, 'path') as SVGPathElement
          path.setAttribute('d', data!)
          svg.append(path)
          const {x, y, width, height} = path.getBBox()
          // Catalogue arcs use subpixel seams; measure curves, not control points.
          return x < -0.1 || y < -0.1 || x + width > 1000.1 || y + height > 1000.1
            ? [{shape: definition.type, x, y, width, height}]
            : []
        }),
      )
    } finally {
      svg.remove()
    }
  }, SHAPE_DEFINITIONS)
  expect(overflow).toEqual([])
})

for (const mode of ['relative', 'absolute'] as const) {
  test(`terminator contour, resize frame and geometry nodes agree (${mode})`, async ({page}, testInfo) => {
    await page.routeWebSocket('**', socket => socket.close())
    await page.goto('/')
    await page.getByRole('button', {name: '初始化', exact: true}).click()
    await page.waitForFunction(() => {
      const editor = document.querySelector('block-craft-editor')
      return !!editor && !!(window as any).ng?.getComponent(editor)?.doc?.isInitialized
    })
    const id = await page.evaluate(mode => {
      const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const viewport = document.createElement('div')
      viewport.id = 'shape-bounds-fixture'
      viewport.style.cssText = 'position:fixed;left:40px;top:40px;width:900px;height:600px;overflow:auto;background:white;z-index:99999'
      const mount = document.createElement('div')
      viewport.append(mount)
      document.body.append(viewport)
      const doc = new source.constructor({
        ...source.config, yDoc: new source.yDoc.constructor(), plugins: [],
        scrollContainer: viewport, readonly: false, virtualization: {enabled: false},
      })
      ;(window as any).__shapeBoundsDoc = doc
      doc.initBySnapshot({...source.model.toSnapshot(source.rootId), children: []}, mount)
      const snapshot = doc.schemas.createSnapshot('shape', ['flow-terminator', '形状内容'])
      Object.assign(snapshot.props, {width: 300, height: 76})
      if (mode === 'absolute') {
        doc.placement.insertAbsoluteSnapshot(snapshot, {anchorRect: null})
        doc.crud.updateBlockProps(snapshot.id, {position: '100 100'})
      } else {
        doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
      }
      doc.selection.selectBlock(snapshot.id)
      doc.crud.undoManager.clearHistory()
      return snapshot.id as string
    }, mode)
    const block = page.locator(`#shape-bounds-fixture [data-block-id="${id}"]`)
    const read = () => block.evaluate(element => {
      const shell = element.querySelector('.shape-block__shell')!.getBoundingClientRect()
      const frame = element.querySelector('.shape-resizer__frame')!.getBoundingClientRect()
      const pathElement = element.querySelector<SVGPathElement>('[data-bc-shape-render-path]')!
      // Firefox's client rect can include stroke; compare geometric bounds in
      // screen coordinates so all engines measure the same contour.
      const bounds = pathElement.getBBox()
      const matrix = pathElement.getScreenCTM()!
      const start = new DOMPoint(bounds.x, bounds.y).matrixTransform(matrix)
      const end = new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height).matrixTransform(matrix)
      const path = {left: start.x, top: start.y, right: end.x, bottom: end.y}
      const nodes = [...element.querySelectorAll<HTMLElement>(
        '.shape-geometry-editor__handle:not(.shape-geometry-editor__handle--control)',
      )].map(node => {
        const rect = node.getBoundingClientRect()
        return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2}
      })
      return {
        width: shell.width,
        contourError: Math.max(Math.abs(path.left - shell.left), Math.abs(path.right - shell.right),
          Math.abs(path.top - shell.top), Math.abs(path.bottom - shell.bottom)),
        frameError: Math.max(Math.abs(frame.left - shell.left), Math.abs(frame.right - shell.right),
          Math.abs(frame.top - shell.top), Math.abs(frame.bottom - shell.bottom)),
        nodesInside: nodes.length > 0 && nodes.every(node =>
          node.x >= shell.left - 0.5 && node.x <= shell.right + 0.5 &&
          node.y >= shell.top - 0.5 && node.y <= shell.bottom + 0.5),
        text: element.querySelector('.shape-block__text-frame')!.textContent,
      }
    })
    const assertAligned = async () => {
      await expect.poll(async () => (await read()).contourError).toBeLessThan(0.5)
      expect((await read()).frameError).toBeLessThan(0.5)
      expect((await read()).nodesInside).toBe(true)
      expect((await read()).text).toContain('形状内容')
    }
    await expect(block.locator('shape-resizer')).toBeVisible()
    await assertAligned()
    expect((await read()).width).toBeCloseTo(300, 0)
    await page.locator('#shape-bounds-fixture').screenshot({path: testInfo.outputPath('shape.png')})
    // Mid-edge curve nodes intentionally share the edge; use the corner resizer.
    const handle = (await block.locator('[data-handle="south-east"]').boundingBox())!
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2, {steps: 5})
    await page.mouse.up()
    await expect.poll(async () => (await read()).width).toBeCloseTo(360, 0)
    await assertAligned()
    await page.evaluate(() => (window as any).__shapeBoundsDoc.crud.undoManager.undo())
    await expect.poll(async () => (await read()).width).toBeCloseTo(300, 0)
    await assertAligned()
    await page.evaluate(() => (window as any).__shapeBoundsDoc.crud.undoManager.redo())
    await expect.poll(async () => (await read()).width).toBeCloseTo(360, 0)
    await assertAligned()
  })
}
