export default (t, isDefaultExport, { componentId, data, methods, rootMethods }) => {
  const body = []
  if (data) {
    body.push(data)
  }

  if (methods.length) {
    body.push(t.objectProperty(t.identifier('methods'), t.objectExpression(methods)))
  }

  if (rootMethods.length) {
    body.push(...rootMethods)
  }

  return isDefaultExport
    ? t.objectExpression(body)
    : t.variableDeclaration('const', [t.variableDeclarator(componentId, t.objectExpression(body))])
}
