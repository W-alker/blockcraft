import {IControllerConfig, LazyLoadConfig} from "../../core";

export interface GlobalConfig extends IControllerConfig{
  lazyload?: LazyLoadConfig
}
