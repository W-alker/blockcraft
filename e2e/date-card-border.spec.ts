import {expect, test, type Page} from '@playwright/test'

const styles = ['calendar', 'square', 'banner', 'minibar', 'ticket', 'stamp', 'flip', 'masthead', 'bookmark', 'split', 'pill', 'rail']

test.use({viewport: {width: 1600, height: 1100}})

async function setup(page: Page, draft = false) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  return page.evaluate(async draft => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snap = doc.schemas.createSnapshot('date-card', [])
    snap.props = {style: 'banner', date: '2026-09-21T10:00'}
    if (draft) snap.meta = {...snap.meta, 'draft:style': 'banner'}
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snap])
    await doc.navigateToBlock(snap.id)
    doc.selection.selectBlock(doc.getBlockById(snap.id))
    return snap.id as string
  }, draft)
}

test('全部日期样式：边框在固定框内，格式与缩放后不新增文字裁切', async ({page}, info) => {
  test.setTimeout(120000)
  const id = await setup(page)
  const result = await page.evaluate(async ({id, styles}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const block = doc.getBlockById(id)
    const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const patch = async (props: Record<string, unknown>) => {
      doc.crud.transact(() => block.updateProps(props))
      await paint()
    }
    const failures: unknown[] = []
    let cases = 0
    for (const style of styles) {
      await patch({style, format: 'full', bw: '0px solid'})
      const base = {width: block.props.width, height: block.props.height}
      for (const format of ['full', 'noWeek', 'min']) {
        await patch({...base, format})
        const size = {width: block.props.width, height: block.props.height}
        for (const scale of [0.5, 1, 2]) {
          await patch({width: size.width * scale, height: size.height * scale})
          let baseline: number[] = []
          for (const bw of ['0px solid', '1px solid', '2px dashed', '3px double']) {
            await patch({bw})
            const frame = block.hostElement.querySelector('.tpl-date-card') as HTMLElement
            const card = frame.querySelector('.card') as HTMLElement
            const bounds = frame.getBoundingClientRect()
            const rect = card.getBoundingClientRect()
            const context = {style, format, scale, bw}
            if (rect.left < bounds.left - 0.5 || rect.right > bounds.right + 0.5 || rect.top < bounds.top - 0.5 || rect.bottom > bounds.bottom + 0.5) {
              failures.push({...context, reason: '卡面边框超出固定框', bounds: bounds.toJSON(), card: rect.toJSON()})
            }
            // Range 含字体行框留白：与同格式/尺度的无边框基线比较，避免将字体留白误判为新裁切。
            const overflow: number[] = []
            const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT)
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              if (!node.textContent?.trim()) continue
              const range = document.createRange()
              range.selectNodeContents(node)
              const text = range.getBoundingClientRect()
              let left = bounds.left, right = bounds.right, top = bounds.top, bottom = bounds.bottom
              for (let parent = node.parentElement; parent && parent !== frame; parent = parent.parentElement) {
                const css = getComputedStyle(parent)
                const clip = parent.getBoundingClientRect()
                if (css.overflowX === 'hidden' || css.overflowX === 'clip') {
                  left = Math.max(left, clip.left + parseFloat(css.borderLeftWidth))
                  right = Math.min(right, clip.right - parseFloat(css.borderRightWidth))
                }
                if (css.overflowY === 'hidden' || css.overflowY === 'clip') {
                  top = Math.max(top, clip.top + parseFloat(css.borderTopWidth))
                  bottom = Math.min(bottom, clip.bottom - parseFloat(css.borderBottomWidth))
                }
              }
              overflow.push(Math.max(0, left - text.left, text.right - right, top - text.top, text.bottom - bottom))
            }
            if (bw === '0px solid') baseline = overflow
            else if (overflow.some((value, index) => value > baseline[index] + 1)) {
              failures.push({...context, reason: '文字新增裁切', baseline, overflow})
            }
            if (block.props.width !== size.width * scale || block.props.height !== size.height * scale || block.props.date !== '2026-09-21T10:00') {
              failures.push({...context, reason: '边框修改了几何或日期'})
            }
            cases++
          }
        }
      }
    }
    await patch({style: 'banner', format: 'full', bw: '2px solid'})
    return {cases, failures: failures.slice(0, 20)}
  }, {id, styles})
  expect(result.cases).toBe(432)
  expect(result.failures).toEqual([])
  await page.locator(`[data-block-id="${id}"]`).screenshot({path: info.outputPath('banner-border.png')})
})

test('长卷草稿：设置预览、应用、撤销重做与只读保留完整边框', async ({page}) => {
  const id = await setup(page, true)
  const block = page.locator(`block-craft-editor [data-block-id="${id}"]`)
  const read = () => page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return JSON.parse(JSON.stringify(doc.getBlockById(id).toSnapshot(false)))
  }, id)
  const before = await read()
  await block.getByRole('button', {name: '日期设置', exact: true}).click()
  const dialog = page.getByRole('dialog', {name: '日期设置', exact: true})
  await dialog.getByRole('combobox', {name: '卡片边框', exact: true}).click()
  await page.getByRole('listbox').getByRole('option', {name: '粗线', exact: true}).click()
  const fits = (container: typeof block) => container.evaluate(el => {
    const frame = el.getBoundingClientRect()
    const card = el.querySelector('.card')!.getBoundingClientRect()
    return card.top >= frame.top - 0.5 && card.bottom <= frame.bottom + 0.5
  })
  expect(await fits(dialog.locator('.preview-card'))).toBe(true)
  expect((await read()).props).toEqual(before.props)
  await dialog.getByRole('button', {name: '应用', exact: true}).click()
  await expect(block.locator('.card')).toHaveCSS('border-top-width', '3px')
  expect(await fits(block.locator('.tpl-date-card'))).toBe(true)
  expect((await read()).props).toEqual(before.props)
  expect((await read()).meta['draft:bw']).toBe('3px solid')
  for (const redo of [false, true]) {
    await page.evaluate(redo => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      redo ? doc.crud.undoManager.redo() : doc.crud.undoManager.undo()
    }, redo)
    await expect(block.locator('.card')).toHaveCSS('border-top-width', redo ? '3px' : '0px')
  }
  await page.getByRole('button', {name: '只读', exact: true}).press('Enter')
  await expect(block.locator('mtl-scale-resizer')).toHaveCount(0)
  expect(await fits(block.locator('.tpl-date-card'))).toBe(true)
})
