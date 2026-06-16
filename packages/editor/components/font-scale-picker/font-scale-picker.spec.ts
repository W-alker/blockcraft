import { BcFontScalePickerComponent } from "./font-scale-picker";

describe('BcFontScalePickerComponent', () => {
  let component: BcFontScalePickerComponent;
  let picked: number[];

  beforeEach(() => {
    component = new BcFontScalePickerComponent();
    picked = [];
    component.pick.subscribe(v => picked.push(v));
  });

  it('displays the clamped/rounded current ratio', () => {
    component.current = 1.2;
    expect((component as any).displayValue).toBe(1.2);

    component.current = 12;
    expect((component as any).displayValue).toBe(3); // clamped to max
  });

  it('labels 1 as 默认 and others as a ×-suffixed ratio', () => {
    expect((component as any).label(1)).toBe('默认');
    expect((component as any).label(1.2)).toBe('1.2×');
    expect((component as any).label(0.5)).toBe('0.5×');
  });

  it('marks the active preset by exact ratio match', () => {
    component.current = 1.2;
    expect((component as any).isActive(1.2)).toBe(true);
    expect((component as any).isActive(1.5)).toBe(false);
  });

  it('emits the picked preset ratio', () => {
    (component as any).onPick(0.5);
    expect(picked).toEqual([0.5]);
  });

  it('steps by 0.1, rounded, clamped to range', () => {
    component.current = 1.2;
    (component as any).step(1);
    expect(picked).toEqual([1.3]);

    picked.length = 0;
    component.current = 0.5;
    (component as any).step(-1);
    expect(picked).toEqual([0.5]); // clamped to min

    picked.length = 0;
    component.current = 3;
    (component as any).step(1);
    expect(picked).toEqual([3]); // clamped to max
  });
});
