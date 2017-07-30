const eventRE = /^on/

const isSpecialMethod = (() => {
  const specialMethods = new Set(['render', 'componentDidMount', 'componentWillMount', 'componentWillUnmount', 'constructor'])

  return methodName => specialMethods.has(methodName)
})()

const mapMethodName = (() => {
  let map = null
  return (t, key) => {
    if (!map) {
      map = {
        componentDidMount: t.identifier('mounted'),
        componentWillMount: t.identifier('beforeMount'),
        componentWillUnmount: t.identifier('beforeDestroy'),
        constructor: t.identifier('data')
      }
    }
    return map[key.name] || key
  }
})()

const removeImports = (t, path) => {
  path.traverse({
    ImportDeclaration(path) {
      const source = path.get('source')

      if (!t.isStringLiteral(source)) {
        return
      }

      const name = source.node.value

      if (name === 'react-dom') {
        path.replaceWith(t.importDeclaration([t.importDefaultSpecifier(t.identifier('Vue'))], t.stringLiteral('vue')))
      } else if (name === 'react' || name === 'prop-types') {
        path.remove()
      }
    }
  })
}

const getImportIdentifier = (t, path, moduleName, identifier) => {
  let result = null

  path.traverse({
    ImportDeclaration(path) {
      const specifiers = path.get('specifiers')
      const source = path.get('source')

      if (!t.isStringLiteral(source) || source.node.value !== moduleName) {
        return
      }

      specifiers.forEach(specifier => {
        if (t.isImportDefaultSpecifier(specifier)) {
          result = identifier
          return
        }

        const imported = specifier.get('imported')
        const local = specifier.get('local')

        if (t.isIdentifier(imported) && imported.node.name === identifier && t.isIdentifier(local)) {
          result = local.node.name
        }
      })
    }
  })
  return result
}

