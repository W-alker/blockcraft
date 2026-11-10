import {expect, test, type Page} from '@playwright/test'

async function initialize(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
}

test('late third-party declarations generate controls and drive plugin behavior without core or debug mappings', async ({page}, testInfo) => {
  await initialize(page)
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const installed = doc.plugins.find((plugin: any) => plugin.name === 'object-format-toolbar')
    const Base = Object.getPrototypeOf(Object.getPrototypeOf(installed)).constructor
    const definition = {namespace: 'thirdParty', label: '第三方交互插件', fields: {
      enabled: {type: 'boolean', label: '第三方入口', default: false, presets: {design: true}},
      side: {type: 'select', label: '第三方位置', default: 'left', options: [{value: 'left', label: '左侧'}, {value: 'right', label: '右侧'}]},
      delay: {type: 'number', label: '第三方延迟', default: 100, min: 0, max: 500, integer: true},
      caption: {type: 'text', label: '第三方名称', default: '工具', maxLength: 8},
    }}
    class ThirdParty extends Base {
      name = 'third-party'
      interactionConfigs = [definition]
      sub: any
      init() {
        this.sub = this.doc.interaction.policyChanges$.subscribe(() => {
          const config = this.doc.interaction.get(definition)
          this.doc.root.hostElement.setAttribute('data-third-party', JSON.stringify(config))
        })
      }
      destroy() { this.sub?.unsubscribe() }
    }
    const plugin = new ThirdParty()
    plugin.register(doc)
    doc.plugins.push(plugin)
  })
  const root = page.locator('[data-blockcraft-root="true"]')
  const current = async () => JSON.parse((await root.getAttribute('data-third-party'))!)
  expect(await current()).toEqual({enabled: false, side: 'left', delay: 100, caption: '工具'})
  const panel = page.getByTestId('interaction-mode-debug')
  await panel.locator('summary').click()
  const group = panel.getByRole('group', {name: '第三方交互插件', exact: true})
  await expect(group).toBeVisible()
  await expect(group).toContainText('当前：左侧')
  await group.getByRole('combobox', {name: '第三方入口', exact: true}).selectOption('true')
  await group.getByRole('combobox', {name: '第三方位置', exact: true}).selectOption({label: '右侧'})
  await group.getByRole('combobox', {name: '第三方延迟配置方式', exact: true}).selectOption('custom')
  const delay = group.getByRole('spinbutton', {name: '第三方延迟', exact: true})
  await delay.fill('240'); await delay.press('Tab')
  await group.getByRole('combobox', {name: '第三方名称配置方式', exact: true}).selectOption('custom')
  const caption = group.getByRole('textbox', {name: '第三方名称', exact: true})
  await caption.fill('我的工具'); await caption.press('Tab')
  await expect.poll(current).toEqual({enabled: true, side: 'right', delay: 240, caption: '我的工具'})
  await delay.fill('999'); await delay.press('Tab')
  await expect(delay).toHaveValue('240')
  expect((await current()).delay).toBe(240)
  await group.getByRole('combobox', {name: '第三方位置', exact: true}).selectOption('inherit')
  expect((await current()).side).toBe('left')
  await panel.getByRole('combobox', {name: '编辑模式', exact: true}).selectOption('design')
  expect(await current()).toEqual({enabled: true, side: 'left', delay: 100, caption: '工具'})
  await expect(group.getByRole('combobox', {name: '第三方入口', exact: true})).toHaveValue('inherit')
  await group.scrollIntoViewIfNeeded()
  await group.screenshot({path: testInfo.outputPath('third-party-interaction.png')})
  await page.reload()
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  await page.getByTestId('interaction-mode-debug').locator('summary').click()
  await expect(page.getByRole('group', {name: '第三方交互插件', exact: true})).toHaveCount(0)
})
