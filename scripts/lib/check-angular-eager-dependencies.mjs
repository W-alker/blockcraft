import ts from 'typescript';

/** Inspect the emitted FESM: source tests do not preserve ng-packagr's declaration order. */
export function checkAngularEagerDependencies(text, filename = 'bundle.mjs') {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const declarations = new Map();
  for (const statement of source.statements) {
    if (ts.isClassDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement.getStart(source));
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration.getStart(source));
      }
    }
  }
  const errors = [];
  let components = 0;
  const fields = new Map([
    ['ɵɵngDeclareComponent', ['dependencies']],
    ['ɵɵngDeclareNgModule', ['declarations', 'imports', 'exports']],
    ['ɵɵngDeclareInjector', ['imports']]
  ]);
  const property = (object, key) => object.properties.find(item =>
    ts.isPropertyAssignment(item) && item.name.getText(source).replace(/['"]/g, '') === key
  )?.initializer;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text;
      const metadata = node.arguments[0];
      if (fields.has(name) && metadata && ts.isObjectLiteralExpression(metadata)) {
        if (name === 'ɵɵngDeclareComponent') components++;
        const owner = property(metadata, 'type')?.getText(source) ?? '<unknown>';
        const check = expression => {
          // forwardRef(() => Type) and compiler-generated dependency closures are intentionally lazy.
          if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return;
          if (ts.isPropertyAssignment(expression)) return check(expression.initializer);
          if (ts.isPropertyAccessExpression(expression)) return check(expression.expression);
          if (ts.isIdentifier(expression) && declarations.get(expression.text) > node.getStart(source)) {
            const {line} = source.getLineAndCharacterOfPosition(expression.getStart(source));
            errors.push(`${filename}:${line + 1}: ${owner} eagerly references later declaration ${expression.text}`);
          }
          ts.forEachChild(expression, check);
        };
        for (const field of fields.get(name)) {
          const expression = property(metadata, field);
          if (expression) check(expression);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return {components, errors};
}
