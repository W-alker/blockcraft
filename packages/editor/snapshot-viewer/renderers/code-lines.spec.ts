import {BlockNodeType, IBlockSnapshot} from '../../framework/block-std/types/block.type'
import {InlineModel} from '../../framework/model/inline'
import {renderInline} from '../inline/render-inline'
import {SnapshotEnhancementTask, SnapshotRenderContext} from '../types'
import {createTextRenderers} from './text-renderers'

describe('Snapshot code logical lines', () => {
  function render(model: InlineModel) {
    const jobs: SnapshotEnhancementTask[] = []
    const context: SnapshotRenderContext = {
      options: {},
      renderBlock: () => document.createElement('div'),
      createInlineContent: data => renderInline(data),
      scheduleEnhancement: task => jobs.push(task),
    }
    const snapshot: IBlockSnapshot = {
      id: 'code-lines', flavour: 'code', nodeType: BlockNodeType.editable,
      props: {lang: 'PlainText'}, meta: {}, children: model,
    }
    const renderer = createTextRenderers().find(item => item.canRender(snapshot))!
    const {element} = renderer.render(context, snapshot)
    const container = element.querySelector('.edit-container')!
    return {container, jobs}
  }

  it('renders leading, consecutive and trailing empty lines before and after highlighting', () => {
    const text = '\nalpha\r\n\nomega\n'
    const {container, jobs} = render([{insert: text}])
    const check = () => {
      expect(Array.from(container.children).map(line => line.localName))
        .toEqual(['c-line', 'c-line', 'c-line', 'c-line', 'c-line'])
      expect(Array.from(container.children).map(line => line.textContent))
        .toEqual(['\n', 'alpha\r\n', '\n', 'omega\n', ''])
      expect(container.querySelector('[data-line-break]')).toBeNull()
      expect(container.lastElementChild?.querySelector('.bc-end-break')).not.toBeNull()
    }
    check()
    jobs[0].apply([{insert: text, attributes: {'s:color': 'red'}}])
    check()
    expect(container.querySelector<HTMLElement>('c-element')!.style.color).toBe('red')
  })

  it('keeps an empty document as one numbered row without loading a highlighter', () => {
    const {container, jobs} = render([])
    expect(container.children.length).toBe(1)
    expect(container.firstElementChild?.localName).toBe('c-line')
    expect(container.textContent).toBe('')
    expect(jobs.length).toBe(0)
  })

  it('keeps hidden newlines in the same row in the initial snapshot projection', () => {
    const {container} = render([
      {insert: 'a'},
      {insert: '\n', attributes: {'s:display': 'none'}},
      {insert: 'b\nc'},
    ])
    expect(Array.from(container.children).map(line => line.textContent)).toEqual(['a\nb\n', 'c'])
    expect(container.querySelector<HTMLElement>('c-element[style]')!.style.display).toBe('none')
  })
})
