export function performanceTest(info = '') {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = function (...args: any[]) {
      const startTime = performance.now();
      const result = originalMethod.apply(this, args);
      const endTime = performance.now();
      const usedTime = endTime - startTime;
      console.log(`%c${propertyKey}: ${info} took ${usedTime} milliseconds.`, usedTime > 2 ? 'color: red; ' : '');
      return result;
    }
  }
}
