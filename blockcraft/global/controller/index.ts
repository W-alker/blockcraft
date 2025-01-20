declare global {
  namespace BlockCraft {
    type Controller = typeof Controller;
  }
}

export class Controller {
  constructor() {}

  // TODO: Implement
  public async handle(event: any): Promise<any> {
    return {}
  }
}
