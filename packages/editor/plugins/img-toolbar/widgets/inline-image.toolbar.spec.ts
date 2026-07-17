import {TestBed} from '@angular/core/testing';
import {InlineImageToolbar} from './inline-image.toolbar';

describe('InlineImageToolbar', () => {
  it('shows the current size and emits the block conversion action', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [InlineImageToolbar],
    }).createComponent(InlineImageToolbar);
    fixture.componentRef.setInput('width', 120);
    fixture.componentRef.setInput('height', 60);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.bc-inline-image-toolbar__size').textContent.trim())
      .toBe('120 × 60');

    let action: string | undefined;
    fixture.componentInstance.onItemClicked.subscribe(item => action = item.name);
    fixture.nativeElement.querySelector('bc-float-toolbar-item[name="block"]')
      .dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true}));

    expect(action).toBe('block');
  });
});
