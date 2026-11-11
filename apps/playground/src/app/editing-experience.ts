import {EDITOR_EXPERIENCES, type BlockCraftDoc, type EditorInteractionConfig} from '@ccc/blockcraft'

export const EDITING_EXPERIENCES = EDITOR_EXPERIENCES

export function experienceConfig(_doc: BlockCraftDoc, index: number): EditorInteractionConfig {
  return {experience: EDITOR_EXPERIENCES[index]!.id}
}

export function matchingExperience(doc: BlockCraftDoc): number {
  return EDITOR_EXPERIENCES.findIndex(item => item.id === doc.interaction.matchingExperience)
}
