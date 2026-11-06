import {
  BlockMutationPolicyError,
  BlockMutationPolicyManager,
} from './block-mutation-policy'

describe('BlockMutationPolicyManager', () => {
  it('allows mutations when the host does not configure a policy', () => {
    const manager = new BlockMutationPolicyManager({
      config: {},
    } as BlockCraft.Doc)

    expect(() => manager.assert({
      operation: 'delete',
      blockIds: ['a'],
    })).not.toThrow()
  })

  it('rejects before mutation with the host-provided message', () => {
    const manager = new BlockMutationPolicyManager({
      config: {
        blockMutationPolicy: () => ({
          allowed: false,
          message: 'protected region',
        }),
      },
    } as unknown as BlockCraft.Doc)

    expect(() => manager.assert({
      operation: 'move',
      blockIds: ['region'],
      targetId: 'other',
    })).toThrowError(BlockMutationPolicyError, 'protected region')
  })
})
