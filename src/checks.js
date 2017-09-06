export const isIdentifier = (t, path, identifier) => t.isIdentifier(path) && path.get('name').node === identifier
export const isMemberExpression = (t, path, objectIdentifier, propertyIdentifier) =>
  t.isMemberExpression(path) &&
  t.isIdentifier(path.get('object')) &&
  t.isIdentifier(path.get('property')) &&
  path.get('object.name').node === objectIdentifier &&
  path.get('property.name').node === propertyIdentifier
