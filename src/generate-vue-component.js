/* eslint-disable operator-linebreak */

export default (t, isDefaultExport, { componentId, data, methods, rootMethods, watchers }) => {
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

  if (watchers.length !== 0) {
    body.push(t.objectProperty(t.identifier('watch'), t.objectExpression(watchers)))
  }

  return isDefaultExport
    ? t.objectExpression(body)
    : t.variableDeclaration('const', [t.variableDeclarator(componentId, t.objectExpression(body))])
}
