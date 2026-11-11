import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 2200, height: 1000}})

async function setup(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const paragraph = doc.schemas.createSnapshot('paragraph', ['文字选区工具栏按档位显示'])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [paragraph])
    await doc.navigateToBlock(paragraph.id)
    return paragraph.id
  })
}

test('文字浮层延迟由档位和调试配置控制，输入与固定工具栏保留', async ({page}) => {
  const id = await setup(page)
  const panel = page.getByTestId('editing-experience')
  for (const [name, enabled, openDelay] of [
    ['专注内容', false, 350], ['图文混排', true, 350], ['布局调整', true, 350],
    ['精细设计', true, 350], ['轻量编辑', true, 650],
  ] as const) {
    await panel.getByRole('button', {name, exact: true}).click()
    expect(await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor'))
      .doc.interaction.policy.plugins.textToolbar)).toMatchObject({enabled, openDelay})
  }
  const debug = page.getByTestId('interaction-mode-debug')
  await debug.locator('summary').click()
  const delayMode = debug.getByRole('combobox', {name: '选区停留后显示（毫秒）配置方式', exact: true})
  await expect(delayMode).toHaveValue('inherit')
  await delayMode.selectOption('custom')
  const delay = debug.getByRole('spinbutton', {name: '选区停留后显示（毫秒）', exact: true})
  await expect(delay).toHaveValue('650')
  await delay.fill('1200')
  await delay.press('Tab')
  const text = page.locator(`[data-block-id="${id}"] .edit-container`)
  const toolbar = page.locator('.float-text-toolbar')
  await text.click()
  await text.evaluate(element => (window as any).ng.getComponent(element.closest('[data-block-id]')).setInlineRange(0, 4))
  await page.waitForTimeout(450) // 已超过旧的 350ms，但应等待自定义的 1200ms。
  await expect(toolbar).toHaveCount(0)
  await expect(toolbar).toBeVisible()
  await expect(page.locator('bc-fixed-toolbar')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+b')
  expect(await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.getBlockById(id).textDeltas().some((delta: any) => delta.attributes?.['a:bold'])
  }, id)).toBe(true)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type('TEXT')
  await expect(text).toContainText('TEXT')
  await expect(toolbar).toHaveCount(0)
})

test('切换文字浮层配置取消旧的延迟任务，恢复后等下一次选区', async ({page}) => {
  const id = await setup(page)
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.interaction.configure({preset: 'mixed', overrides: {plugins: {textToolbar: {openDelay: 1500}}}})
    doc.getBlockById(id).setInlineRange(0, 4)
  }, id)
  await page.waitForTimeout(150)
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.interaction.set('immersive')
    doc.interaction.set('mixed')
  })
  await page.waitForTimeout(1600)
  await expect(page.locator('.float-text-toolbar')).toHaveCount(0)
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.getBlockById(id).setInlineRange(1, 5)
  }, id)
  await expect(page.locator('.float-text-toolbar')).toBeVisible()
})
