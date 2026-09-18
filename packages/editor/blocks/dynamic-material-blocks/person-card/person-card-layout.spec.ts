import {NgZone} from '@angular/core'
import {ShapeResizerComponent} from '../../shape-block/shape-resizer.component'
import {calculatePersonCardResize, personCardContentScale, personCardFonts, storePersonCardFont} from './person-card-layout'

const start = {width: 300, height: 100, offsetX: 0, offsetY: 0}

describe('人员卡片排版与缩放', () => {
  it('边手柄只改变对应尺寸，左上边保持对边锚点', () => {
    expect(calculatePersonCardResize('east', start, 100, 80)).toEqual({...start, width: 400})
    expect(calculatePersonCardResize('north', start, 100, -40)).toEqual({...start, height: 140, offsetY: -40})
  })
  it('四角维持比例，限宽和最小尺寸不破坏比例', () => {
    for (const handle of ['north-west', 'north-east', 'south-west', 'south-east'] as const) {
      const west = handle.includes('west'), north = handle.includes('north')
      const box = calculatePersonCardResize(handle, start, west ? -150 : 150, north ? -50 : 50, 420)
      expect(box.width).toBe(420)
      expect(box.height).toBe(140)
      expect(box.offsetX).toBe(west ? -120 : 0)
      expect(box.offsetY).toBe(north ? -40 : 0)
    }
    const tiny = calculatePersonCardResize('south-east', start, -295, -95)
    expect(tiny.height).toBe(32)
    expect(tiny.width / tiny.height).toBe(3)
  })
  it('缺少独立倍率的旧卡片沿用旧视觉尺度，字号覆盖按样式隔离', () => {
    expect(personCardContentScale({}, 2)).toBe(2)
    expect(personCardContentScale({sc: 1}, 2)).toBe(1)
    expect(personCardFonts('row', {fsr: '20'}).map(f => f.size)).toEqual([20, 12])
    expect(personCardFonts('column', {fsr: '20'}).map(f => f.size)).toEqual([14, 11])
  })
  it('字号存储只保留非默认项，裁剪尾部默认并限制小数', () => {
    expect(storePersonCardFont('row', {}, 'name', 20.12345)).toEqual({fsr: '20.12'})
    expect(storePersonCardFont('row', {}, 'desc', 14)).toEqual({fsr: '- 14'})
    expect(storePersonCardFont('row', {fsr: '20'}, 'name', 15)).toEqual({fsr: null})
    expect(personCardFonts('rowPinyin', {fsp: '- 10 13'}).map(f => f.size)).toEqual([15, 10, 13])
  })
  it('共享手柄实时缩放 CSS 倍率，取消恢复，边手柄不缩放', () => {
    const target = document.createElement('div')
    target.style.cssText = 'width:300px;height:100px;--pc-scale:1.5'
    document.body.appendChild(target)
    const zone = {run: (fn: () => unknown) => fn(), runOutsideAngular: (fn: () => unknown) => fn()} as NgZone
    const resizer = new ShapeResizerComponent(zone)
    resizer.target = target
    resizer.scaleVariable = '--pc-scale'
    resizer.resizeCalculator = calculatePersonCardResize
    const down = new MouseEvent('pointerdown', {button: 0, clientX: 0, clientY: 0}) as PointerEvent
    Object.defineProperty(down, 'pointerId', {value: 1})
    Object.defineProperty(down, 'currentTarget', {value: target})
    resizer.onPointerDown(down, 'south-east')
    // 最终 pointerup 不依赖 RAF，验证快速拖动同样提交正确内容尺度。
    window.dispatchEvent(new PointerEvent('pointerup', {pointerId: 1, clientX: 150, clientY: 50}))
    expect(Number(target.style.getPropertyValue('--pc-scale'))).toBe(2.25)
    resizer.onPointerDown(down, 'east')
    window.dispatchEvent(new PointerEvent('pointerup', {pointerId: 1, clientX: 100, clientY: 0}))
    expect(Number(target.style.getPropertyValue('--pc-scale'))).toBe(2.25)
    resizer.onPointerDown(down, 'south-east')
    target.style.setProperty('--pc-scale', '9')
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))
    expect(Number(target.style.getPropertyValue('--pc-scale'))).toBe(2.25)
    resizer.ngOnDestroy()
    target.remove()
  })
})
