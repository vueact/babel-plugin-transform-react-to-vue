export default (t, path) => {
  path.traverse({
    ImportDeclaration(path) {
      const source = path.get('source')
      const name = source.node.value

      if (name === 'react-dom') {
        path.replaceWith(t.importDeclaration([t.importDefaultSpecifier(t.identifier('Vue'))], t.stringLiteral('vue')))
      } else if (name === 'react' || name === 'prop-types') {
        path.remove()
      }
    }
  })
}
