import { resolvePlaceholderText } from "./block-schema"
import type { BlockPlaceholderConfig } from "./block-schema"
import {
  evaluateInstanceChildConstraints,
  matchesBlockFlavourPattern,
  SchemaManager,
} from "./index"
import {BlockNodeType} from "../types"
import type {IBlockSchemaOptions} from "./block-schema"

describe('resolvePlaceholderText', () => {
  it('returns empty string when config is undefined', () => {
    expect(resolvePlaceholderText(undefined, undefined)).toBe('')
    expect(resolvePlaceholderText(undefined, 1)).toBe('')
  })

  it('returns the string when config is a plain string regardless of heading', () => {
    expect(resolvePlaceholderText('foo', undefined)).toBe('foo')
    expect(resolvePlaceholderText('foo', 1)).toBe('foo')
    expect(resolvePlaceholderText('foo', 3)).toBe('foo')
  })

  it('returns default when config has only default and no heading', () => {
    const config: BlockPlaceholderConfig = { default: 'A' }
    expect(resolvePlaceholderText(config, undefined)).toBe('A')
  })

  it('falls back to default when heading is set but no matching heading entry exists', () => {
    const config: BlockPlaceholderConfig = { default: 'A' }
    expect(resolvePlaceholderText(config, 1)).toBe('A')
    expect(resolvePlaceholderText(config, 2)).toBe('A')
  })

  it('uses heading-specific text when present', () => {
    const config: BlockPlaceholderConfig = {
      default: 'A',
      heading: { 1: 'H1', 2: 'H2' },
    }
    expect(resolvePlaceholderText(config, 1)).toBe('H1')
    expect(resolvePlaceholderText(config, 2)).toBe('H2')
  })

  it('falls back to default when heading level has no specific entry', () => {
    const config: BlockPlaceholderConfig = {
      default: 'A',
      heading: { 1: 'H1' },
    }
    expect(resolvePlaceholderText(config, 2)).toBe('A')
    expect(resolvePlaceholderText(config, 3)).toBe('A')
  })

  it('returns empty when only heading map is provided and heading does not match', () => {
    const config: BlockPlaceholderConfig = { heading: { 1: 'H1' } }
    expect(resolvePlaceholderText(config, undefined)).toBe('')
    expect(resolvePlaceholderText(config, 2)).toBe('')
  })

  it('returns heading-specific text even when default is absent', () => {
    const config: BlockPlaceholderConfig = { heading: { 1: 'H1' } }
    expect(resolvePlaceholderText(config, 1)).toBe('H1')
  })
})

describe('block flavour patterns', () => {
  it('matches exact and wildcard patterns with the existing Schema semantics', () => {
    expect(matchesBlockFlavourPattern('paragraph', 'paragraph')).toBeTrue()
    expect(matchesBlockFlavourPattern('table-row', 'table-*')).toBeTrue()
    expect(matchesBlockFlavourPattern('figma-embed', '*-embed')).toBeTrue()
    expect(matchesBlockFlavourPattern('image', '*')).toBeTrue()
    expect(matchesBlockFlavourPattern('table', 'table-*')).toBeFalse()
  })
})

describe('evaluateInstanceChildConstraints', () => {
  it('does not narrow children when incl/excl are both absent', () => {
    expect(evaluateInstanceChildConstraints('image', {})).toEqual({
      allowed: true,
      malformed: false,
    })
  })

  it('allows only incl matches and treats an empty incl as deny-all', () => {
    expect(evaluateInstanceChildConstraints('paragraph', {
      incl: ['paragraph', 'table-*'],
    }).allowed).toBeTrue()
    expect(evaluateInstanceChildConstraints('image', {
      incl: ['paragraph', 'table-*'],
    }).allowed).toBeFalse()
    expect(evaluateInstanceChildConstraints('paragraph', {incl: []}).allowed)
      .toBeFalse()
  })

  it('lets excl win over incl', () => {
    expect(evaluateInstanceChildConstraints('table-row', {
      incl: ['*'],
      excl: ['table-*'],
    })).toEqual({
      allowed: false,
      malformed: false,
    })
  })

  it('fails closed for malformed persisted rules', () => {
    expect(evaluateInstanceChildConstraints('paragraph', {
      incl: 'paragraph',
    } as unknown as Record<string, unknown>)).toEqual({
      allowed: false,
      malformed: true,
    })
    expect(evaluateInstanceChildConstraints('paragraph', {
      excl: [''],
    })).toEqual({
      allowed: false,
      malformed: true,
    })
  })
})

describe('SchemaManager instance child constraints', () => {
  const schema = (
    flavour: BlockCraft.BlockFlavour,
    nodeType: BlockNodeType,
    metadata: Partial<IBlockSchemaOptions['metadata']> = {},
  ): IBlockSchemaOptions => ({
    flavour,
    nodeType,
    component: class {} as never,
    createSnapshot: (() => ({
      id: flavour,
      flavour,
      nodeType,
      props: {},
      meta: {},
      children: [],
    })) as never,
    metadata: {
      version: 1,
      label: flavour,
      ...metadata,
    },
  })

  it('never lets instance metadata widen the static Schema', () => {
    const manager = new SchemaManager([
      schema('callout', BlockNodeType.block, {
        includeChildren: ['paragraph'],
        instanceMeta: {childConstraints: true},
      }),
      schema('paragraph', BlockNodeType.editable),
      schema('image', BlockNodeType.void),
    ])

    expect(manager.isValidChildrenForInstance(
      'paragraph',
      'callout',
      {incl: ['*']},
    )).toBeTrue()
    expect(manager.isValidChildrenForInstance(
      'image',
      'callout',
      {incl: ['*']},
    )).toBeFalse()
  })

  it('keeps persisted incl/excl inert when the Schema did not opt in', () => {
    const manager = new SchemaManager([
      schema('columns', BlockNodeType.block, {
        includeChildren: ['paragraph'],
      }),
      schema('paragraph', BlockNodeType.editable),
    ])

    expect(manager.isValidChildrenForInstance(
      'paragraph',
      'columns',
      {incl: [], excl: ['paragraph']},
    )).toBeTrue()
  })
})
