import {DocPlugin} from "../plugin";

export function DocListener() {
  return function (origin: DocPlugin, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    origin.onInit = function () {

    }
  }
}
