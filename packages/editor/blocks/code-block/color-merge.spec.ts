import {mergeColorOverShiki, deltaFingerprint, isFormatOnlyDelta} from './color-merge';
import {DeltaInsert, DeltaInsertText} from '../../framework/block-std/types';

describe('mergeColorOverShiki', () => {
  it('returns shiki deltas unchanged when no user color attrs', () => {
    const shiki: DeltaInsertText[] = [{insert: 'const', attributes: {'s:color': '#a'}}, {insert: ' x'}];
    const model: DeltaInsert[] = [{insert: 'const x'}];
    expect(mergeColorOverShiki(shiki, model)).toEqual(shiki);
  });

  it('overrides shiki foreground with user s:color in range', () => {
    const shiki: DeltaInsertText[] = [{insert: 'abcd', attributes: {'s:color': '#shiki'}}];
    const model: DeltaInsert[] = [{insert: 'a'}, {insert: 'bc', attributes: {'s:color': 'red'}}, {insert: 'd'}];
    expect(mergeColorOverShiki(shiki, model)).toEqual([
      {insert: 'a', attributes: {'s:color': '#shiki'}},
      {insert: 'bc', attributes: {'s:color': 'red'}},
      {insert: 'd', attributes: {'s:color': '#shiki'}},
    ]);
  });

  it('adds user s:background while preserving shiki s:color', () => {
    const shiki: DeltaInsertText[] = [{insert: 'ab', attributes: {'s:color': '#s'}}];
    const model: DeltaInsert[] = [{insert: 'a', attributes: {'s:background': 'yellow'}}, {insert: 'b'}];
    expect(mergeColorOverShiki(shiki, model)).toEqual([
      {insert: 'a', attributes: {'s:color': '#s', 's:background': 'yellow'}},
      {insert: 'b', attributes: {'s:color': '#s'}},
    ]);
  });

  it('splits a shiki token at user-range boundaries', () => {
    const shiki: DeltaInsertText[] = [{insert: 'hello'}];
    const model: DeltaInsert[] = [{insert: 'he'}, {insert: 'll', attributes: {'s:color': 'red'}}, {insert: 'o'}];
    expect(mergeColorOverShiki(shiki, model)).toEqual([
      {insert: 'he'},
      {insert: 'll', attributes: {'s:color': 'red'}},
      {insert: 'o'},
    ]);
  });

  it('never tints the d:lineBreak segment', () => {
    const shiki: DeltaInsertText[] = [
      {insert: 'a', attributes: {'s:color': '#s'}},
      {insert: '\n', attributes: {'d:lineBreak': true}},
      {insert: 'b', attributes: {'s:color': '#s'}},
    ];
    const model: DeltaInsert[] = [{insert: 'a\nb', attributes: {'s:background': 'cyan'}}];
    expect(mergeColorOverShiki(shiki, model)).toEqual([
      {insert: 'a', attributes: {'s:color': '#s', 's:background': 'cyan'}},
      {insert: '\n', attributes: {'d:lineBreak': true}},
      {insert: 'b', attributes: {'s:color': '#s', 's:background': 'cyan'}},
    ]);
  });

  it('aligns offsets across break embeds (embed counts as length 1)', () => {
    const shiki: DeltaInsertText[] = [
      {insert: 'x'},
      {insert: '\n', attributes: {'d:lineBreak': true}},
      {insert: 'y'},
    ];
    const model: DeltaInsert[] = [
      {insert: 'x'},
      {insert: {break: true}},
      {insert: 'y', attributes: {'s:color': 'red'}},
    ];
    expect(mergeColorOverShiki(shiki, model)).toEqual([
      {insert: 'x'},
      {insert: '\n', attributes: {'d:lineBreak': true}},
      {insert: 'y', attributes: {'s:color': 'red'}},
    ]);
  });

  it('applies multiple disjoint user runs within one shiki token', () => {
    const shiki: DeltaInsertText[] = [{insert: 'abcde'}];
    const model: DeltaInsert[] = [
      {insert: 'a', attributes: {'s:color': 'red'}},
      {insert: 'b'},
      {insert: 'c', attributes: {'s:background': 'yellow'}},
      {insert: 'de'},
    ];
    expect(mergeColorOverShiki(shiki, model)).toEqual([
      {insert: 'a', attributes: {'s:color': 'red'}},
      {insert: 'b'},
      {insert: 'c', attributes: {'s:background': 'yellow'}},
      {insert: 'de'},
    ]);
  });

  it('clamps a user run that extends past the shiki text', () => {
    const shiki: DeltaInsertText[] = [{insert: 'ab'}];
    const model: DeltaInsert[] = [{insert: 'abcd', attributes: {'s:color': 'red'}}];
    expect(mergeColorOverShiki(shiki, model)).toEqual([
      {insert: 'ab', attributes: {'s:color': 'red'}},
    ]);
  });

  it('returns empty when shikiDeltas is empty even with user runs', () => {
    const shiki: DeltaInsertText[] = [];
    const model: DeltaInsert[] = [{insert: 'a', attributes: {'s:color': 'red'}}];
    expect(mergeColorOverShiki(shiki, model)).toEqual([]);
  });

  it('preserves revision attribution when Shiki splits the marked text', () => {
    const shiki: DeltaInsertText[] = [
      {insert: 'const', attributes: {'s:color': '#shiki-a'}},
      {insert: ' value', attributes: {'s:color': '#shiki-b'}},
    ];
    const revisionAttrs = {
      'a:data-bc-revision-ids': 'revision-1',
      'a:data-bc-revision-kind': 'insert',
      'a:data-bc-revision-state': 'pending',
    } as const;
    const model: DeltaInsert[] = [
      {insert: 'co'},
      {insert: 'nst val', attributes: revisionAttrs},
      {insert: 'ue'},
    ];

    expect(mergeColorOverShiki(shiki, model)).toEqual([
      {insert: 'co', attributes: {'s:color': '#shiki-a'}},
      {insert: 'nst', attributes: revisionAttrs},
      {insert: ' val', attributes: revisionAttrs},
      {insert: 'ue', attributes: {'s:color': '#shiki-b'}},
    ]);
  });

  it('lets pending and conflict revision theme colors beat inline code colors', () => {
    const shiki: DeltaInsertText[] = [{
      insert: 'ab',
      attributes: {'s:color': '#shiki', 's:background': '#shiki-bg'},
    }];
    const model: DeltaInsert[] = [
      {
        insert: 'a',
        attributes: {
          's:color': '#user',
          's:background': '#user-bg',
          'a:data-bc-revision-kind': 'insert',
          'a:data-bc-revision-state': 'pending',
        },
      },
      {
        insert: 'b',
        attributes: {
          'a:data-bc-revision-kind': 'insert',
          'a:data-bc-revision-state': 'conflict',
        },
      },
    ];

    expect(mergeColorOverShiki(shiki, model)).toEqual([
      {
        insert: 'a',
        attributes: {
          'a:data-bc-revision-kind': 'insert',
          'a:data-bc-revision-state': 'pending',
        },
      },
      {
        insert: 'b',
        attributes: {
          'a:data-bc-revision-kind': 'insert',
          'a:data-bc-revision-state': 'conflict',
        },
      },
    ]);
  });

  it('keeps revision hiding on a line break without applying user colors to it', () => {
    const shiki: DeltaInsertText[] = [
      {insert: '\n', attributes: {'d:lineBreak': true}},
    ];
    const model: DeltaInsert[] = [{
      insert: '\n',
      attributes: {
        's:color': 'red',
        's:background': 'yellow',
        's:display': 'none',
        'a:data-bc-revision-ids': 'revision-1',
        'a:data-bc-revision-kind': 'delete',
        'a:data-bc-revision-state': 'accepted',
      },
    }];

    expect(mergeColorOverShiki(shiki, model)).toEqual([{
      insert: '\n',
      attributes: {
        'd:lineBreak': true,
        's:display': 'none',
        'a:data-bc-revision-ids': 'revision-1',
        'a:data-bc-revision-kind': 'delete',
        'a:data-bc-revision-state': 'accepted',
      },
    }]);
  });
});

