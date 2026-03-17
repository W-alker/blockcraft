export type SimpleBasicType = number | string | boolean | undefined | null

export type SimpleValue = SimpleBasicType | Record<string, SimpleBasicType> | Array<SimpleBasicType>

export type SimpleRecord = Record<string, SimpleValue>

export type SimpleArray = Array<SimpleValue>

export type SimpleObject = SimpleRecord | SimpleArray

export type UnknownRecord = Record<string, unknown>

export type UnknownArray = Array<unknown>