const convertReactBody = (t, path, dataIdentifier = '$data') => {
  path.traverse({
    // this.state.*, this.props.* => this.$attrs.*, this.props.children
    MemberExpression(path) {
      const object = path.get('object')
      const property = path.get('property')

      if (
        t.isMemberExpression(object) &&
        t.isThisExpression(object.get('object')) &&
        t.isIdentifier(object.get('property')) &&
        (object.get('property').node.name === 'props' || object.get('property').node.name === '$attrs') &&
        t.isIdentifier(property) &&
        property.node.name === 'children'
      ) {
        path.replaceWith(t.memberExpression(t.thisExpression(), t.identifier('$children')))
      } else if (t.isThisExpression(object) && t.isIdentifier(property) && property.node.name === 'state') {
        property.replaceWith(t.identifier(dataIdentifier))
      } else if (t.isThisExpression(object) && t.isIdentifier(property) && property.node.name === 'props') {
        property.replaceWith(t.identifier('$attrs'))
      }
    },
    // children
    VariableDeclaration(path) {
      const declarators = path.get('declarations')
      declarators.forEach(declaratorPath => {
        const id = declaratorPath.get('id')
        const init = declaratorPath.get('init')
        if (
          !t.isObjectPattern(id) ||
          !t.isMemberExpression(init) ||
          !t.isThisExpression(init.get('object')) ||
          !t.isIdentifier(init.get('property')) ||
          init.get('property').node.name !== 'props'
        ) {
          return
        }
        const properties = id.get('properties')
        properties.forEach(propertyPath => {
          if (!t.isObjectProperty(propertyPath)) {
            return
          }
          const key = propertyPath.get('key')
          if (!t.isIdentifier(key) || key.node.name !== 'children') {
            return
          }
          const childrenIdentifier = propertyPath.get('value').node

          const declarator = t.variableDeclarator(
            childrenIdentifier,
            t.memberExpression(t.thisExpression(), t.identifier('$children'))
          )
          if (properties.length === 1) {
            declaratorPath.replaceWith(declarator)
          } else {
            propertyPath.remove()
            declaratorPath.insertAfter(declarator)
          }
        })
      })
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

      if (callee.node.type === 'Super') {
        path.remove()
        return
      }

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

  // events
  path.traverse({
    BlockStatement(path) {
      const body = path.get('body')
      const eventMap = {}
      body.forEach(statementPath => {
        if (!t.isVariableDeclaration(statementPath)) {
          return
        }

        const declarations = statementPath.get('declarations')

        declarations.forEach(declarationPath => {
          const id = declarationPath.get('id')
          const init = declarationPath.get('init')
          if (
            !t.isObjectPattern(id) ||
            !t.isMemberExpression(init) ||
            !t.isThisExpression(init.get('object')) ||
            !t.isIdentifier(init.get('property')) ||
            init.get('property').node.name !== 'props'
          ) {
            return
          }
          const properties = id.get('properties')

          properties.forEach(propertyPath => {
            if (!t.isObjectProperty(propertyPath)) {
              return
            }
            const key = propertyPath.get('key')
            const value = propertyPath.get('value')
            if (!eventRE.test(key.node.name)) {
              return
            }
            eventMap[value.node.name] = key.node.name
            propertyPath.remove()
          })
          if (id.get('properties').length === 0) {
            declarationPath.remove()
          }
        })
      })

      path.traverse({
        CallExpression(path) {
          const callee = path.get('callee')
          if (!t.isIdentifier(callee) || eventMap[callee.node.name] === undefined) {
            return
          }
          callee.replaceWith(
            t.memberExpression(
              t.memberExpression(t.thisExpression(), t.identifier('props')),
              t.identifier(eventMap[callee.node.name])
            )
          )
        }
      })

      path.traverse({
        CallExpression(path) {
          const callee = path.get('callee')
          if (
            !t.isMemberExpression(callee) ||
            !t.isMemberExpression(callee.get('object')) ||
            !t.isThisExpression(callee.get('object').get('object')) ||
            !t.isIdentifier(callee.get('object').get('property')) ||
            callee.get('object').get('property').node.name !== 'props' ||
            !t.isIdentifier(callee.get('property')) ||
            !eventRE.test(callee.get('property').node.name)
          ) {
            return
          }
          const eventNameUppercased = callee.get('property').node.name.replace(eventRE, '')
          const eventName = `${eventNameUppercased[0].toLowerCase()}${eventNameUppercased.slice(1)}`

          const args = path.get('arguments').map(path => path.node)
          path.replaceWith(
            t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('$emit')), [
              t.stringLiteral(eventName),
              ...args
            ])
          )
        }
      })
    }
  })

  reactBody.get('body').forEach(reactProperty => {
    const key = reactProperty.get('key')

    if (
      // normal methods
      t.isClassMethod(reactProperty) &&
      (reactProperty.node.kind === 'method' || reactProperty.node.kind === 'constructor') &&
      t.isIdentifier(key)
    ) {
      const body = reactProperty.get('body')
      let params

      if (reactProperty.node.kind === 'constructor') {
        params = []
        const firstParam = reactProperty.node.params[0]
        if (t.isIdentifier(firstParam)) {
          body.node.body.unshift(
            t.variableDeclaration('var', [
              t.variableDeclarator(
                t.identifier(firstParam.name),
                t.memberExpression(
                  t.thisExpression(),
                  t.identifier('$props')
                )
              )
            ])
          )
        }
        body.node.body.push(t.returnStatement(t.memberExpression(
          t.thisExpression(),
          t.identifier('__state')
        )))
        convertReactBody(t, reactProperty.get('body'), '__state')
      } else {
        params = reactProperty.node.params
        convertReactBody(t, reactProperty.get('body'))
      }

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
        const componentIdentifier = getImportIdentifier(t, path, 'react', 'Component')
        const renderIdentifier = getImportIdentifier(t, path, 'react-dom', 'render')

        let defaultExport = null
        path.traverse({
          ExportDefaultDeclaration(path) {
            defaultExport = path.get('declaration')
          },
          ClassDeclaration(path) {
            const superClass = path.get('superClass')
            if (superClass) {
              const isReactDotComponent = t.isMemberExpression(superClass) && superClass.node.object.name === 'React' && superClass.node.property.name === componentIdentifier

              const isComponent = t.isIdentifier(superClass) && superClass.node.name === componentIdentifier

              if (isReactDotComponent || isComponent) {
                convertReactComponent(t, path, path === defaultExport)
              }
            }
          },
          CallExpression(path) {
            const callee = path.get('callee')

            let isReactDOMRender

            if (t.isMemberExpression(callee)) {
              const object = callee.get('object')
              const property = callee.get('property')
              const computed = callee.node.computed

              isReactDOMRender = !computed &&
                t.isIdentifier(object) &&
                t.isIdentifier(property) &&
                object.node.name === 'ReactDOM' &&
                property.node.name === renderIdentifier
            } else if (t.isIdentifier(callee)) {
              isReactDOMRender = callee.node.name === renderIdentifier
            }

            if (
              isReactDOMRender
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

        removeImports(t, path)
      }
    }
  }
}
