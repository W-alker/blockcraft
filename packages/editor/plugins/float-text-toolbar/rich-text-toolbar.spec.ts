import {FloatTextToolbarPlugin} from './rich-text-toolbar';

describe('floating toolbar keyboard formatting', () => {
  for (const attr of ['bold', 'italic', 'underline']) {
    it(`reads the current ${attr} state before the toolbar debounce completes`, () => {
      const plugin = new FloatTextToolbarPlugin({enabled: false}) as any;
      const selection = {};
      const current = new Map<string, boolean>();
      plugin.doc = {selection: {value: selection}, isReadonly: false};
      plugin.activeCommonAttrs = {attrs: new Map([[attr, true]])};
      plugin.utils = {
        getCurrentCommonAttrs: jasmine.createSpy().and.callFake(() => ({attrs: current})),
        formatText: jasmine.createSpy(),
      };
      const context = {preventDefault: jasmine.createSpy()};
      plugin.toggleFormatAttr(context, attr);
      expect(plugin.utils.getCurrentCommonAttrs).toHaveBeenCalledWith(selection);
      expect(plugin.utils.formatText).toHaveBeenCalledWith({[`a:${attr}`]: true});
      current.set(attr, true);
      plugin.toggleFormatAttr(context, attr);
      expect(plugin.utils.formatText.calls.mostRecent().args).toEqual([{[`a:${attr}`]: null}]);
    });
  }
});

describe('floating toolbar preference', () => {
  it('closes a live toolbar and does not touch selection or retain its destroyed component', () => {
    const plugin = new FloatTextToolbarPlugin() as any;
    const overlay = {dispose: jasmine.createSpy('dispose')};
    plugin.toolbarOvr = overlay;
    plugin._cpr = {};
    plugin.setEnabled(false);
    expect(overlay.dispose).toHaveBeenCalledTimes(1);
    expect(plugin._cpr).toBeUndefined();
    expect(plugin.toolbarOvr).toBeUndefined();
    // Must return before consulting doc or creating an overlay.
    expect(() => plugin.openToolbar()).not.toThrow();
  });
});
