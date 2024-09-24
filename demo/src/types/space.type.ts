export type SpaceType = 'personal' | 'shared' | 'organization' | 'custom';

export interface ISpace {
  id: string;
  name: string;
  spaceType: SpaceType;
  hasChild?: boolean;
  docCount?: number;
}
