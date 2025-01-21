import {Component} from "@angular/core";

@Component({
  selector: 'app-playground',
  template: `
    <button (click)="proxy()">代理</button>

    <button (click)="proxyer.push(4)">push</button>
    <button (click)="proxyer.pop()">pop</button>
    <button (click)="proxyer.shift()">shift</button>
    <button (click)="proxyer.unshift(0)">unshift</button>
    <button (click)="proxyer.splice(1, 3, 2)">splice</button>
    <button (click)="proxyer.reverse()">reverse</button>
    <button (click)="proxyer.sort()">sort</button>
    <button (click)="proxyer[0]">read</button>
  `,
  styles: [``],
  standalone: true
})
export class PlaygroundPage {
  constructor() {
  }

  arr1 = [1, 2, 3];

  arr2 = [1, 2, 3, 4, 5, 6, 7, 8];

  proxyer: number[] = []

  proxy() {
    console.log(1)
    this.proxyer = new Proxy(this.arr2, {
      get(target, prop, receiver) {
        if (typeof prop !== 'string') throw new Error('error')
        // console.log(`get ${prop}`);
        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        if (typeof prop !== 'string') throw new Error('error')
        console.log(`set ${prop} --> ${value}`);
        return Reflect.set(target, prop, value, receiver);
      },
      deleteProperty(target, p): boolean {
        if (typeof p !== 'string') throw new Error('error')
        console.log(`delete ${p}`);
        return Reflect.deleteProperty(target, p);
      },
      apply(target: number[], thisArg: any, argArray: any[]): any {
        console.log(`apply ${argArray}`);
        // @ts-ignore
        return Reflect.apply(target, thisArg, argArray);
      }
    })
  }
}
