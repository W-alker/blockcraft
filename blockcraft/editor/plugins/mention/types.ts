export type MentionType = 'user' | 'doc'

export interface IMentionData {
  id: string
  name: string

  [key: string]: string | number | boolean
}

export interface IMentionResponse {
  list: IMentionData[]

  [key: string]: any
}
