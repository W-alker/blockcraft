import {TestBed} from '@angular/core/testing'
import {
  DocumentAgentPanelComponent,
  type DocumentAgentReviewAction,
} from './document-agent-panel.component'

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
})
