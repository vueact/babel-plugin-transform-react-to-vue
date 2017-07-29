const isSpecialMethod = (() => {
  const specialMethods = new Set(['render', 'componentDidMount', 'componentWillMount', 'componentWillUnmount'])

  return methodName => specialMethods.has(methodName)
})()

const mapMethodName = (() => {
  let map = null
  return (t, key) => {
    if (!map) {
      map = {
        componentDidMount: t.identifier('mounted'),
        componentWillMount: t.identifier('beforeMount'),
        componentWillUnmount: t.identifier('beforeDestroy')
      }
    }
    return map[key.name] || key
  }
})()

const removeReactImport = (t, path) => {
  path.traverse({
    ImportDeclaration(path) {
      const specifiers = path.get('specifiers')
      const source = path.get('source')

      if (!t.isStringLiteral(source) || source.node.value !== 'react') {
        return
      }

      specifiers.forEach(specifier => {
        if (t.isImportDefaultSpecifier(specifier)) {
          specifier.remove()
          if (specifiers.length === 1) {
            path.remove()
          }
        }
      })
    }
  })
}

const getReactComponentIdentifier = (t, path) => {
  let result = null

  path.traverse({
    ImportDeclaration(path) {
      const specifiers = path.get('specifiers')
      const source = path.get('source')

      if (
        specifiers.length === 1 &&
        t.isStringLiteral(source) &&
        source.node.value === 'react-dom' &&
        t.isImportDefaultSpecifier(specifiers[0]) &&
        specifiers[0].node.local.name === 'ReactDOM'
      ) {
        path.replaceWith(t.importDeclaration([t.importDefaultSpecifier(t.identifier('Vue'))], t.stringLiteral('vue')))
        return
      }

      if (!t.isStringLiteral(source) || source.node.value !== 'react') {
        return
      }

      specifiers.forEach(specifier => {
        if (!t.isImportSpecifier(specifier)) {
          return
        }

        const imported = specifier.get('imported')
        const local = specifier.get('local')

        if (t.isIdentifier(imported) && imported.node.name === 'Component' && t.isIdentifier(local)) {
          result = local.node.name
          specifier.remove()
          if (specifiers.length === 1) {
            path.remove()
          }
        }
      })
    }
  })
  return result
}

const convertReactBody = (t, path) => {
  path.traverse({
    // this.state.* => this.$data.* and this.props.* => this.$attrs.*
    MemberExpression(path) {
      const object = path.get('object')
      const property = path.get('property')

      if (t.isThisExpression(object) && t.isIdentifier(property) && property.node.name === 'state') {
        property.replaceWith(t.identifier('$data'))
      } else if (t.isThisExpression(object) && t.isIdentifier(property) && property.node.name === 'props') {
        property.replaceWith(t.identifier('$attrs'))
      }
    },
    // className => class
    JSXAttribute(path) {
      const name = path.get('name')
      if (t.isJSXIdentifier(name) && name.node.name === 'className') {
        path.replaceWith(t.jSXAttribute(t.jSXIdentifier('class'), path.get('value').node))
      }
    },
    // this.setState({...this.state, newProps: newVals})
    CallExpression(path) {
      const callee = path.get('callee')
      const args = path.get('arguments')
      if (
        t.isMemberExpression(callee) &&
        t.isThisExpression(callee.get('object')) &&
        t.isIdentifier(callee.get('property')) &&
        callee.get('property').node.name === 'setState' &&
        args.length === 1 &&
        t.isObjectExpression(args[0])
      ) {
        const statePatch = args[0].get('properties')
        const toPatch = []
        statePatch.forEach(property => {
          if (t.isSpreadElement(property)) {
            return
          }
          const key = property.get('key')

          toPatch.push({
            key,
            value: property.get('value')
          })
        })

        const assignments = toPatch.map(({ key, value }) =>
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.thisExpression(), key.node, !t.isIdentifier(key.node)),
              value.node
            )
          )
        )

        path.replaceWith(t.blockStatement(assignments))
      }
    }
  })
}

