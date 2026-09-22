import {createInlineWeatherDelta, createInlineWeatherEmbedConverter, formatInlineWeatherDelta, readInlineWeatherDelta} from '.'
import {materializeInlineWeatherSnapshots} from './materialize'
import type {DeltaInsertEmbed, IBlockSnapshot} from '../../framework/block-std/types'
import type {DocWeatherData} from '../../framework/ports/weather'
import {renderInline} from '../../snapshot-viewer/inline/render-inline'

const weather: DocWeatherData = {tone: 'rainy', temp: 19, high: 22, low: 16, condition: '小雨', location: '上海'}
const paragraph = (children: IBlockSnapshot['children']): IBlockSnapshot => ({
  id: 'p', flavour: 'paragraph', nodeType: 'editable', props: {}, meta: {}, children,
} as IBlockSnapshot)

describe('行内天气', () => {
  it('显示格式不改变定格天气，DOM 与只读预览使用同一份数据', () => {
    const converter = createInlineWeatherEmbedConverter()
    const full = createInlineWeatherDelta(weather)
    const compact = {...full, attributes: {weatherFormat: 'temp', 'a:bold': true}}
    expect(formatInlineWeatherDelta(full)).toBe('19°C · 小雨 · 上海')
    expect(formatInlineWeatherDelta(compact)).toBe('19°C')
    expect(formatInlineWeatherDelta(createInlineWeatherDelta(weather, 'condition'))).toBe('小雨')
    expect(formatInlineWeatherDelta(createInlineWeatherDelta(weather, 'weather-temp'))).toBe('19°C · 小雨')
    expect(readInlineWeatherDelta(compact)).toEqual(weather)
    const wrapper = document.createElement('span')
    wrapper.append(converter.toView(compact))
    expect(converter.toDelta(wrapper)).toEqual(compact)
    const preview = renderInline([compact])
    expect(preview.querySelector('.bc-inline-weather')?.textContent?.trim()).toBe('19°C')
    expect(preview.querySelector('svg')).not.toBeNull()
  })

  it('坏数据保留错误占位，城市和天气描述不解释为 HTML', () => {
    const invalid = {insert: {weather: '{bad'}}
    expect(readInlineWeatherDelta(invalid)).toBeNull()
    expect(formatInlineWeatherDelta(invalid)).toBe('天气暂不可用')
    expect(formatInlineWeatherDelta(createInlineWeatherDelta())).toBe('--°C · 天气 · 城市')
    const element = createInlineWeatherEmbedConverter().toView(createInlineWeatherDelta({...weather, location: '<img src=x>'}))
    expect(element.querySelector('img')).toBeNull()
    expect(element.textContent).toContain('<img src=x>')
  })

  it('嵌套模板只查一次天气，保留格式和正文，不改源模板或已有定格值', async () => {
    const draft = createInlineWeatherDelta(undefined, 'temp')
    const frozen = createInlineWeatherDelta(weather)
    const source = [{id: 'c', flavour: 'callout', nodeType: 'block', props: {}, meta: {},
      children: [paragraph([{insert: '今日'}, draft, draft, frozen])]}] as IBlockSnapshot[]
    const query = jasmine.createSpy('query').and.resolveTo(weather)
    const result = await materializeInlineWeatherSnapshots(source, {createdAt: new Date(2026, 8, 22), weather: {query}})
    expect(query).toHaveBeenCalledOnceWith({date: '2026-09-22'}, undefined)
    const deltas = (result[0].children[0] as IBlockSnapshot).children as DeltaInsertEmbed[]
    expect(deltas[0]).toEqual({insert: '今日'} as any)
    expect(readInlineWeatherDelta(deltas[1])).toEqual(weather)
    expect(deltas[1].attributes).toEqual({weatherFormat: 'temp', weatherDate: '2026-09-22'})
    expect(deltas[3]).toBe(frozen)
    expect(draft.insert['weather']).toBe('')
    await materializeInlineWeatherSnapshots(result, {createdAt: new Date(), weather: {query}})
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('天气失败仍可创建文档，取消则不返回可写入的结果', async () => {
    const source = [paragraph([createInlineWeatherDelta()])]
    const result = await materializeInlineWeatherSnapshots(source, {
      createdAt: new Date(), weather: {query: async () => {throw new Error('offline')}},
    })
    expect(formatInlineWeatherDelta(result[0].children[0] as DeltaInsertEmbed)).toBe('天气暂不可用')
    const controller = new AbortController()
    await expectAsync(materializeInlineWeatherSnapshots(source, {
      createdAt: new Date(), signal: controller.signal,
      weather: {query: async () => {controller.abort(); return weather}},
    })).toBeRejected()
  })
})
