export function performanceTest(info = '', alarm = 2) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    descriptor.value = function (...args: any[]) {
      const start = performance.now();
      const result = original.apply(this, args);

      if (result instanceof Promise) {
        return result.then((res) => {
          const end = performance.now();
          console.log(`%c[Async] ${propertyKey}: ${info} took ${(end - start)}ms`, end - start > alarm ? 'color: red; ' : '');
          return res;
        });
      } else {
        const end = performance.now();
        console.log(`%c[Sync] ${propertyKey}: ${info} took ${(end - start)}ms`, end - start > alarm ? 'color: red; ' : '');
        return result;
      }
    }
  }
}
