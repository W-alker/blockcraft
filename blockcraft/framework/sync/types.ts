import {SimpleRecord} from "../../global";

export interface IBlockSnapshot {
  id: string
  flavour: string
  props: SimpleRecord
  meta: SimpleRecord
}
