import {TableBlockSchema} from "../../../blocks/table-block"
import {RenderUnitBlockSchema} from "../../../blocks/render-unit-block"
import {PageDividerBlockSchema} from "../../../blocks/page-divider-block"
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


describe('顶层块父级限制', () => {
  const parent = (flavour: BlockCraft.BlockFlavour, metadata = {}): IBlockSchemaOptions => ({
    flavour, nodeType: BlockNodeType.block, component: class {} as never,
    createSnapshot: (() => ({})) as never,
    metadata: {version: 1, label: flavour, includeChildren: ['*'], ...metadata},
  })
  const manager = new SchemaManager([
    PageDividerBlockSchema, TableBlockSchema, RenderUnitBlockSchema,
    parent('root'), parent('callout'), parent('column'), parent('table-cell'),
    parent('text-box', {excludeChildren: ['table'], instanceMeta: {childConstraints: true}}),
    {...parent('divider'), nodeType: BlockNodeType.void},
  ])

  for (const child of ['page-divider'] as const) {
    it(`${child} 只允许 root 直属位置且实例白名单不能扩大权限`, () => {
      expect(manager.isValidChildren(child, 'root')).toBeTrue()
      for (const flavour of ['callout', 'column', 'table-cell', 'text-box', 'render-unit'] as const) {
        expect(manager.isValidChildren(child, flavour)).toBeFalse()
        expect(manager.isValidChildren('divider', flavour)).toBeTrue()
      }
      expect(manager.isValidChildrenForInstance(child, 'render-unit', {incl: ['*']})).toBeFalse()
    })
  }
  it('表格和填写区块恢复父容器规则，实例限制仍生效', () => {
    expect(TableBlockSchema.metadata.rootOnly).toBeUndefined()
    expect(RenderUnitBlockSchema.metadata.rootOnly).toBeUndefined()
    expect(manager.isValidChildren('table', 'render-unit')).toBeTrue()
    expect(manager.isValidChildren('render-unit', 'column')).toBeTrue()
    expect(manager.isValidChildrenForInstance('table', 'render-unit', {incl: ['paragraph']})).toBeFalse()
    expect(manager.isValidChildren('table', 'text-box')).toBeFalse()
  })

})
