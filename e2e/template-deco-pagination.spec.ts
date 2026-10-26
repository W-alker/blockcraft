import {expect, test} from '@playwright/test'

const templateStorageKey = 'bc-template-deco-payload-v2'
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ' +
  'AAAADUlEQVR42mNk+M/wHwAF/gL+Xw4ZAAAAAElFTkSuQmCC',
  'base64',
)

test.beforeEach(async ({page}) => {
  await page.addInitScript(key => localStorage.removeItem(key), templateStorageKey)
})

test('template page persists A4 pagination and repeats a removable page background', async ({page}) => {
  test.setTimeout(60_000)
  await page.goto('/template')
  await expect(page.getByRole('button', {name: '使用模版'})).toBeEnabled()

  await page.getByRole('tab', {name: '动态能力'}).click()
  const pagination = page.getByRole('button', {name: '分页布局'})
  const clearBackground = page.getByRole('button', {name: '取消背景'})
  const background = page.locator('.insert-item').filter({hasText: '背景图'})

  await expect(pagination).toHaveAttribute('aria-pressed', 'false')
  await expect(clearBackground).toBeDisabled()
  await pagination.click()
  await expect(pagination).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.editor-scroll.bc-paginated-scroll')).toBeVisible()

  const addParagraph = page.getByRole('button', {name: '追加段落'})
  for (let index = 0; index < 70; index++) {
    await addParagraph.click()
  }
  await expect.poll(
    () => page.locator('.bc-page-sheet').count(),
    {timeout: 10_000},
  ).toBeGreaterThan(1)

  const fileChooser = page.waitForEvent('filechooser')
  await background.click()
  await (await fileChooser).setFiles({
    name: 'template-background.png',
    mimeType: 'image/png',
    buffer: tinyPng,
  })
  await expect(clearBackground).toBeEnabled()

  await expect.poll(async () => {
    const images = await page.locator('.bc-page-sheet').evaluateAll(
      sheets => sheets.map(sheet => getComputedStyle(sheet).backgroundImage),
    )
    return images.length > 1 &&
      images.every(image => image !== 'none' && image === images[0])
  }).toBe(true)

  await page.getByRole('button', {name: '使用模版'}).click()
  await expect(page).toHaveURL(/\/template\/use$/)
  await expect(page.locator('.editor-scroll.bc-paginated-scroll')).toBeVisible()
  await expect.poll(
    () => page.locator('.bc-page-sheet').count(),
    {timeout: 10_000},
  ).toBeGreaterThan(1)
  await expect.poll(async () => {
    const images = await page.locator('.bc-page-sheet').evaluateAll(
      sheets => sheets.map(sheet => getComputedStyle(sheet).backgroundImage),
    )
    return images.length > 1 &&
      images.every(image => image !== 'none' && image === images[0])
  }).toBe(true)

  await page.getByRole('link', {name: '返回编辑'}).click()
  await page.getByRole('tab', {name: '动态能力'}).click()
  await page.getByRole('button', {name: '取消背景'}).click()
  await expect(page.getByRole('button', {name: '取消背景'})).toBeDisabled()
  await expect.poll(async () => {
    const images = await page.locator('.bc-page-sheet').evaluateAll(
      sheets => sheets.map(sheet => getComputedStyle(sheet).backgroundImage),
    )
    return images.length > 0 && images.every(image => image === 'none')
  }).toBe(true)

  await page.getByRole('button', {name: '分页布局'}).click()
  await expect(page.locator('.editor-scroll.bc-paginated-scroll')).toHaveCount(0)
  await expect(page.locator('.editor-container')).toHaveCSS('background-image', 'none')
})

test('legacy template payload defaults to continuous layout', async ({page}) => {
  await page.addInitScript(({key}) => {
    localStorage.setItem(key, JSON.stringify({
      snapshot: null,
      background: null,
    }))
  }, {key: templateStorageKey})

  await page.goto('/template')
  await expect(page.getByRole('button', {name: '使用模版'})).toBeEnabled()
  await page.getByRole('tab', {name: '动态能力'}).click()

  await expect(page.getByRole('button', {name: '分页布局'}))
    .toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.editor-scroll.bc-paginated-scroll')).toHaveCount(0)
})
