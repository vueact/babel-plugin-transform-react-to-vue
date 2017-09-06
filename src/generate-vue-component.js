export default (t, isDefaultExport, { componentId, data }) => {
  const body = []
  if (data) {
    body.push(data)
  }
  return isDefaultExport
    ? t.objectExpression(body)
    : t.variableDeclaration('const', [t.variableDeclarator(componentId, t.objectExpression(body))])
}
