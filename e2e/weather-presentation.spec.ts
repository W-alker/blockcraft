import {expect, test, type Page} from '@playwright/test'

test.use({viewport:{width:1600,height:1100}})
const layouts = ['classic','inline','ruled','sidebar','card','stack','ledger']
const labels = ['经典紧凑','行内组合','双线横栏','侧线标记','基础信息卡','纵向组合','气象分栏']
const sizes = [[160,42],[280,80],[270,98],[264,104],[264,152],[156,164],[288,112]]
async function setup(page:Page) {
  await page.routeWebSocket('**',socket=>socket.close())
  await page.goto('/')
  await page.getByRole('button',{name:'初始化',exact:true}).click()
  const id=await page.evaluate(async()=>{
    const doc=(window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snap=doc.schemas.createSnapshot('weather',[])
    snap.props.date='2026-09-21'
    snap.props.frozen={tone:'cloudy',temp:24,condition:'多云',location:'杭州',high:27,low:19}
    doc.crud.insertBlockSnapshots(doc.rootId,0,[snap]);await doc.navigateToBlock(snap.id)
    doc.selection.selectBlock(doc.getBlockById(snap.id))
    return snap.id as string
  })
  await open(page,id)
  return id
}
const frame=(page:Page,id:string)=>page.locator(`block-craft-editor [data-block-id="${id}"] .tpl-weather-chip`)
async function state(page:Page,id:string) {
  return frame(page,id).evaluate((el,id)=>{
    const card=el.querySelector('.weather-card')!,temp=el.querySelector('.weather-card__temp')!
    const doc=(window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const rect=el.getBoundingClientRect(),style=getComputedStyle(card)
    return {width:rect.width,height:rect.height,layout:card.getAttribute('data-layout'),color:style.color,bg:style.backgroundColor,
      temp:temp.textContent,size:parseFloat(getComputedStyle(temp).fontSize),text:card.textContent,
      props:JSON.parse(JSON.stringify(doc.getBlockById(id).props))}
  },id)
}
const dialog=(page:Page)=>page.getByRole('dialog',{name:'天气设置',exact:true})
async function open(page:Page,id:string) {
  await frame(page,id).click()
  await page.getByRole('button',{name:'天气样式与配色',exact:true}).click()
  await expect(dialog(page)).toBeVisible()
}
async function select(page:Page,label:string,option:string) {
  await dialog(page).getByRole('combobox',{name:label,exact:true}).click()
  await page.getByRole('listbox').getByRole('option',{name:option,exact:true}).click()
}
async function pick(page:Page,label:string,color:string) {
  await dialog(page).locator(`cs-color-picker[aria-label="${label}"]`).getByRole('button').click()
  await page.getByRole('radio',{name:color,exact:true}).first().click()
}
async function apply(page:Page) {
  await dialog(page).getByRole('button',{name:'应用',exact:true}).click()
  await expect(dialog(page)).toHaveCount(0)
}
async function undo(page:Page,redo=false) {
  await page.evaluate(redo=>{
    const doc=(window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    redo?doc.crud.undoManager.redo():doc.crud.undoManager.undo()
  },redo)
}
test('七款布局尺寸、六种天气、负温度和长城市名',async({page},info)=>{
  const id=await setup(page)
  await expect(frame(page,id)).toBeVisible()
  const legacy=await state(page,id)
  expect([legacy.width,legacy.height]).toEqual([160,42]);expect(legacy.color).toBe('rgb(31, 35, 41)')
  expect(legacy.text).toContain('杭州 · 多云')
  const settings=page.locator('bc-weather-settings')
  for(let i=0;i<layouts.length;i++) {
    if (i) await open(page,id)
    await select(page,'天气样式',labels[i])
    await apply(page)
    await expect(frame(page,id)).toHaveAttribute('data-style',layouts[i])
    const current=await state(page,id);expect([current.width,current.height]).toEqual(sizes[i])
    const measured=await frame(page,id).evaluate(async(el,{id,layout})=>{
      const doc=(window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const block=doc.getBlockById(id),failures:string[]=[]
      for(const tone of ['sunny','cloudy','rainy','snowy','stormy','foggy']){
        block.updateProps({frozen:{tone,temp:-23.5,high:-18,low:-29,location:'呼伦贝尔市海拉尔区',condition:'雷阵雨伴有冰雹'}})
        await new Promise<void>(r=>requestAnimationFrame(()=>r()));await new Promise<void>(r=>requestAnimationFrame(()=>r()))
        const bounds=el.getBoundingClientRect()
        for(const part of el.querySelectorAll('.weather-card__temp,.weather-card__location,.weather-card__condition,.weather-card__range,weather-mark')){
          if(getComputedStyle(part).display==='none')continue
          const box=part.getBoundingClientRect()
          if(box.left<bounds.left-1 || box.right>bounds.right+1 || box.top<bounds.top-1 || box.bottom>bounds.bottom+1)failures.push(`${layout}/${tone}/${part.className}`)
        }
      }
      return failures
    },{id,layout:layouts[i]})
    expect(measured).toEqual([])
    await frame(page,id).screenshot({path:info.outputPath(`${layouts[i]}.png`)})
  }
})

test('日期同款配置：预览与取消不写入，一次应用、撤销重做及重开',async({page})=>{
  const id=await setup(page),before=await state(page,id)
  await expect(page.locator('aside bc-weather-settings')).toHaveCount(0)
  await select(page,'天气样式','气象分栏')
  await select(page,'天气色调','雾蓝')
  await pick(page,'文字 / 主色','#E5484D')
  await expect(dialog(page).locator('.weather-card')).toHaveCSS('color','rgb(229, 72, 77)')
  expect((await state(page,id)).props).toEqual(before.props)
  await dialog(page).getByRole('button',{name:'取消',exact:true}).click()
  expect((await state(page,id)).props).toEqual(before.props)
  await open(page,id)
  await select(page,'天气样式','气象分栏')
  await select(page,'天气色调','雾蓝')
  await pick(page,'文字 / 主色','#E5484D')
  await select(page,'天气图标颜色','随强调色')
  await dialog(page).getByRole('switch',{name:'显示天气高低温',exact:true}).click()
  await dialog(page).getByRole('switch',{name:'天气透明底色',exact:true}).click()
  await apply(page)
  const changed=await state(page,id)
  expect(changed.color).toBe('rgb(229, 72, 77)');expect(changed.bg).toBe('rgba(0, 0, 0, 0)')
  expect(changed.props.frozen).toEqual(before.props.frozen)
  await expect(frame(page,id).locator('.weather-card__range')).toHaveCSS('visibility','hidden')
  await undo(page);expect((await state(page,id)).props).toEqual(before.props)
  await undo(page,true);expect((await state(page,id)).props).toEqual(changed.props)
  await open(page,id)
  await expect(dialog(page).getByRole('combobox',{name:'天气色调',exact:true})).toContainText('雾蓝')
  await expect(dialog(page).locator('.weather-card')).toHaveCSS('color',changed.color)
  await dialog(page).getByRole('button',{name:'恢复默认颜色',exact:true}).click()
  await apply(page)
  expect((await state(page,id)).color).toBe('rgb(43, 64, 84)')
})

test('缩放与模板草稿：面板预览不改正式数据，应用只写草稿',async({page})=>{
  const id=await setup(page)
  await select(page,'天气样式','基础信息卡');await apply(page)
  await frame(page,id).click()
  const before=await state(page,id),handle=frame(page,id).locator('.mtl-scale__bar--right')
  const rect=(await handle.boundingBox())!
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down()
  await page.mouse.move(rect.x+rect.width/2+60,rect.y+rect.height/2,{steps:6});await page.mouse.up()
  const after=await state(page,id)
  expect(after.width).toBeGreaterThan(before.width);expect(after.size/before.size).toBeCloseTo(after.width/before.width,2)
  await page.evaluate(id=>{
    const doc=(window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.undoManager.stopCapturing();doc.crud.transact(()=>doc.getBlockById(id).updateMeta({'draft:palette':'clay','draft:fg':'#345678'}));doc.crud.undoManager.stopCapturing()
  },id)
  await open(page,id)
  await select(page,'天气图标颜色','随强调色')
  await dialog(page).getByRole('button',{name:'恢复默认颜色',exact:true}).click()
  expect((await state(page,id)).props).toEqual(after.props)
  await apply(page)
  const draft=await page.evaluate(id=>{
    const doc=(window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc,block=doc.getBlockById(id)
    return {meta:JSON.parse(JSON.stringify(block.meta)),props:JSON.parse(JSON.stringify(block.props))}
  },id)
  expect(draft.meta['draft:iconMode']).toBe('mono');expect(draft.meta['draft:fg']).toBe('')
  expect(draft.props).toEqual(after.props)
  await undo(page)
  await expect.poll(async()=>(await state(page,id)).color).toBe('rgb(52, 86, 120)')
})

test('跟随主题与透明背景，日期同款取色器可自定义透明度',async({page})=>{
  const id=await setup(page)
  await select(page,'天气样式','双线横栏');await select(page,'天气色调','跟随文档')
  await dialog(page).getByRole('switch',{name:'天气透明底色',exact:true}).click()
  await apply(page)
  expect((await state(page,id)).bg).not.toBe('rgba(0, 0, 0, 0)')
  const light=(await state(page,id)).color
  await page.getByRole('button',{name:'主题',exact:true}).press('Enter')
  await expect.poll(async()=>(await state(page,id)).color).not.toBe(light)
  await open(page,id)
  await dialog(page).locator('cs-color-picker[aria-label="背景色"]').getByRole('button').click()
  await page.getByRole('button',{name:'更多颜色',exact:true}).click()
  await page.getByRole('textbox',{name:'Hex',exact:true}).fill('ABCDEF')
  await page.getByRole('textbox',{name:'Hex',exact:true}).press('Enter')
  await page.getByRole('textbox',{name:'透明度',exact:true}).fill('0')
  await page.getByRole('textbox',{name:'透明度',exact:true}).press('Enter')
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeVisible()
  await apply(page)
  expect((await state(page,id)).bg).toBe('rgba(171, 205, 239, 0)')
})

test('切换块、Esc、外部点击与只读丢弃未应用编辑',async({page})=>{
  const id=await setup(page),before=await state(page,id),toolbar=page.getByTestId('weather-toolbar')
  await select(page,'天气色调','苔绿')
  const other=await page.evaluate(async()=>{
    const doc=(window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snap=doc.schemas.createSnapshot('weather',[])
    snap.props={style:'ledger',date:'2026-09-21',frozen:{tone:'sunny',temp:28,location:'苏州',condition:'晴'}}
    doc.crud.insertBlockSnapshots(doc.rootId,0,[snap]);await doc.navigateToBlock(snap.id)
    doc.selection.selectBlock(doc.getBlockById(snap.id));return snap.id as string
  })
  await expect(dialog(page)).toHaveCount(0)
  expect((await state(page,id)).props).toEqual(before.props)
  await open(page,other);await select(page,'天气色调','雾蓝')
  await page.keyboard.press('Escape');await expect(toolbar).toHaveCount(0)
  expect((await state(page,other)).props.palette).toBeUndefined()
  await open(page,id);await select(page,'天气色调','陶土')
  await page.getByRole('heading',{name:'编辑器主内容区',exact:true}).click()
  await expect(toolbar).toHaveCount(0);expect((await state(page,id)).props).toEqual(before.props)
  await open(page,id)
  await page.getByRole('button',{name:'只读',exact:true}).press('Enter')
  await expect(toolbar).toHaveCount(0)
  await frame(page,id).click();await expect(toolbar).toHaveCount(0)
})

test('删除及重建文档释放嵌套取色浮层',async({page})=>{
  const id=await setup(page),toolbar=page.getByTestId('weather-toolbar')
  await dialog(page).locator('cs-color-picker[aria-label="背景色"]').getByRole('button').click()
  await page.evaluate(id=>{
    const doc=(window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.undoManager.stopCapturing();doc.crud.deleteBlockById(id)
  },id)
  await expect(toolbar).toHaveCount(0)
  await expect(page.getByRole('dialog',{name:'打开颜色选择器',exact:true})).toHaveCount(0)
  await page.evaluate(async id=>{
    const doc=(window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.undoManager.undo();await doc.navigateToBlock(id);doc.selection.selectBlock(doc.getBlockById(id))
  },id)
  await expect(toolbar).toHaveCount(1)
  await page.getByRole('button',{name:'初始化',exact:true}).click();await expect(toolbar).toHaveCount(0)
  await page.getByRole('button',{name:'插入天气样式示例',exact:true}).click();await expect(toolbar).toHaveCount(1)
})
