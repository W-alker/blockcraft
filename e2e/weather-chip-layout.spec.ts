import {expect, test, type Page} from '@playwright/test'

const sizes = [160, 220, 320]

async function openWeather(page: Page, location: string): Promise<void> {
  await page.addInitScript(({sizes, location}) => {
    localStorage.setItem('bc-template-deco-payload-v2', JSON.stringify({
      snapshot: {
        id: 'weather-layout-root', flavour: 'root', nodeType: 'root', props: {}, meta: {},
        children: sizes.map(width => ({
          id: `weather-layout-${width}`, flavour: 'weather', nodeType: 'void', meta: {}, children: [],
          props: {
            width, height: width * 42 / 160, date: '2026-09-16', bw: '2px solid',
            frozen: {location, condition: '多云', temp: 30, tone: 'cloudy'},
          },
        })),
      },
      background: null, paginationEnabled: false,
    }))
  }, {sizes, location})
  await page.goto('/template/use')
  await expect(page.locator('.weather-block')).toHaveCount(sizes.length)
}

async function measureWeather(page: Page, width: number) {
  const chip = page.locator(`[data-block-id="weather-layout-${width}"] .tpl-weather-chip`)
  await expect(chip).toContainText('多云')
  return chip.evaluate(element => {
    const icon = element.querySelector('weather-mark')!
    const column = icon.nextElementSibling as HTMLElement
    const subtitle = column.lastElementChild as HTMLElement
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const contentRight = rect.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth)
    return {
      unusedWidth: contentRight - column.getBoundingClientRect().right,
      clientWidth: subtitle.clientWidth,
      scrollWidth: subtitle.scrollWidth,
      iconWidth: icon.getBoundingClientRect().width,
      expectedIconWidth: 33.6 * parseFloat(style.getPropertyValue('--u')),
      chipWidth: rect.width,
      textOverflow: getComputedStyle(subtitle).textOverflow,
    }
  })
}

test('天气文字列在不同块尺寸下使用图标右侧的全部可用宽度', async ({page}) => {
  await openWeather(page, '新加坡')
  for (const width of sizes) {
    const geometry = await measureWeather(page, width)
    expect(Math.abs(geometry.unusedWidth)).toBeLessThan(1)
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
    expect(Math.abs(geometry.iconWidth - geometry.expectedIconWidth)).toBeLessThan(1)
    expect(geometry.chipWidth).toBeCloseTo(width, 0)
  }
})

test('地点过长时在用满宽度后省略并保留图标与固定块尺寸', async ({page}) => {
  await openWeather(page, '这是一个用于检查文字溢出边界的很长的城市名称')
  for (const width of sizes) {
    const geometry = await measureWeather(page, width)
    expect(Math.abs(geometry.unusedWidth)).toBeLessThan(1)
    expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth)
    expect(geometry.textOverflow).toBe('ellipsis')
    expect(Math.abs(geometry.iconWidth - geometry.expectedIconWidth)).toBeLessThan(1)
    expect(geometry.chipWidth).toBeCloseTo(width, 0)
  }
})
