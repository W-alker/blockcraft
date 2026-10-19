import {expect, test} from '@playwright/test'

test('行内天气：模板插入、格式配置与取消、撤销重做、重新打开和实例化', async ({page}) => {
  await page.goto('/template')
  await page.evaluate(() => localStorage.removeItem('bc-template-deco-payload-v2'))
  await page.reload()
  await expect(page.getByRole('button', {name: '使用模版'})).toBeEnabled()
  await page.getByRole('tab', {name: '动态能力'}).click()
  await page.locator('.insert-item').filter({hasText: '天气(行内)'}).click()
  const weather = page.locator('.bc-inline-weather')
  await expect(weather).toHaveCount(1)
  await expect(weather).toHaveText('--°C · 天气 · 城市')
  const dialog = page.getByRole('dialog', {name: '行内天气格式'})
  const selectTemp = async () => {
    await weather.click()
    await dialog.getByRole('combobox').click()
    await page.getByRole('option', {name: '图标 · 温度', exact: true}).click()
  }
  await selectTemp()
  await dialog.getByRole('button', {name: '取消', exact: true}).click()
  await expect(weather).toHaveText('--°C · 天气 · 城市')
  // 与插入操作隔开 Undo 捕获边界。
  await page.evaluate(() => {
    (window as any).ng.getComponent(document.querySelector('template-edit-surface')).doc.crud.undoManager.stopCapturing()
  })
  await selectTemp()
  await dialog.getByRole('button', {name: '确定', exact: true}).click()
  await expect(weather).toHaveText('--°C')
  await page.evaluate(() => {
    (window as any).ng.getComponent(document.querySelector('template-edit-surface')).doc.crud.undoManager.undo()
  })
  await expect(weather).toHaveText('--°C · 天气 · 城市')
  await page.evaluate(() => {
    (window as any).ng.getComponent(document.querySelector('template-edit-surface')).doc.crud.undoManager.redo()
  })
  await expect(weather).toHaveText('--°C')
  await expect.poll(() => page.evaluate(() => {
    const saved = localStorage.getItem('bc-template-deco-payload-v2') ?? ''
    return saved.includes('"weatherFormat":"temp"')
  })).toBe(true)
  await page.reload()
  await expect(weather).toHaveText('--°C')
  await page.getByRole('button', {name: '使用模版'}).click()
  await expect(weather).toHaveText('28°C')
  await expect(weather.locator('svg')).toHaveCount(1)
  const delta = await weather.evaluate(element => JSON.parse((element as HTMLElement).dataset['bcWeatherDelta']!))
  expect(delta.attributes.weatherFormat).toBe('temp')
  expect(delta.attributes.weatherSource).toBeUndefined()
  expect(JSON.parse(delta.insert.weather).location).toBe('北京')
  // SVG 点击也命中编辑入口；只改格式不会重取/覆盖天气。
  await weather.locator('svg').click()
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', {name: '28°C · 晴 · 北京', exact: true}).click()
  await dialog.getByRole('button', {name: '确定', exact: true}).click()
  await expect(weather).toHaveText('28°C · 晴 · 北京')
  expect(await weather.evaluate(element => JSON.parse((element as HTMLElement).dataset['bcWeatherDelta']!).insert.weather)).toBe(delta.insert.weather)
  await expect(weather).toHaveCSS('display', 'inline')
  await page.screenshot({path: '/tmp/blockcraft-inline-weather.png'})
})

test('行内天气随正文排版和字号变化，只读时关闭配置且不能再修改', async ({page}) => {
  await page.addInitScript(() => {
    const value = JSON.stringify({tone: 'rainy', temp: 19, high: 22, low: 16, condition: '小雨', location: '上海'})
    localStorage.setItem('bc-template-deco-payload-v2', JSON.stringify({
      snapshot: {id: 'root', flavour: 'root', nodeType: 'root', props: {}, meta: {}, children: [
        {id: 'inline-weather-text', flavour: 'paragraph', nodeType: 'editable', props: {}, meta: {}, children: [
          {insert: '今天的天气是 '},
          {insert: {weather: value}, attributes: {weatherFormat: 'full'}},
          {insert: '，适合读书。'},
        ]},
      ]}, background: null, paginationEnabled: false,
    }))
  })
  await page.goto('/template/use')
  const weather = page.locator('.bc-inline-weather')
  await expect(weather).toHaveText('19°C · 小雨 · 上海')
  const geometry = await weather.evaluate(element => {
    const embed = element.closest('c-element')!
    const previous = embed.previousElementSibling!, next = embed.nextElementSibling!
    const bounds = element.getBoundingClientRect()
    return {left: bounds.left, right: bounds.right, top: bounds.top,
      previousRight: previous.getBoundingClientRect().right, nextLeft: next.getBoundingClientRect().left,
      previousTop: previous.getBoundingClientRect().top}
  })
  expect(geometry.left).toBeGreaterThanOrEqual(geometry.previousRight)
  expect(geometry.right).toBeLessThanOrEqual(geometry.nextLeft)
  expect(Math.abs(geometry.top - geometry.previousTop)).toBeLessThan(3)
  const scaled = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('template-use-surface')).doc
    const block = doc.getBlockById('inline-weather-text')
    const before = block.toSnapshot(false)
    const length = block.textLength
    block.applyDeltaOperations([{retain: length, attributes: {'t:fs': 1.5}}])
    return {length, before}
  })
  await expect(weather).toHaveCSS('font-size', '24px')
  await weather.click()
  const dialog = page.getByRole('dialog', {name: '行内天气格式'})
  await expect(dialog).toBeVisible()
  await page.evaluate(() => {
    (window as any).ng.getComponent(document.querySelector('template-use-surface')).doc.toggleReadonly(true)
  })
  await expect(dialog).toHaveCount(0)
  await weather.click()
  await expect(dialog).toHaveCount(0)
  const after = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('template-use-surface')).doc
    const block = doc.getBlockById('inline-weather-text')
    return {length: block.textLength, snapshot: block.toSnapshot(false)}
  })
  expect(after.length).toBe(scaled.length)
  expect(after.snapshot.children.map((item: any) => item.insert)).toEqual(scaled.before.children.map((item: any) => item.insert))
})
