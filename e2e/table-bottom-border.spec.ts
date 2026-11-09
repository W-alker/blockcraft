import {expect, test} from '@playwright/test'

for (const scale of [0.75, 1, 1.25]) {
  for (const merged of [false, true]) {
    test(`automatic column metrics do not add a bottom border (${scale}, merged=${merged})`, async ({page}) => {
      await page.routeWebSocket('**', socket => socket.close())
      await page.goto('/')
      await page.getByRole('button', {name: '初始化', exact: true}).click()
      await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
      await page.evaluate(({scale, merged}) => {
        const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const viewport = document.createElement('div')
        viewport.id = 'table-bottom-border-fixture'
        viewport.style.cssText = 'position:fixed;left:40px;top:40px;width:1050px;height:850px;overflow:auto;background:white;z-index:100;padding:30px'
        const mount = document.createElement('div')
        mount.style.width = '640px'
        viewport.append(mount); document.body.append(viewport)
        const tables = [true, false].map(auto => {
          const table = source.schemas.createSnapshot('table', [3, 3])
          table.props.columnSizing = auto ? 'auto' : null
          table.props.colWidths = [150, 150, 150]
          table.children.forEach((row: any) => row.children.forEach((cell: any) => {
            cell.children = [source.schemas.createSnapshot('paragraph', ['边框'])]
          }))
          if (merged) {
            table.children[2].children[0].props.colspan = 2
            table.children[2].children[1].props.display = 'none'
          }
          return table
        })
        const root = source.schemas.createSnapshot('root', ['table-bottom-border-test', tables])
        const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), docId: root.id,
          plugins: [], scrollContainer: viewport, readonly: false, virtualization: {enabled: false}})
        doc.initBySnapshot(root, mount)
        doc.viewScale.attach(mount)
        doc.viewScale.setScale(scale)
        ;(window as any).__tableBottomBorderDoc = doc
      }, {scale, merged})
      const tables = page.locator('#table-bottom-border-fixture .table-wrapper > table')
      const read = () => tables.evaluateAll(elements => elements.map(table => {
        const row = table.querySelector('tbody > tr:last-child')!
        const rect = table.getBoundingClientRect()
        return {height: rect.height, gap: rect.bottom - row.getBoundingClientRect().bottom,
          lastBorder: getComputedStyle(row.querySelector('td')!).borderBottomWidth}
      }))
      await expect.poll(async () => {
        const [auto, fixed] = await read()
        return Math.abs(auto.height - fixed.height)
      }).toBeLessThan(0.2)
      const [auto, fixed] = await read()
      expect(Math.abs(auto.gap - fixed.gap)).toBeLessThan(0.2)
      expect(auto.lastBorder).toBe(fixed.lastBorder)
      await expect(tables.first().locator('tfoot.bc-table-column-metrics td')).toHaveCount(3)
      await page.evaluate(() => (window as any).__tableBottomBorderDoc.toggleReadonly(true))
      const readonly = await read()
      expect(Math.abs(readonly[0].height - readonly[1].height)).toBeLessThan(0.2)
    })
  }
}
