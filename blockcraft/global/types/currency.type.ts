export type SimpleBasicType = number | string | boolean

export type SimpleValue = SimpleBasicType | Record<string, SimpleBasicType> | Array<SimpleBasicType>

export type SimpleRecord = Record<string, SimpleValue>

export type SimpleArray = Array<SimpleValue>

export type UnknownRecord = Record<string, unknown>