const convertReactComponent = (t, path, isDefaultExport) => {
  const id = path.get('id')
  const vueBody = []

  const reactBody = path.get('body')
  const methods = []

  reactBody.get('body').forEach(reactProperty => {
    const key = reactProperty.get('key')

    if (
      // normal methods
      t.isClassMethod(reactProperty) &&
      reactProperty.node.kind === 'method' &&
      t.isIdentifier(key)
    ) {
      const body = reactProperty.get('body')
      const params = reactProperty.node.params
      convertReactBody(t, reactProperty.get('body'))
      const newMethod = t.objectMethod('method', mapMethodName(t, key.node), params, body.node)
      newMethod.async = reactProperty.node.async
      newMethod.generator = reactProperty.node.generator
      if (isSpecialMethod(key.node.name)) {
        vueBody.push(newMethod)
      } else {
        methods.push(newMethod)
      }
    } else if (
      // bound-to-class methods
      t.isClassProperty(reactProperty) &&
      !reactProperty.node.static &&
      !reactProperty.node.computed &&
      t.isArrowFunctionExpression(reactProperty.get('value'))
    ) {
      const arrowFn = reactProperty.get('value')
      let body = arrowFn.get('body').node
      if (!t.isBlockStatement(body)) {
        arrowFn.get('body').replaceWith(t.blockStatement([t.returnStatement(body)]))
        body = arrowFn.get('body').node
      }
      const params = arrowFn.node.params
      convertReactBody(t, arrowFn.get('body'))
      const newMethod = t.objectMethod('method', mapMethodName(t, key.node), params, body)
      newMethod.async = arrowFn.node.async
      newMethod.generator = arrowFn.node.generator
      if (isSpecialMethod(key.node.name)) {
        vueBody.push(newMethod)
      } else {
        methods.push(newMethod)
      }
    } else if (
      // state
      t.isClassProperty(reactProperty) &&
      !reactProperty.node.static &&
      !reactProperty.node.computed &&
      t.isIdentifier(key) &&
      key.node.name === 'state'
    ) {
      vueBody.push(
        t.objectProperty(t.identifier('data'), t.arrowFunctionExpression([], reactProperty.get('value').node))
      )
    }
  })

  if (methods.length > 0) {
    vueBody.push(t.objectProperty(t.identifier('methods'), t.objectExpression(methods)))
  }

  if (isDefaultExport) {
    path.replaceWith(t.objectExpression(vueBody))
  } else {
    path.replaceWith(t.variableDeclaration('const', [t.variableDeclarator(id.node, t.objectExpression(vueBody))]))
  }
}

module.exports = ({ types: t }) => {
  return {
    visitor: {
      Program(path) {
        removeReactImport(t, path)
        const componentIdentifier = getReactComponentIdentifier(t, path)
        let defaultExport = null
        path.traverse({
          ExportDefaultDeclaration(path) {
            defaultExport = path.get('declaration')
          },
          ClassDeclaration(path) {
            const superClass = path.get('superClass')

            if (superClass && t.isIdentifier(superClass) && superClass.node.name === componentIdentifier) {
              convertReactComponent(t, path, path === defaultExport)
            }
          },
          CallExpression(path) {
            const callee = path.get('callee')
            const object = callee.get('object')
            const property = callee.get('property')
            const computed = callee.node.computed

            if (
              !computed &&
              t.isIdentifier(object) &&
              t.isIdentifier(property) &&
              object.node.name === 'ReactDOM' &&
              property.node.name === 'render'
            ) {
              const [jsx, el] = path.get('arguments')
              path.replaceWith(
                t.newExpression(t.identifier('Vue'), [
                  t.objectExpression([
                    t.objectProperty(t.identifier('el'), el.node),
                    t.objectMethod(
                      'method',
                      t.identifier('render'),
                      [],
                      t.blockStatement([t.returnStatement(jsx.node)])
                    )
                  ])
                ])
              )
            }
          }
        })
      }
    }
  }
}
