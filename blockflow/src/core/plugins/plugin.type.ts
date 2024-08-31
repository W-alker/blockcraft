import {Controller, SchemaStore} from "@core";

export interface IPlugin {
  name: string;

  version: number;

  init(controller: Controller): void;

  destroy(): void;
}
