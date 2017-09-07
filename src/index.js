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
      const render = getImportedIdentifier(t, path, 'react-dom', 'render')

      const defaultExport = getDefaultExport(t, path)

      path.traverse({
        ClassDeclaration(path) {
          const superClass = path.get('superClass')
          if (
            superClass &&
            (isIdentifier(t, superClass, Component) || isMemberExpression(t, superClass, React, 'Component'))
          ) {
            convertReactComponent(t, path, path === defaultExport)
          }
        }
      })

      path.traverse({
        CallExpression(path) {
          const callee = path.get('callee')

          let isReactDOMRender

          if (t.isMemberExpression(callee)) {
            const object = callee.get('object')
            const property = callee.get('property')
            const computed = callee.node.computed

            isReactDOMRender =
              !computed &&
              t.isIdentifier(object) &&
              t.isIdentifier(property) &&
              object.node.name === ReactDOM &&
              property.node.name === 'render'
          } else if (t.isIdentifier(callee)) {
            isReactDOMRender = callee.node.name === render
          }

          if (isReactDOMRender) {
            const [jsx, el] = path.get('arguments')
            path.replaceWith(
              t.newExpression(t.identifier('Vue'), [
                t.objectExpression([
                  t.objectProperty(t.identifier('el'), el.node),
                  t.objectMethod('method', t.identifier('render'), [], t.blockStatement([t.returnStatement(jsx.node)]))
                ])
              ])
            )
          }
        }
      })

      removeImports(t, path)
    }
  }
})
