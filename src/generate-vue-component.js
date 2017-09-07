/* eslint-disable operator-linebreak */

export default (t, isDefaultExport, { componentId, data, methods, rootMethods }) => {
  const body = []
  if (data) {
    body.push(data)
  }

  if (methods.length !== 0) {
    body.push(t.objectProperty(t.identifier('methods'), t.objectExpression(methods)))
  }

  if (rootMethods.length !== 0) {
    body.push(...rootMethods)
  }

  return isDefaultExport
    ? t.objectExpression(body)
    : t.variableDeclaration('const', [t.variableDeclarator(componentId, t.objectExpression(body))])
}
