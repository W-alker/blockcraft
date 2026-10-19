import {TestBed} from '@angular/core/testing'
import {readWeatherLook} from './weather-look.util'
import {WEATHER_LAYOUTS, weatherPalettePatch} from './weather-presentation'
import {WEATHER_STYLES} from './weather.styles'
import {WeatherCardComponent} from './weather-card.component'
import {WEATHER_WATCHED_PROPS} from './weather-render.component'
import {WEATHER_DISPLAY_CONFIGS} from './weather-config'
import {projectDraftProps} from '../draft-props'

describe('天气展示兼容与状态',()=>{
  it('旧块无样式仍保持160×42、近黑字和原色图标',()=>{
    expect(WEATHER_STYLES.defaultSize).toEqual({width:160,height:42})
    expect(readWeatherLook()).toEqual(jasmine.objectContaining({style:'classic',fg:'#1f2329',bg:'transparent',bw:'0px',iconMode:'original'}))
    expect(readWeatherLook({style:'removed'}).style).toBe('classic')
    expect(readWeatherLook({fg:'#456789',bw:'2px dashed',bc:'#abcdef'})).toEqual(jasmine.objectContaining({fg:'#456789',bw:'2px',bs:'dashed',bc:'#abcdef'}))
  })
  it('新布局默认跟随文档，逐项颜色优先于预设，透明是有效覆盖',()=>{
    expect(readWeatherLook({style:'ledger'}).fg).toBe('inherit')
    expect(readWeatherLook({palette:'blue'}).fg).toBe('#2b4054')
    expect(readWeatherLook({style:'ledger',palette:'dark',bg:'transparent',fg:'#234567',accent:'rgba(20,30,40,.5)'}))
      .toEqual(jasmine.objectContaining({bg:'transparent',fg:'#234567',accent:'rgba(20,30,40,.5)',line:'#697b8b'}))
    expect(weatherPalettePatch('blue')).toEqual({palette:'blue',fg:null,accent:null,line:null,bg:null})
  })
  it('样式注册、面板选项与模板投影覆盖同一组显示字段',()=>{
    expect(WEATHER_STYLES.config.options.map(o=>o.value)).toEqual(WEATHER_LAYOUTS.map(l=>l.id))
    expect(WEATHER_DISPLAY_CONFIGS.every(c=>WEATHER_WATCHED_PROPS.includes(c.key as any))).toBeTrue()
    const props={style:'classic',date:'2026-09-21',fg:'#111111'}
    const look=readWeatherLook(projectDraftProps(props,{'draft:style':'ledger','draft:palette':'blue','draft:fg':null,'draft:range':'off'},WEATHER_WATCHED_PROPS))
    expect(look).toEqual(jasmine.objectContaining({style:'ledger',fg:'#2b4054',showRange:false}))
    expect(props).toEqual({style:'classic',date:'2026-09-21',fg:'#111111'})
  })
  it('加载、失败与模板占位不伪造天气，提供真实温度范围',()=>{
    const fixture=TestBed.createComponent(WeatherCardComponent)
    fixture.componentRef.setInput('layout','ledger')
    fixture.componentRef.setInput('status','loading');fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('获取天气中')
    expect(fixture.nativeElement.textContent).toContain('--°')
    fixture.componentRef.setInput('status','error');fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('天气获取失败')
    fixture.componentRef.setInput('weather',{tone:'snowy',temp:-23.5,condition:'小雪',location:'呼伦贝尔',high:-18,low:-29})
    fixture.componentRef.setInput('status','ready');fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('-23.5°')
    expect(fixture.nativeElement.querySelector('.weather-card__range').textContent).toContain('-29°')
    fixture.componentRef.setInput('showRange',false);fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('.weather-card__range').style.visibility).toBe('hidden')
    fixture.destroy()
  })
})
