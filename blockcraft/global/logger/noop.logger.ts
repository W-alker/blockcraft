import {Logger} from "./type";

export class NoopLogger implements Logger {
  debug() {}

  error() {}

  info() {}

  warn() {}
}
