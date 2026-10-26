import {expect, test, type Page} from '@playwright/test'

const editorSelector = 'block-craft-editor'

interface TableImageTarget {
  tableId: string
  imageId: string
}

interface TableImageLayout {
  frame: {top: number; bottom: number; width: number; height: number}
  image: {top: number; bottom: number; width: number; height: number}
  naturalWidth: number
  naturalHeight: number
  frameClientHeight: number
  frameScrollHeight: number
  cellClientHeight: number
  cellScrollHeight: number
  cellScrollTopAfterWrite: number
  resourceState: string | undefined
  ariaBusy: boolean
  placeholderAriaHidden: string | null
}

async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction((selector) => {
    const element = document.querySelector(selector)
    const debug = (
      window as unknown as {
        ng?: {
          getComponent: (target: Element) => {
            doc?: {isInitialized?: boolean}
          }
        }
      }
    ).ng
    return !!element && !!debug?.getComponent(element)?.doc?.isInitialized
  }, editorSelector)
}

async function initializeEditor(page: Page): Promise<void> {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    const isExternalHttp =
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname !== '127.0.0.1' &&
      url.hostname !== 'localhost'
    return isExternalHttp ? route.abort() : route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await waitForEditor(page)
}

async function waitForAnimationFrames(page: Page, count = 2): Promise<void> {
  await page.evaluate(async (frames) => {
    for (let index = 0; index < frames; index++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      )
    }
  }, count)
}

async function createTableImage(page: Page): Promise<TableImageTarget> {
  return page.evaluate(async (selector) => {
    const canvas = document.createElement('canvas')
    canvas.width = 3000
    canvas.height = 4500
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context is unavailable')
    context.fillStyle = '#101820'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#f2c94c'
    context.fillRect(900, 1800, 1200, 900)

    const editor = document.querySelector(selector)
    const debug = (
      window as unknown as {
        ng: {getComponent: (target: Element) => {doc: any}}
      }
    ).ng
    const doc = debug.getComponent(editor!).doc
    const image = doc.schemas.createSnapshot('image', [
      {
        src: canvas.toDataURL('image/png'),
        wr: 12,
        ar: 2 / 3,
      },
    ])
    const table = doc.schemas.createSnapshot('table', [1, 1])
    table.props.colWidths = [100]
    table.children[0].children[0].children = [image]

    doc.selection.blur()
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [table])
    doc.virtualization?.ensureViewMounted?.([table.id])
    await doc.navigateToBlock(table.id)

    return {tableId: table.id, imageId: image.id}
  }, editorSelector)
}

async function waitForReadyImage(
  page: Page,
  target: TableImageTarget,
): Promise<void> {
  await page.waitForFunction(
    ({selector, imageId}) => {
      const editor = document.querySelector(selector)
      const frame = editor?.querySelector<HTMLElement>(
        `.image-block[data-block-id="${imageId}"] .img-wrapper[data-bc-object-sizing]`,
      )
      const image = frame?.querySelector<HTMLImageElement>(':scope > img')
      return (
        frame?.dataset['bcResourceState'] === 'ready' &&
        image?.complete === true &&
        image.naturalWidth === 3000 &&
        image.naturalHeight === 4500
      )
    },
    {selector: editorSelector, imageId: target.imageId},
  )
  await waitForAnimationFrames(page)
}

