import {BlockNodeType, type IBlockSnapshot} from '../block-std'
import * as Y from 'yjs'
import {checkIncomingContentSize, checkIncomingSourceSize, checkIncomingTextSize, DEFAULT_MAX_INCOMING_CONTENT_BYTES, measureIncomingContentBytes} from './incoming-content'

const paragraph = (text: string): IBlockSnapshot => ({
  id: 'p', flavour: 'paragraph', nodeType: BlockNodeType.editable,
  props: {}, meta: {}, children: [{insert: text}],
})

describe('incoming collaboration content budget', () => {
  const host = (maxIncomingContentBytes?: number) => ({
    config: {maxIncomingContentBytes}, messageService: {warn: jasmine.createSpy('warn')},
  } as any)

  it('allows exactly the limit and rejects one encoded byte over it', () => {
    const content = {inline: [{insert: '中文😀'}]}
    const size = measureIncomingContentBytes(content)
    expect(checkIncomingContentSize(host(size), content)).toBeTrue()
    expect(checkIncomingContentSize(host(size - 1), content)).toBeFalse()
    expect(measureIncomingContentBytes(content)).toBe(size)
  })

  it('defaults to 1.5 MiB and counts encoded UTF-8 rather than JS characters', () => {
    expect(DEFAULT_MAX_INCOMING_CONTENT_BYTES).toBe(1572864)
    const doc = host()
    expect(checkIncomingContentSize(doc, {inline: [{insert: 'a'.repeat(600000)}]})).toBeTrue()
    expect(checkIncomingContentSize(doc, {inline: [{insert: '中'.repeat(600000)}]})).toBeFalse()
    expect(doc.messageService.warn).toHaveBeenCalledOnceWith('本次粘贴或导入的协同内容超过 1.5 MB，请分批插入')
  })

  it('counts block structure, props, metadata and inline embed payloads without mutating input', () => {
    const snapshot = paragraph('small')
    snapshot.props['payload'] = 'x'.repeat(1024)
    snapshot.meta['plh'] = 'y'.repeat(1024)
    snapshot.children = [{insert: {image: 'data:image/png;base64,' + 'z'.repeat(1024)}}]
    const before = JSON.stringify(snapshot)
    expect(checkIncomingContentSize(host(3000), {snapshots: [snapshot]})).toBeFalse()
    expect(JSON.stringify(snapshot)).toBe(before)
    expect(measureIncomingContentBytes({snapshots: [paragraph('')]})).toBeGreaterThan(100)
  })

  it('counts duplicate incoming IDs as distinct new blocks', () => {
    const snapshot = paragraph('hello')
    const one = measureIncomingContentBytes({snapshots: [snapshot]})
    expect(measureIncomingContentBytes({snapshots: [snapshot, snapshot]})).toBeGreaterThan(one * 1.5)
  })

  it('counts upload references, not the referenced file byte size', () => {
    const snapshot: IBlockSnapshot = {id: 'file', flavour: 'attachment', nodeType: BlockNodeType.void,
      props: {url: 'https://files.test/large.pdf', name: 'large.pdf', size: 200000000}, meta: {}, children: []}
    expect(checkIncomingContentSize(host(1024), {snapshots: [snapshot]})).toBeTrue()
  })

  it('includes repeated formatting changes in the budget', () => {
    const inline = Array.from({length: 100}, (_, i) => ({insert: 'x', attributes: {'a:bold': i % 2 === 0}}))
    expect(measureIncomingContentBytes({inline})).toBeGreaterThan(measureIncomingContentBytes({inline: [{insert: 'x'.repeat(100)}]}))
  })

  it('rejects obvious text, property and block-count overflow without constructing Yjs content', () => {
    const getMap = spyOn(Y.Doc.prototype, 'getMap').and.callThrough()
    const doc = host(1000)
    const prop = paragraph('')
    prop.props['payload'] = '中'.repeat(1000)
    for (const content of [
      {inline: [{insert: '中'.repeat(1000)}]},
      {snapshots: [prop]},
      {snapshots: Array.from({length: 100}, () => paragraph(''))},
    ]) expect(checkIncomingContentSize(doc, content)).toBeFalse()
    expect(getMap).not.toHaveBeenCalled()
    expect(doc.messageService.warn).toHaveBeenCalledTimes(3)
  })

  it('keeps exact decisions for Unicode, split surrogate pairs, discarded line breaks and small limits', () => {
    const inputs = [
      {inline: [{insert: '\ud83d'}, {insert: '\ude00'}]},
      {inline: [{insert: '中文😀\ud800\n\r'}]},
      {snapshots: [paragraph(''), paragraph('a\n中😀')]},
      {snapshots: [{...paragraph('x'), props: {values: ['😀', '中']}}]},
    ]
    for (const content of inputs) {
      const size = measureIncomingContentBytes(content)
      expect(checkIncomingContentSize(host(size), content)).toBeTrue()
      expect(checkIncomingContentSize(host(size - 1), content)).toBeFalse()
    }
    expect(checkIncomingTextSize(host(5), '\n'.repeat(10000))).toBeTrue()
    expect(checkIncomingTextSize(host(5), '中文')).toBeFalse()
    expect(checkIncomingTextSize(host(4), '😀')).toBeTrue()
    expect(checkIncomingTextSize(host(100), 'a\nb\nc', {splitLines: true})).toBeFalse()
    expect(checkIncomingTextSize(host(100), 'a\nb\nc')).toBeTrue()
    expect(checkIncomingTextSize(host(100), 'a' + '\r\n'.repeat(10000), {splitLines: true})).toBeTrue()
  })

  it('leaves complex/custom source decisions to conversion and respects shrinking text policy', () => {
    const doc = host(100)
    const adapter = {exceedsIncomingContentLimit: jasmine.createSpy('preflight').and.returnValue(true)} as any
    expect(checkIncomingSourceSize(doc, {} as any, 'x'.repeat(1000))).toBeTrue()
    expect(checkIncomingSourceSize(doc, adapter, 'x'.repeat(1000))).toBeFalse()
    doc.config.pasteTextPolicy = 'remove-stacked-marks'
    adapter.exceedsIncomingContentLimit.calls.reset()
    expect(checkIncomingSourceSize(doc, adapter, 'a' + '\u0300'.repeat(1000))).toBeTrue()
    expect(adapter.exceedsIncomingContentLimit).not.toHaveBeenCalled()
  })
})
