export const isIdentifier = (t, path, identifier) => t.isIdentifier(path) && path.get('name').node === identifier

export const isMemberExpression = (t, path, objectIdentifier, propertyIdentifier) =>
  t.isMemberExpression(path) &&
  t.isIdentifier(path.get('object')) &&
  t.isIdentifier(path.get('property')) &&
  path.get('object.name').node === objectIdentifier &&
  path.get('property.name').node === propertyIdentifier

export const isIdentifierUsed = (path, identifier) => {
  let isUsed = false
  path.traverse({
    Identifier(path) {
      if (path.get('name').node === identifier) {
        isUsed = true
      }
    }
  })
  return isUsed
}

export const isPropsAssignedMultipleTimes = (t, path) => {
  let times = 0
  path.traverse({
    AssignmentExpression(path) {
      const left = path.get('left')
      if (
        t.isMemberExpression(left) &&
        t.isThisExpression(left.get('object')) &&
        t.isIdentifier(left.get('property')) &&
        left.get('property.name').node === 'state'
      ) {
        times++
      }
    }
  })
  return times > 1
}
