import {renderInline} from './render-inline';
import {setAttributes} from '../../framework/block-std/inline/setAttributes';

describe('numeric weight rendering', () => {
  it('uses the same CSS weight in live and snapshot DOM, including explicit normal', () => {
    for (const weight of ['400', '500', '600', '900']) {
      const attrs = {'s:fontWeight': weight, 'a:bold': true};
      const live = document.createElement('c-text');
      setAttributes(live, attrs);
      const host = document.createElement('div');
      host.append(live, renderInline([{insert: 'Text', attributes: attrs}]));
      document.body.append(host);
      try {
        const preview = host.lastElementChild!;
        expect(getComputedStyle(live).fontWeight).toBe(weight);
        expect(getComputedStyle(preview).fontWeight).toBe(weight);
        setAttributes(live, {'a:bold': null, 's:fontWeight': null});
        expect(live.style.fontWeight).toBe('');
      } finally { host.remove(); }
    }
  });
});
