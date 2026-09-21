import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkAngularEagerDependencies} from './lib/check-angular-eager-dependencies.mjs';

test('rejects the released image/video and table toolbar failure pattern', () => {
  for (const owner of ['ImageBlockComponent', 'VideoBlockComponent', 'TableStructureToolbarComponent']) {
    const result = checkAngularEagerDependencies(`
      class ${owner} {
        static { this.ɵcmp = i0.ɵɵngDeclareComponent({type: ${owner}, dependencies: [{kind: 'component', type: Later}]}); }
      }
      class Later {}
    `);
    assert.equal(result.components, 1);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], new RegExp(owner + ' eagerly references later declaration Later'));
  }
});

test('accepts earlier imports, self references and intentionally lazy dependencies', () => {
  const result = checkAngularEagerDependencies(`
    import {External} from 'external';
    class Earlier {}
    class Owner {
      static { this.ɵcmp = i0.ɵɵngDeclareComponent({type: Owner, dependencies: [
        {type: Earlier}, {type: External}, {type: Owner}, {type: forwardRef(() => Later)}
      ]}); }
    }
    class Lazy {
      static { this.ɵcmp = i0.ɵɵngDeclareComponent({type: Lazy, dependencies: () => [{type: Later}]}); }
    }
    class Later {}
  `);
  assert.equal(result.components, 2);
  assert.deepEqual(result.errors, []);
});

test('checks injector/module imports and variable declarations as well as classes', () => {
  const result = checkAngularEagerDependencies(`
    class Module {
      static { this.ɵmod = i0.ɵɵngDeclareNgModule({type: Module, declarations: [Later]}); }
      static { this.ɵinj = i0.ɵɵngDeclareInjector({type: Module, imports: [Later]}); }
    }
    const Later = class {};
  `);
  assert.equal(result.errors.length, 2);
});
