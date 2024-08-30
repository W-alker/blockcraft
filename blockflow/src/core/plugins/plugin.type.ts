import {Controller, SchemaStore} from "@core";

export interface IPlugin {
  // 插件名称
  name: string;

  // 插件版本
  version: number;

  constructor(schemaStore: SchemaStore): void;

  // 插件初始化
  init(controller: Controller): void;

  // 插件销毁
  destroy(): void;
}
