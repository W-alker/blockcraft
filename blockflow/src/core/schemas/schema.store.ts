import {BlockSchema} from "@core/schemas";
import {BaseStore} from "@core/store";

export class SchemaStore extends BaseStore<BlockSchema> {
  constructor(schemaList: BlockSchema[]) {
    super()
    schemaList.forEach(schema => {
      this.set(schema.flavour, schema)
    })
  }
}
