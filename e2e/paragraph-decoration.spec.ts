import {expect, test} from '@playwright/test'

test('paragraph decoration keeps rich text editable and ignores old divider labels', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  const ids = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const title = doc.schemas.createSnapshot('paragraph', [[{insert:'01 ',attributes:{'s:color':'#AB8A60'}},{insert:'感悟',attributes:{'t:ff':'serif'}}]])
    title.props.decoration = {position:'after',color:'#D4C2A7',width:1,gap:12}
    const body = doc.schemas.createSnapshot('paragraph', [''])
    body.meta = {plh:'记录今天的感悟',plhMode:'always'}
    const region = doc.schemas.createSnapshot('render-unit', [{}, {p:[22,25],backColor:'#F0E7D6',borders:{top:'2px solid #9A7654'}}])
    region.children = [title,body]
    const plain = doc.schemas.createSnapshot('paragraph', ['普通段落'])
    const divider = doc.schemas.createSnapshot('divider', [])
    divider.props = {text:'旧文字不显示',fontSize:30,color:'red',style:'solid',length:'full',thickness:'thin'}
    doc.crud.insertBlockSnapshots(doc.rootId,0,[region,plain,divider])
    doc.crud.undoManager.stopCapturing()
    doc.crud.undoManager.clearHistory()
    doc.selection.setCursorAtBlock(title.id,false,false)
    return {title:title.id,body:body.id,plain:plain.id,region:region.id,divider:divider.id}
  })
  const title = page.locator(`[data-block-id="${ids.title}"]`)
  const region = page.locator(`[data-block-id="${ids.region}"]`)
  await expect(title).toHaveAttribute('data-bc-deco-position','after')
  await expect(region).toHaveCSS('border-top-width','2px')
  await expect(region).toHaveCSS('border-right-width','0px')
  await expect(page.locator(`[data-block-id="${ids.divider}"] .divide-label`)).toHaveCount(0)
  await expect(page.locator(`[data-block-id="${ids.divider}"]`)).not.toContainText('旧文字不显示')
  await title.locator('.edit-container').click()
  await page.keyboard.press('End')
  await page.keyboard.insertText('成长')
  await expect(title).toContainText('成长')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(title).not.toContainText('成长')
  await page.locator(`[data-block-id="${ids.body}"] .edit-container`).click()
  await page.keyboard.insertText('今天学会了倾听。')
  await expect(page.locator(`[data-block-id="${ids.body}"]`)).toContainText('今天学会了倾听。')
  const plain = page.locator(`[data-block-id="${ids.plain}"]`)
  await plain.locator('.edit-container').click()
  await page.keyboard.press('End')
  await page.keyboard.insertText('仍可编辑')
  await expect(plain).toContainText('仍可编辑')
  const state = await page.evaluate(ids => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return {title:doc.getBlockById(ids.title).textContent(),body:doc.getBlockById(ids.body).textContent()}
  },ids)
  expect(state).toEqual({title:'01 感悟',body:'今天学会了倾听。'})
})

test('decoration positions and independent lengths render in wide and narrow regions', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  const ids = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const result: Record<string,string> = {}
    const regions = [500,200].map(width => {
      const region = doc.schemas.createSnapshot('render-unit', [{}, {width,height:450}])
      region.children = ['before','after','both','above','below'].map(position => {
        const p = doc.schemas.createSnapshot('paragraph',['感悟', {textAlign:position==='above'?'center':undefined,decoration:{position,before:'40px',after:'25%',span:position==='above'?'text':'paragraph',overflow:'hide'}}])
        result[`${width}-${position}`] = p.id
        return p
      })
      return region
    })
    doc.crud.insertBlockSnapshots(doc.rootId,0,regions)
    return result
  })
  for (const position of ['before','after','both','above','below']) {
    const p = page.locator(`[data-block-id="${ids[`500-${position}`]}"]`)
    await expect(p).toHaveAttribute('data-bc-deco-position',position)
    const values = await p.evaluate(el => ({
      before:getComputedStyle(el,'::before').display,
      after:getComputedStyle(el,'::after').display,
      beforeWidth:parseFloat(getComputedStyle(el,'::before').width),
      afterWidth:parseFloat(getComputedStyle(el,'::after').width),
      width:el.getBoundingClientRect().width,
      textLeft:el.querySelector('.edit-container')!.getBoundingClientRect().left - el.getBoundingClientRect().left,
      textWidth:el.querySelector('.edit-container')!.getBoundingClientRect().width,
    }))
    if (position === 'before' || position === 'both') expect(values.beforeWidth).toBeCloseTo(40,0)
    if (position === 'after' || position === 'both') expect(values.afterWidth).toBeCloseTo(125,0)
    if (position === 'above') {
      expect(values.before).toBe('block')
      expect(values.width).toBeGreaterThan(10)
      expect(values.beforeWidth).toBeCloseTo(values.textWidth,0)
      expect(values.textLeft).toBeCloseTo((values.width-values.textWidth)/2,0)
    }
    if (position === 'below') expect(values.afterWidth).toBeCloseTo(500,0)
    const narrow = page.locator(`[data-block-id="${ids[`200-${position}`]}"]`)
    const hidden = await narrow.evaluate(el => [getComputedStyle(el,'::before').display,getComputedStyle(el,'::after').display])
    expect(hidden).toEqual(['none','none'])
  }
})
