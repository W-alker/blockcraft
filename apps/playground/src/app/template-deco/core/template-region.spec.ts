import {createTemplateUseMutationPolicy} from './template-region'

describe('template region mutation policy', () => {
  const createDoc = () => {
    const children: Record<string, string[]> = {
      root: ['section'],
      section: ['region'],
      region: ['content', 'placeholder'],
      content: [],
      placeholder: [],
    }
    const parents: Record<string, string | null> = {
      root: null,
      section: 'root',
      region: 'section',
      content: 'region',
      placeholder: 'region',
    }
    return {
      model: {
        getChildrenIds: (id: string) => children[id] ?? [],
        getParentId: (id: string) => parents[id] ?? null,
        getYBlock: (id: string) => ({
          get: (key: string) => key === 'meta'
            ? {get: (metaKey: string) => {
                if (metaKey === 'tplRegion') return id === 'region'
                if (metaKey === 'plh') {
                  return id === 'placeholder' ? '请填写' : undefined
                }
                return undefined
              }}
            : undefined,
        }),
      },
    } as unknown as BlockCraft.Doc
  }

  it('allows deleting a region shell and its owning ancestor', () => {
    const policy = createTemplateUseMutationPolicy()
    const doc = createDoc()

    expect(policy({
      operation: 'delete',
      blockIds: ['region'],
      parentId: 'section',
    }, doc)).toBeTrue()
    expect(policy({
      operation: 'delete',
      blockIds: ['section'],
      parentId: 'root',
    }, doc)).toBeTrue()
  })

  it('still protects a region shell from replacement and movement', () => {
    const policy = createTemplateUseMutationPolicy()
    const doc = createDoc()

    expect(policy({
      operation: 'replace',
      blockIds: ['section'],
    }, doc)).toEqual({
      allowed: false,
      message: '模板内容区域不能被替换或移动',
    })
    expect(policy({
      operation: 'move',
      blockIds: ['region'],
      parentId: 'section',
      targetId: 'root',
    }, doc)).toEqual({
      allowed: false,
      message: '模板内容区域不能被替换或移动',
    })
  })

  it('keeps ordinary content inside a region editable', () => {
    const policy = createTemplateUseMutationPolicy()
    const doc = createDoc()

    expect(policy({
      operation: 'delete',
      blockIds: ['content'],
      parentId: 'region',
    }, doc)).toBeTrue()
  })

  it('protects the paragraph that owns a template region placeholder', () => {
    const policy = createTemplateUseMutationPolicy()
    const doc = createDoc()

    expect(policy({
      operation: 'delete',
      blockIds: ['placeholder'],
      parentId: 'region',
    }, doc)).toEqual({
      allowed: false,
      message: '模板内容区域的提示段落不能单独删除、替换或移动',
    })
    expect(policy({
      operation: 'update-meta',
      blockIds: ['placeholder'],
      metaKeys: ['plhMode'],
    }, doc)).toEqual({
      allowed: false,
      message: '使用模板时不能修改内容区域配置',
    })
  })

  it('allows undo and redo for text inside a region', () => {
    const policy = createTemplateUseMutationPolicy()
    const doc = createDoc()

    expect(policy({
      operation: 'undo',
      blockIds: ['placeholder'],
    }, doc)).toBeTrue()
    expect(policy({
      operation: 'redo',
      blockIds: ['placeholder'],
    }, doc)).toBeTrue()
  })
})
