import {DeltaInsertEmbed} from "../types";

export type EmbedConverter = {
  toDelta: EmbedViewToDelta
  toView: CreateEmbedView
}

export type CreateEmbedView = (delta: DeltaInsertEmbed) => HTMLElement
export type EmbedViewToDelta = (ele: HTMLElement) => DeltaInsertEmbed