async function readTableImageLayout(
  page: Page,
  target: TableImageTarget,
): Promise<TableImageLayout> {
  return page.evaluate(
    ({selector, tableId, imageId}) => {
      const editor = document.querySelector(selector)
      const table = editor?.querySelector<HTMLElement>(
        `.table-block[data-block-id="${tableId}"]`,
      )
      const frame = table?.querySelector<HTMLElement>(
        `.image-block[data-block-id="${imageId}"] .img-wrapper[data-bc-object-sizing]`,
      )
      const image = frame?.querySelector<HTMLImageElement>(':scope > img')
      const cell = frame?.closest<HTMLTableCellElement>('td.table-cell-block')
      if (!frame || !image || !cell) {
        throw new Error('Table image DOM is unavailable')
      }

      const frameRect = frame.getBoundingClientRect()
      const imageRect = image.getBoundingClientRect()
      cell.scrollTop = 100
      const cellScrollTopAfterWrite = cell.scrollTop
      cell.scrollTop = 0

      return {
        frame: {
          top: frameRect.top,
          bottom: frameRect.bottom,
          width: frameRect.width,
          height: frameRect.height,
        },
        image: {
          top: imageRect.top,
          bottom: imageRect.bottom,
          width: imageRect.width,
          height: imageRect.height,
        },
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        frameClientHeight: frame.clientHeight,
        frameScrollHeight: frame.scrollHeight,
        cellClientHeight: cell.clientHeight,
        cellScrollHeight: cell.scrollHeight,
        cellScrollTopAfterWrite,
        resourceState: frame.dataset['bcResourceState'],
        ariaBusy: frame.hasAttribute('aria-busy'),
        placeholderAriaHidden:
          frame
            .querySelector(':scope > .bc-resource-placeholder')
            ?.getAttribute('aria-hidden') ?? null,
      }
    },
    {
      selector: editorSelector,
      tableId: target.tableId,
      imageId: target.imageId,
    },
  )
}

test('ratio image uses its wrapper as the table-cell layout frame', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await initializeEditor(page)

  const target = await createTableImage(page)
  await waitForReadyImage(page, target)
  const layout = await readTableImageLayout(page, target)
  const expectedImageHeight =
    (layout.image.width * layout.naturalHeight) / layout.naturalWidth

  expect(layout.resourceState).toBe('ready')
  expect(layout.ariaBusy).toBe(false)
  expect(layout.placeholderAriaHidden).toBe('true')
  expect(Math.abs(layout.image.width - layout.frame.width)).toBeLessThan(1)
  expect(Math.abs(layout.image.height - expectedImageHeight)).toBeLessThan(1)
  expect(layout.image.top).toBeGreaterThanOrEqual(layout.frame.top - 1)
  expect(layout.image.bottom).toBeLessThanOrEqual(layout.frame.bottom + 1)
  expect(layout.frameScrollHeight).toBeLessThanOrEqual(
    layout.frameClientHeight + 1,
  )
  expect(layout.cellScrollHeight).toBeLessThanOrEqual(
    layout.cellClientHeight + 1,
  )
  expect(layout.cellScrollTopAfterWrite).toBeLessThanOrEqual(1)
})

test('ratio image wrapper owns the loading skeleton background', async ({
  page,
}) => {
  await initializeEditor(page)

  const target = await createTableImage(page)
  await waitForReadyImage(page, target)
  const skeleton = await page.evaluate(
    ({selector, imageId}) => {
      const editor = document.querySelector(selector)
      const frame = editor?.querySelector<HTMLElement>(
        `.image-block[data-block-id="${imageId}"] .img-wrapper[data-bc-object-sizing]`,
      )
      const overlaySkeleton = frame?.querySelector<HTMLElement>(
        ':scope > .bc-resource-placeholder > .bc-resource-placeholder__skeleton',
      )
      if (!frame || !overlaySkeleton) {
        throw new Error('Image placeholder DOM is unavailable')
      }

      const previousState = frame.dataset['bcResourceState']
      frame.dataset['bcResourceState'] = 'loading'
      const frameStyle = getComputedStyle(frame)
      const backgroundImage = frameStyle.backgroundImage
      const backgroundColor = frameStyle.backgroundColor
      const overlaySkeletonDisplay = getComputedStyle(overlaySkeleton).display
      if (previousState === undefined) delete frame.dataset['bcResourceState']
      else frame.dataset['bcResourceState'] = previousState

      return {backgroundImage, backgroundColor, overlaySkeletonDisplay}
    },
    {selector: editorSelector, imageId: target.imageId},
  )

  expect(skeleton.backgroundImage).not.toBe('none')
  expect(skeleton.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(skeleton.overlaySkeletonDisplay).toBe('none')
})
