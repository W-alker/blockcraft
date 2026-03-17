// 判断一个对象是否包含另一个对象的全部属性，要求属性值也一致
export function isObjectInclude(obj1: Record<string, any>, obj2: Record<string, any>) {
  if(!obj1 || !obj2) return false;
  return Object.keys(obj2).every(key => obj1[key] === obj2[key]);
}
