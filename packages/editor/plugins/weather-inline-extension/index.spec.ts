import {TestBed} from '@angular/core/testing'
import {provideNoopAnimations} from '@angular/platform-browser/animations'
import {WeatherInlineExtensionPlugin} from '.'
import {InlineWeatherFormatDialog} from './weather-format-dialog'
import {createInlineWeatherDelta, createInlineWeatherEmbedConverter} from '../../embeds/weather'
import {WeatherToolbarComponent} from '../weather-toolbar/weather-toolbar.component'

const oldWeather = {tone:'sunny' as const,temp:20,high:25,low:15,condition:'晴',location:'杭州'}
async function settle() { for(let i=0;i<8;i++) await Promise.resolve() }
describe('天气刷新弹窗',()=>{
  beforeEach(()=>TestBed.configureTestingModule({providers:[provideNoopAnimations()]}))
  function setup() {
    const fixture=TestBed.createComponent(InlineWeatherFormatDialog)
    const delta=createInlineWeatherDelta(oldWeather,'temp')
    delta.attributes={...delta.attributes,weatherDate:'2026-09-21','a:bold':true}
    const element=createInlineWeatherEmbedConverter().toView(delta)
    const host=document.createElement('div');host.dataset['blockId']='p';host.append(element);document.body.append(host)
    const apply=jasmine.createSpy('applyDeltaOperations'), query=jasmine.createSpy('query')
    const block={id:'p',applyDeltaOperations:apply}
    const doc={messageService:{success:jasmine.createSpy('success'),error:jasmine.createSpy('error')},isReadonly:false,isEditable:()=>true,getBlockById:()=>block,
      injector:{get:()=>({query})},crud:{undoManager:{stopCapturing:jasmine.createSpy()}},
      overlayService:{createConnectedOverlay:()=>({componentRef:fixture.componentRef})}}
    const plugin=new WeatherInlineExtensionPlugin();(plugin as any).doc=doc
    spyOn<any>(plugin,'_tryGetEmbedRange').and.returnValue({start:{type:'text',blockId:'p',offset:3}})
    spyOn(window,'requestAnimationFrame').and.returnValue(1)
    plugin.onInlineClick({getDefaultEvent:()=>({target:element})} as any);fixture.detectChanges()
    const refresh=()=>Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(b=>b.getAttribute('aria-label')==='刷新天气')!
    return {fixture,delta,element,host,apply,query,doc,plugin,refresh}
  }
  it('点击刷新沿用日期，显示加载并禁用；成功写入单个快照并保留属性',async()=>{
    const h=setup();let resolve!:(v:typeof oldWeather)=>void
    h.query.and.callFake(()=>new Promise(r=>resolve=r))
    try {
      const header = h.refresh().closest('.dialog-header')!
      expect(header).not.toBeNull()
      expect(h.refresh().getBoundingClientRect().right).toBe(header.getBoundingClientRect().right)
      expect(h.fixture.nativeElement.querySelector('.actions .refresh-trigger')).toBeNull()
      // 关闭按钮的颜色过渡，断言最终主题色而非动画首帧。
      h.refresh().style.transition = 'none'
      h.fixture.nativeElement.style.setProperty('--bc-color', 'rgb(35, 45, 55)')
      expect(getComputedStyle(h.refresh()).color).withContext(h.refresh().outerHTML + ' theme=' + getComputedStyle(h.refresh()).getPropertyValue('--bc-color')).toBe('rgb(35, 45, 55)')
      expect(getComputedStyle(h.refresh()).backgroundColor).toBe('rgba(0, 0, 0, 0)')
      h.fixture.nativeElement.style.setProperty('--bc-color', 'rgb(225, 230, 235)')
      expect(getComputedStyle(h.refresh()).color).toBe('rgb(225, 230, 235)')
      h.refresh().click();h.fixture.detectChanges()
      expect(h.refresh().disabled).toBeTrue();expect(h.refresh().querySelector('.cs-btn-loading-icon')).not.toBeNull();expect(h.refresh().querySelector('.bc_icon')).toBeNull()
      expect(h.query).toHaveBeenCalledOnceWith({date:'2026-09-21',refresh:true},jasmine.any(AbortSignal))
      const weather={...oldWeather,temp:28};resolve(weather);await settle()
      expect(h.apply).toHaveBeenCalledOnceWith([{retain:3},{delete:1},{insert:{weather:JSON.stringify(weather)},attributes:h.delta.attributes}])
      expect(h.doc.crud.undoManager.stopCapturing).toHaveBeenCalledTimes(2)
      expect(h.doc.messageService.success).toHaveBeenCalledOnceWith('天气已刷新')
    } finally {h.plugin.destroy();h.host.remove()}
  })
  it('失败保留旧值并可重试；关闭后不写入迟到结果',async()=>{
    const h=setup();h.query.and.rejectWith(new Error('offline'))
    try {
      h.refresh().click();await settle();h.fixture.detectChanges()
      expect(h.apply).not.toHaveBeenCalled();expect(h.refresh().disabled).toBeFalse()
      expect(h.doc.messageService.error).toHaveBeenCalledOnceWith('天气刷新失败，请重试')
      expect(h.fixture.nativeElement.querySelector('[role=status]')).toBeNull()
      let resolve!:(v:typeof oldWeather)=>void
      h.query.and.callFake(()=>new Promise(r=>resolve=r));h.refresh().click()
      h.plugin.closeDialog();resolve({...oldWeather,temp:28});await settle()
      expect(h.apply).not.toHaveBeenCalled()
      expect(h.doc.messageService.success).not.toHaveBeenCalled()
      expect(h.doc.messageService.error).toHaveBeenCalledTimes(1)
    } finally {h.plugin.destroy();h.host.remove()}
  })
  it('请求中变只读或锚点被移除，不提交',async()=>{
    const h=setup();let resolve!:(v:typeof oldWeather)=>void
    h.query.and.callFake(()=>new Promise(r=>resolve=r))
    try {
      h.refresh().click();h.doc.isReadonly=true;h.element.remove();resolve(oldWeather);await settle()
      expect(h.apply).not.toHaveBeenCalled()
      expect(h.doc.messageService.success).not.toHaveBeenCalled()
    } finally {h.plugin.destroy();h.host.remove()}
  })
  it('模板行内天气不提供刷新入口',()=>{
    const fixture=TestBed.createComponent(InlineWeatherFormatDialog)
    fixture.componentRef.setInput('delta',createInlineWeatherDelta());fixture.detectChanges()
    const refresh=Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(b=>b.getAttribute('aria-label')==='刷新天气')!
    expect(refresh).toBeUndefined()
  })
  it('天气块刷新按钮读取响应状态，保留设置入口',()=>{
    const fixture=TestBed.createComponent(WeatherToolbarComponent)
    const block={canRefreshWeather:true,weatherStatus:'ready',refreshWeather:jasmine.createSpy()}
    fixture.componentRef.setInput('block',block);fixture.detectChanges()
    const button=fixture.nativeElement.querySelector('button') as HTMLButtonElement
    expect(getComputedStyle(button.parentElement!).display).toBe('flex')
    expect(button.textContent?.trim()).toBe('')
    expect(button.querySelector('.bc_huanyige')).not.toBeNull()
    expect(button.getBoundingClientRect().width).toBe(28)
    button.click();expect(block.refreshWeather).toHaveBeenCalledTimes(1)
    fixture.componentRef.setInput('block',{...block,weatherStatus:'loading'});fixture.detectChanges()
    expect(button.disabled).toBeTrue();expect(button.querySelector('.cs-btn-loading-icon')).not.toBeNull();expect(button.querySelector('.bc_icon')).toBeNull()
    expect(fixture.nativeElement.querySelector('[aria-label="天气样式与配色"]')).not.toBeNull()
  })
})
