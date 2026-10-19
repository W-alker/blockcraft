import {Component} from '@angular/core'
import {TestBed} from '@angular/core/testing'
import {wireWeatherChip, WeatherChipSource} from './weather-chip.util'
import {DocWeatherData} from '../../../framework/ports/weather'

const oldWeather: DocWeatherData = {tone:'sunny',temp:20,high:25,low:15,condition:'晴',location:'杭州'}
let source: WeatherChipSource
@Component({standalone:true,template:'{{chip.status()}} {{chip.view()?.temp}}'})
class Harness { readonly chip = wireWeatherChip(source) }

async function settle() { for (let i=0;i<8;i++) await Promise.resolve() }
describe('天气主动刷新', () => {
  it('已有固定值仍重新请求原日期，合并重复点击；成功后定格新值', async () => {
    let frozen = oldWeather
    let resolve!: (weather:DocWeatherData)=>void
    const query = jasmine.createSpy().and.callFake(()=>new Promise<DocWeatherData>(r=>resolve=r))
    const freeze = jasmine.createSpy().and.callFake((weather)=>frozen=weather)
    const onRefreshResult = jasmine.createSpy('onRefreshResult')
    source={enabled:()=>true,frozen:()=>frozen,request:()=>({date:'2026-09-21'}),query,freeze,onRefreshResult}
    const fixture=TestBed.createComponent(Harness); fixture.detectChanges()
    expect(query).not.toHaveBeenCalled()
    fixture.componentInstance.chip.refresh(); fixture.componentInstance.chip.refresh()
    await settle(); fixture.detectChanges()
    expect(query).toHaveBeenCalledOnceWith({date:'2026-09-21',refresh:true},jasmine.any(AbortSignal))
    expect(fixture.nativeElement.textContent).toContain('loading 20')
    resolve({...oldWeather,temp:22}); await settle(); fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('ready 22')
    expect(onRefreshResult).toHaveBeenCalledOnceWith('success')
    expect(freeze).toHaveBeenCalledOnceWith({...oldWeather,temp:22},{date:'2026-09-21',refresh:true})
    fixture.componentInstance.chip.reload(); await settle(); expect(query).toHaveBeenCalledTimes(1)
  })
  it('失败保留旧值，允许重试；销毁后忽略迟到响应', async () => {
    const freeze=jasmine.createSpy()
    const onRefreshResult=jasmine.createSpy('onRefreshResult')
    const query=jasmine.createSpy().and.rejectWith(new Error('offline'))
    source={enabled:()=>true,frozen:()=>oldWeather,request:()=>({date:'2026-09-21'}),query,freeze,onRefreshResult}
    const fixture=TestBed.createComponent(Harness);fixture.detectChanges()
    fixture.componentInstance.chip.refresh();await settle();fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('error 20')
    let resolve!: (weather:DocWeatherData)=>void
    query.and.callFake(()=>new Promise<DocWeatherData>(r=>resolve=r))
    fixture.componentInstance.chip.refresh();await settle()
    fixture.destroy();resolve({...oldWeather,temp:30});await settle()
    expect(freeze).not.toHaveBeenCalled()
    expect(onRefreshResult).toHaveBeenCalledOnceWith('error')
  })
  it('模板占位始终不联网',async()=>{
    const query=jasmine.createSpy()
    source={enabled:()=>false,frozen:()=>null,request:()=>undefined,query}
    const fixture=TestBed.createComponent(Harness);fixture.detectChanges()
    fixture.componentInstance.chip.refresh();await settle()
    expect(query).not.toHaveBeenCalled()
  })
})
