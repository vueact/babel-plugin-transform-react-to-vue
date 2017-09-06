import getImportedIdentifier from './get-imported-identifier'
import getDefaultExport from './get-default-export'
import convertReactComponent from './convert-react-component'
import removeImports from './remove-imports'
import { isIdentifier, isMemberExpression } from './checks'

export default ({ types: t }) => ({
  visitor: {
    Program(path) {
      const React = getImportedIdentifier(t, path, 'react', 'default')
      const Component = getImportedIdentifier(t, path, 'react', 'Component')
      const ReactDOM = getImportedIdentifier(t, path, 'react-dom', 'default')
      const render = getImportedIdentifier(t, path, 'react', 'render')

      const defaultExport = getDefaultExport(t, path)

      path.traverse({
        ClassDeclaration(path) {
          const superClass = path.get('superClass')
          if (superClass) {
            if (isIdentifier(t, superClass, Component) || isMemberExpression(t, superClass, React, 'Component')) {
              convertReactComponent(t, path, path === defaultExport)
            }
          }
        }
      })

      removeImports(t, path)
    }
  }
})
