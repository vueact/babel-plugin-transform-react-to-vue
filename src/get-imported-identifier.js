export default (t, path, moduleName, identifier) => {
  let result = null

  path.traverse({
    ImportDeclaration(path) {
      if (path.get('source.value').node !== moduleName) {
        return
      }

      const specifiers = path.get('specifiers')

      specifiers.forEach(specifier => {
        const local = specifier.get('local.name').node

        if (identifier === 'default') {
          if (t.isImportDefaultSpecifier(specifier)) {
            result = local
          }
        } else if (t.isImportSpecifier(specifier) && specifier.get('imported.name').node === identifier) {
          result = local
        }
      })
    }
  })

  return result
}
