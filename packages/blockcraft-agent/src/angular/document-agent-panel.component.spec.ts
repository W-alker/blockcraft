import {TestBed} from '@angular/core/testing'
import {
  DocumentAgentPanelComponent,
  type DocumentAgentReviewAction,
} from './document-agent-panel.component'
import {AdapterRegistry} from '@ccc/blockcraft'

describe('DocumentAgentPanelComponent review prompt', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentAgentPanelComponent],
    }).compileComponents()
  })

  it('emits a group-scoped accept action', () => {
    const fixture = TestBed.createComponent(DocumentAgentPanelComponent)
    const actions: DocumentAgentReviewAction[] = []
    fixture.componentInstance.reviewAction.subscribe(action => actions.push(action))
    fixture.componentRef.setInput('review', {
      groupId: 'agent-group',
      summary: '整理文档结构',
      operationCount: 3,
      revisionCount: 2,
      canRevertAll: true,
    })
    fixture.detectChanges()

    const card = fixture.nativeElement.querySelector('.bc-document-agent-panel__review-card')
    const accept = fixture.nativeElement.querySelector('.bc-document-agent-panel__review-primary') as HTMLButtonElement
    expect(card.textContent).toContain('3 项操作 · 2 条可视 Diff')

    accept.click()
    expect(actions).toEqual([{type: 'accept-all', groupId: 'agent-group'}])
  })

  it('disables whole-batch revert after the captured item becomes unsafe', () => {
    const fixture = TestBed.createComponent(DocumentAgentPanelComponent)
    fixture.componentRef.setInput('review', {
      groupId: 'agent-group',
      summary: '整理文档结构',
      operationCount: 1,
      revisionCount: 0,
      canRevertAll: false,
    })
    fixture.detectChanges()

    const revert = fixture.nativeElement.querySelector('.bc-document-agent-panel__review-danger') as HTMLButtonElement
    expect(revert.disabled).toBeTrue()
    expect(fixture.nativeElement.textContent).toContain('已停止提供整批撤回')
  })

  it('routes the opt-in default mode to a Markdown chat request', () => {
    const fixture = TestBed.createComponent(DocumentAgentPanelComponent)
    const requests: unknown[] = []
    fixture.componentInstance.chatRequest.subscribe(request => requests.push(request))
    fixture.componentRef.setInput('markdownChat', {
      adapterRegistry: new AdapterRegistry([]),
      markdownProfile: 'hybrid',
    })
    fixture.componentRef.setInput('context', {
      protocolVersion: 2,
      scope: 'document',
      selection: null,
      selectedText: '',
      blocks: [],
      baseRevision: {structureRevision: 0, contentFingerprint: ''},
    })
    fixture.detectChanges()
    fixture.componentInstance.instruction.set('输出一份提纲')
    fixture.componentInstance.submitRequest()

    expect(fixture.componentInstance.mode()).toBe('chat')
    expect(requests).toEqual([jasmine.objectContaining({
      markdownStreamVersion: 1,
      instruction: '输出一份提纲',
    })])
  })

  it('keeps edit requests on the existing structured Agent output', () => {
    const fixture = TestBed.createComponent(DocumentAgentPanelComponent)
    const requests: unknown[] = []
    fixture.componentInstance.request.subscribe(request => requests.push(request))
    fixture.componentRef.setInput('markdownChat', {
      adapterRegistry: new AdapterRegistry([]),
    })
    fixture.componentRef.setInput('context', {
      protocolVersion: 2,
      scope: 'document',
      selection: null,
      selectedText: '',
      blocks: [],
      baseRevision: {structureRevision: 0, contentFingerprint: ''},
    })
    fixture.detectChanges()
    fixture.componentInstance.setMode('edit')
    fixture.componentInstance.instruction.set('改写正文')
    fixture.componentInstance.submitRequest()

    expect(requests).toEqual([jasmine.objectContaining({
      task: 'rewrite',
      instruction: '改写正文',
    })])
  })
})