describe('deltaFingerprint', () => {
  it('differs when only s:background changes', () => {
    const a: DeltaInsertText = {insert: 'x', attributes: {'s:color': '#s'}};
    const b: DeltaInsertText = {insert: 'x', attributes: {'s:color': '#s', 's:background': 'yellow'}};
    expect(deltaFingerprint(a)).not.toBe(deltaFingerprint(b));
  });

  it('is stable for identical deltas', () => {
    const a: DeltaInsertText = {insert: 'x', attributes: {'s:color': 'red'}};
    const b: DeltaInsertText = {insert: 'x', attributes: {'s:color': 'red'}};
    expect(deltaFingerprint(a)).toBe(deltaFingerprint(b));
  });

  it('differs when only revision attribution changes', () => {
    const a: DeltaInsertText = {insert: 'x'};
    const b: DeltaInsertText = {
      insert: 'x',
      attributes: {
        'a:data-bc-revision-ids': 'revision-1',
        'a:data-bc-revision-kind': 'insert',
        'a:data-bc-revision-state': 'pending',
      },
    };
    expect(deltaFingerprint(a)).not.toBe(deltaFingerprint(b));
  });
});

describe('isFormatOnlyDelta', () => {
  it('true for retain-only ops (e.g. a color format)', () => {
    expect(isFormatOnlyDelta([{retain: 3}, {retain: 5, attributes: {'s:background': 'yellow'}}])).toBe(true);
  });
  it('false when any op inserts', () => {
    expect(isFormatOnlyDelta([{retain: 3}, {insert: 'x'}])).toBe(false);
  });
  it('false when any op deletes', () => {
    expect(isFormatOnlyDelta([{retain: 3}, {delete: 2}])).toBe(false);
  });
  it('false for empty ops', () => {
    expect(isFormatOnlyDelta([])).toBe(false);
  });
});
