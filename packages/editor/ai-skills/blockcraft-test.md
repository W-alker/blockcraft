# BlockCraft: Testing Strategies

> **Level 1: Task Guide** — Read `blockcraft.md` first for context.
>
> Last updated: 2026-04-07

## Test Setup

The project uses the Angular testing framework with Jasmine and Karma.

Build and test commands:
```bash
pnpm nx build editor       # Build the library
pnpm nx test editor         # Run tests
pnpm nx test playground     # Run playground app tests
```

## Testing Blocks

### Unit Test Template

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MyBlockComponent } from './my.block';
import { BlockCraftDoc } from '../../framework';

describe('MyBlockComponent', () => {
  let component: MyBlockComponent;
  let fixture: ComponentFixture<MyBlockComponent>;
  let mockDoc: jasmine.SpyObj<BlockCraftDoc>;

  beforeEach(async () => {
    mockDoc = jasmine.createSpyObj('BlockCraftDoc', ['chain'], {
      isReadonly: false,
      selection: { selectionChange$: new BehaviorSubject(null) },
    });

    await TestBed.configureTestingModule({
      imports: [MyBlockComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MyBlockComponent);
    component = fixture.componentInstance;
    component.doc = mockDoc;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render content based on props', () => {
    // Set up model/props and test rendering
  });
});
```

### Testing Block Properties

```typescript
it('should update props reactively', () => {
  // Simulate prop update
  component.updateProps({ color: '#ff0000' });
  fixture.detectChanges();

  expect(component.props.color).toBe('#ff0000');
});
```

## Testing Plugins

### Unit Test Template

```typescript
import { TestBed } from '@angular/core/testing';
import { MyPlugin } from './index';
import { BlockCraftDoc } from '../../framework';
import { BehaviorSubject, Subject } from 'rxjs';

describe('MyPlugin', () => {
  let plugin: MyPlugin;
  let mockDoc: any;

  beforeEach(() => {
    mockDoc = {
      selection: {
        selectionChange$: new BehaviorSubject(null),
        setCursorAt: jasmine.createSpy('setCursorAt'),
      },
      event: {
        on: jasmine.createSpy('on').and.returnValue(() => {}),
        bindHotkey: jasmine.createSpy('bindHotkey').and.returnValue(() => {}),
      },
      overlayService: {
        createConnectedOverlay: jasmine.createSpy('createConnectedOverlay')
          .and.returnValue({ componentRef: { setInput: () => {} }, overlayRef: { dispose: () => {} } }),
      },
      isReadonly: false,
      readonlySwitch$: new BehaviorSubject(false),
    };

    plugin = new MyPlugin();
    plugin.register(mockDoc);
  });

  afterEach(() => {
    plugin.destroy();
  });

  it('should initialize without errors', () => {
    expect(plugin).toBeTruthy();
  });

  it('should cleanup on destroy', () => {
    plugin.destroy();
    // Verify subscriptions are cleaned up
  });
});
```

## Testing EmbedConverters

```typescript
describe('myEmbedConverter', () => {
  it('should convert delta to view', () => {
    const delta = {
      insert: { myEmbed: 'test-value' },
      attributes: { someAttr: 'data' },
    };

    const element = myEmbedConverter.toView(delta);

    expect(element.textContent).toBe('test-value');
    expect(element.getAttribute('data-my-attr')).toBe('data');
  });

  it('should convert view back to delta', () => {
    const element = document.createElement('span');
    element.textContent = 'test-value';
    element.setAttribute('data-my-attr', 'data');

    const delta = myEmbedConverter.toDelta(element);

    expect(delta.insert).toEqual({ myEmbed: 'test-value' });
    expect(delta.attributes?.['someAttr']).toBe('data');
  });

  it('should be roundtrip consistent', () => {
    const original = {
      insert: { myEmbed: 'value' },
      attributes: { someAttr: 'attr' },
    };

    const element = myEmbedConverter.toView(original);
    const roundtripped = myEmbedConverter.toDelta(element);

    expect(roundtripped).toEqual(original);
  });
});
```

## Testing Adapter Matchers

```typescript
describe('myBlockHtmlAdapterMatcher', () => {
  it('should match correct HAST nodes', () => {
    const hastNode = { type: 'element', tagName: 'my-tag', properties: {}, children: [] };
    expect(myBlockHtmlAdapterMatcher.toMatch({ node: hastNode })).toBeTrue();
  });

  it('should not match incorrect HAST nodes', () => {
    const hastNode = { type: 'element', tagName: 'div', properties: {}, children: [] };
    expect(myBlockHtmlAdapterMatcher.toMatch({ node: hastNode })).toBeFalse();
  });

  it('should match correct block snapshots', () => {
    const snapshot = { flavour: 'my-block', nodeType: 0, props: {} };
    expect(myBlockHtmlAdapterMatcher.fromMatch({ node: snapshot })).toBeTrue();
  });
});
```

## What to Test

| Component | Test Focus |
|-----------|-----------|
| Block component | Rendering, prop updates, user interactions, readonly mode |
| Plugin | Init/destroy lifecycle, event handling, overlay management |
| EmbedConverter | toView/toDelta roundtrip, edge cases |
| Adapter matcher | toMatch/fromMatch predicates, snapshot conversion |
| Schema | createSnapshot produces valid snapshot |

## Checklist

- [ ] New blocks have component unit tests
- [ ] New plugins have lifecycle tests (init/destroy)
- [ ] EmbedConverters have roundtrip tests
- [ ] Adapter matchers have match/conversion tests
- [ ] Tests clean up properly (no leaked subscriptions)
- [ ] Mock `BlockCraftDoc` for isolated testing
