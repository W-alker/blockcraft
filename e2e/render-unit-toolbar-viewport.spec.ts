import {expect, test} from '@playwright/test'

test('expanded region border settings remain inside a short viewport', async ({page}) => {
  await page.goto('/template')
  await page.getByRole('button', {name: '内容区域', exact: true}).click()
  await page.getByRole('button', {name: '选中内容区域并调整大小'}).click({force: true})
  await expect(page.locator('[data-bc-region-format-toolbar]')).toBeVisible()

  await page.setViewportSize({width: 400, height: 405})
  await page.getByRole('button', {name: '外观选项'}).click()
  const toolbar = page.locator('[data-bc-region-format-toolbar]')
  const railTop = await toolbar.locator('.object-format__rail').evaluate(element => element.getBoundingClientRect().top)
  await toolbar.getByText('轮廓', {exact: true}).click()
  await toolbar.locator('summary').click()

  await expect.poll(() => toolbar.locator('.object-format__panel').evaluate(element => {
    const rect = element.getBoundingClientRect()
    return rect.top >= 11 && rect.bottom <= window.innerHeight - 11 &&
      rect.left >= 0 && rect.right <= window.innerWidth
  })).toBe(true)
  expect(await toolbar.locator('.object-format__rail').evaluate(element => element.getBoundingClientRect().top))
    .toBeCloseTo(railTop, 0)
  const scroll = toolbar.locator('.object-format__scroll')
  await expect.poll(() => scroll.evaluate(
    element => element.scrollHeight > element.clientHeight,
  )).toBe(true)
  await scroll.evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect.poll(() => toolbar.locator('.region-format__hint').evaluate(element => {
    const hint = element.getBoundingClientRect()
    const panel = element.closest('.object-format__panel')!.getBoundingClientRect()
    return hint.top >= panel.top && hint.bottom <= panel.bottom
  })).toBe(true)
})
