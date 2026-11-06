export interface DocMessagePort {
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
  warn(message: string): void;
}
