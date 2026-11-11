import {UIEventState, UIEventStateContext} from './base';
import {UIEventDispatcher} from './dispatcher';
import {EventScopeSourceType, EventSourceState} from './state';
import {Subject} from 'rxjs';

describe('UIEventDispatcher selection-sourced global handlers', () => {
  it('runs global handlers even when the model selection is null', () => {
    const doc = {
      afterInit() {},
      selection: {value: null},
    };
    const dispatcher = new UIEventDispatcher(doc as any);
    const handler = jasmine.createSpy('beforeInputHandler');
    dispatcher.add('beforeInput', handler);
    const event = new InputEvent('beforeinput', {inputType: 'insertText', data: 'x'});
    const context = UIEventStateContext.from(
      new UIEventState(event),
      new EventSourceState({
        event,
        sourceType: EventScopeSourceType.Selection,
      }),
    );

    dispatcher.run('beforeInput', context);

    expect(handler).toHaveBeenCalledWith(context);
  });

  it('routes table-cell model selections from cell endpoints before bubbling to the table', () => {
    const blocks: Record<string, {id: string; flavour: string; parentId?: string}> = {
      'cell-1': {id: 'cell-1', flavour: 'table-cell', parentId: 'row-1'},
      'cell-4': {id: 'cell-4', flavour: 'table-cell', parentId: 'row-2'},
      'row-1': {id: 'row-1', flavour: 'table-row', parentId: 'table-1'},
      'row-2': {id: 'row-2', flavour: 'table-row', parentId: 'table-1'},
      'table-1': {id: 'table-1', flavour: 'table', parentId: 'root'},
      root: {id: 'root', flavour: 'root'},
    };
    const doc = {
      afterInit() {},
      getBlockById: (id: string) => blocks[id],
      selection: {
        value: {
          commonParent: 'table-1',
          getTableCellSelection: () => ({
            tableId: 'table-1',
            anchorCellId: 'cell-1',
            headCellId: 'cell-4',
          }),
        },
      },
    };
    const dispatcher = new UIEventDispatcher(doc as any);
    const cellHandler = jasmine.createSpy('cellHandler').and.returnValue(false);
    const tableHandler = jasmine.createSpy('tableHandler').and.returnValue(true);
    dispatcher.add('keyDown', cellHandler, {flavour: 'table-cell'});
    dispatcher.add('keyDown', tableHandler, {flavour: 'table'});
    const event = new KeyboardEvent('keydown', {key: 'ArrowDown'});
    const context = UIEventStateContext.from(
      new UIEventState(event),
      new EventSourceState({
        event,
        sourceType: EventScopeSourceType.Selection,
      }),
    );

    dispatcher.run('keyDown', context);

    expect(cellHandler).toHaveBeenCalledWith(context);
    expect(tableHandler).toHaveBeenCalledWith(context);
  });

  it('skips stale selection scope blocks but still runs global handlers', () => {
    const doc = {
      afterInit() {},
      getBlockById: jasmine.createSpy('getBlockById').and.throwError('Block not found: deleted-table'),
      selection: {
        value: {
          commonParent: 'deleted-table',
          getTableCellSelection: () => null,
        },
      },
    };
    const dispatcher = new UIEventDispatcher(doc as any);
    const tableHandler = jasmine.createSpy('tableHandler');
    const globalHandler = jasmine.createSpy('globalHandler');
    dispatcher.add('beforeInput', tableHandler, {flavour: 'table'});
    dispatcher.add('beforeInput', globalHandler);
    const event = new InputEvent('beforeinput', {inputType: 'insertText', data: 'x'});
    const context = UIEventStateContext.from(
      new UIEventState(event),
      new EventSourceState({
        event,
        sourceType: EventScopeSourceType.Selection,
      }),
    );

    expect(() => dispatcher.run('beforeInput', context)).not.toThrow();
    expect(tableHandler).not.toHaveBeenCalled();
    expect(globalHandler).toHaveBeenCalledWith(context);
  });

  it('disposes selection control when the document is destroyed', () => {
    const onDestroy$ = new Subject<void>();
    const doc = {
      afterInit() {},
      onDestroy$,
      selection: {value: null},
    };
    const dispatcher = new UIEventDispatcher(doc as any);
    const dispose = spyOn((dispatcher as any).selectionControl, 'dispose');

    onDestroy$.next();

    expect(dispose).toHaveBeenCalled();
  });
});
