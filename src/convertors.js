import { getPropsIdentifier } from './parsers'
import { isIdentifierUsed, isPropsAssignedMultipleTimes } from './checks'
import { specialMethods } from './constants'

export const removeSuper = (t, constructorPath) =>
  constructorPath.traverse({
    CallExpression(path) {
      if (t.isSuper(path.get('callee'))) {
        path.remove()
      }
    }
  })

export const removeParams = (t, methodPath) => {
  methodPath.get('params').forEach(path => path.remove())
}

export const addPropsDeclaration = (t, methodPath, identifierNode) => {
  methodPath
    .get('body')
    .unshiftContainer(
      'body',
      t.variableDeclaration('const', [
        t.variableDeclarator(identifierNode, t.memberExpression(t.thisExpression(), t.identifier('$props')))
      ])
    )
}

export const declareData = (t, methodPath, assignedMultipleTimes, dataIdentifier) => {
  let isAssigned = false

  methodPath.traverse({
    AssignmentExpression(path) {
      const left = path.get('left')
      if (
        t.isMemberExpression(left) &&
        t.isThisExpression(left.get('object')) &&
        t.isIdentifier(left.get('property')) &&
        left.get('property.name').node === 'state'
      ) {
        if (!isAssigned) {
          isAssigned = true
          path.parentPath.replaceWith(
            t.variableDeclaration(assignedMultipleTimes ? 'let' : 'const', [
              t.variableDeclarator(t.identifier(dataIdentifier), path.get('right').node)
            ])
          )
        }
      }
    }
  })
}

export const replaceStateWithData = (t, path, dataIdentifier) => {
  path.traverse({
    MemberExpression(path) {
      if (
        t.isThisExpression(path.get('object')) &&
        t.isIdentifier(path.get('property')) &&
        path.get('property.name').node === 'state'
      ) {
        path.replaceWith(t.identifier(dataIdentifier))
      }
    }
  })
}

export const convertLastStatementToReturn = (t, path, dataIdentifier) => {
  const statements = path.get('body.body')
  const lastStatement = statements[statements.length - 1]

  if (
    t.isVariableDeclaration(lastStatement) &&
    t.isVariableDeclarator(lastStatement.get('declarations.0')) &&
    lastStatement.get('declarations.0.id.name').node === dataIdentifier
  ) {
    lastStatement.replaceWith(t.returnStatement(lastStatement.get('declarations.0.init').node))
  } else if (
    t.isExpressionStatement(lastStatement) &&
    t.isAssignmentExpression(lastStatement.get('expression')) &&
    t.isIdentifier(lastStatement.get('expression.left')) &&
    lastStatement.get('expression.left.name').node === dataIdentifier
  ) {
    lastStatement.replaceWith(t.returnStatement(lastStatement.get('expression.right').node))
  } else {
    path.get('body').pushContainer('body', t.returnStatement(t.identifier(dataIdentifier)))
  }
}

export const generateDataArrowFunction = (t, node) =>
  t.objectProperty(t.identifier('data'), t.arrowFunctionExpression([], node))

export const convertToArrowFunction = (t, path) => {
  const statements = path.get('body.body')
  if (statements.length === 1 && t.isReturnStatement(statements[0])) {
    path.replaceWith(generateDataArrowFunction(t, statements[0].get('argument').node))
  }
}

export const convertConstructor = (t, path) => {
  removeSuper(t, path)

  const propsIdentifierPath = getPropsIdentifier(path)
  const propsIdentifierValue = propsIdentifierPath && propsIdentifierPath.get('name').node
  const propsIdentifierNode = propsIdentifierPath.node

  removeParams(t, path)

  propsIdentifierValue &&
    isIdentifierUsed(path, propsIdentifierValue) &&
    addPropsDeclaration(t, path, propsIdentifierNode)

  let dataIdentifier = 'data'
  while (isIdentifierUsed(path, dataIdentifier)) {
    dataIdentifier = `_${dataIdentifier}`
  }

  declareData(t, path, isPropsAssignedMultipleTimes(t, path), dataIdentifier)
  replaceStateWithData(t, path, dataIdentifier)
  convertLastStatementToReturn(t, path, dataIdentifier)

  path.get('key').replaceWith(t.identifier('data'))
  path.node.type = 'ObjectMethod'

  convertToArrowFunction(t, path)

  return path.node
}

export const convertClassPropsToMethods = (t, path) => {
  path.traverse({
    ClassProperty(path) {
      if (t.isArrowFunctionExpression(path.get('value'))) {
        const kind = 'method'
        const key = path.get('key').node
        const params = path.get('value.params').map(path => path.node)
        const computed = path.node.computed
        const stat = path.node.static
        let body = path.get('value.body').node
        if (!t.isBlockStatement(body)) {
          body = t.blockStatement([t.returnStatement(body)])
        }
        const method = t.classMethod(kind, key, params, body, computed, stat)
        method.generator = path.get('value').node.generator
        method.async = path.get('value').node.async
        path.replaceWith(method)
      }
    }
  })
}

export const convertSetState = (t, path) => {
  path.traverse({
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
          if (t.isSpreadProperty(property)) {
            return
          }
          const key = property.get('key')

          toPatch.push({
            key,
            value: property.get('value')
          })
        })

        const assignments = toPatch.map(({ key, value }) =>
          t.assignmentExpression(
            '=',
            t.memberExpression(
              t.memberExpression(t.thisExpression(), t.identifier('$data')),
              key.node,
              !t.isIdentifier(key.node)
            ),
            value.node
          )
        )

        if (t.isExpressionStatement(path.parentPath) || t.isReturnStatement(path.parentPath)) {
          path.parentPath.replaceWithMultiple(assignments.map(assignment => t.expressionStatement(assignment)))
        } else {
          path.replaceWith(t.blockStatement(assignments.map(assignment => t.expressionStatement(assignment))))
        }
      }
    }
  })
}

export const convertInitialState = (t, path) => {
  let result = null

  path.traverse({
    ClassMethod(path) {
      /* istanbul ignore else */
      if (path.get('kind').node === 'constructor') {
        result = convertConstructor(t, path)
        path.remove()
      }
    },
    ClassProperty(path) {
      if (t.isIdentifier(path.get('key')) && path.get('key.name').node === 'state') {
        result = generateDataArrowFunction(t, path.get('value').node)
      }
    }
  })

  return result
}

export const convertStateAccess = (t, path) => {
  path.traverse({
    ClassMethod(path) {
      if (path.get('kind').node === 'constructor') {
        return
      }
      path.traverse({
        MemberExpression(path) {
          if (
            t.isThisExpression(path.get('object')) &&
            t.isIdentifier(path.get('property')) &&
            path.get('property.name').node === 'state'
          ) {
            path.get('property').node.name = '$data'
          }
        }
      })
    }
  })
}

export const convertMethods = (t, path) => {
  const methods = []
  const rootMethods = []
  const watchers = []
  path.traverse({
    ClassMethod(path) {
      if (path.get('kind').node === 'constructor') {
        return
      }
      path.node.type = 'ObjectMethod'
      if (t.isIdentifier(path.get('key')) && specialMethods[path.get('key.name').node]) {
        path.get('key').node.name = specialMethods[path.get('key.name').node]
        rootMethods.push(path.node)
      } else if (t.isIdentifier(path.get('key')) && path.get('key.name').node === 'componentWillReceiveProps') {
        path.get('key').node.name = 'handler'
        watchers.push(
          t.objectProperty(
            t.identifier('$props'),
            t.objectExpression([t.objectProperty(t.identifier('deep'), t.booleanLiteral(true)), path.node])
          )
        )
      } else {
        methods.push(path.node)
      }
    }
  })
  return { methods, rootMethods, watchers }
}

export const optimizeStateAccess = (t, path) => {
  path.traverse({
    MemberExpression(path) {
      if (
        t.isMemberExpression(path.get('object')) &&
        t.isThisExpression(path.get('object.object')) &&
        t.isIdentifier(path.get('object.property')) &&
        path.get('object.property.name').node === '$data'
      ) {
        path.get('object').replaceWith(t.thisExpression())
      }
    }
  })
}

export const memberExpressionToString = (t, path) => {
  if (t.isMemberExpression(path)) {
    const left = memberExpressionToString(t, path.get('object'))
    const right = memberExpressionToString(t, path.get('property'))
    if (left && right) {
      return `${left}.${right}`
    }
    return null
  }
  if (t.isThisExpression(path)) {
    return 'this'
  }
  if (t.isIdentifier(path)) {
    return path.get('name').node
  }
  return null
}

export const optimizeDeepStateMutations = (t, path) => {
  path.traverse({
    AssignmentExpression(path) {
      if (
        !t.isExpressionStatement(path.parentPath) ||
        path.get('operator').node !== '=' ||
        !t.isMemberExpression(path.get('left')) ||
        !t.isObjectExpression(path.get('right'))
      ) {
        return
      }
      const stringifiedLeft = memberExpressionToString(t, path.get('left'))
      if (!stringifiedLeft || !stringifiedLeft.match(/^this\./)) {
        return
      }
      const properties = path.get('right.properties')
      const matchedProperties = properties.filter(
        propertyPath =>
          t.isSpreadProperty(propertyPath) &&
          memberExpressionToString(t, propertyPath.get('argument')) === stringifiedLeft
      )
      const otherSpreads = properties.filter(
        propertyPath =>
          t.isSpreadProperty(propertyPath) &&
          memberExpressionToString(t, propertyPath.get('argument')) !== stringifiedLeft
      )
      const toAssign = properties.filter(propertyPath => !t.isSpreadProperty(propertyPath))
      if (matchedProperties.length === 0 || otherSpreads.length !== 0) {
        return
      }

      const assignments = toAssign.map(propertyPath => ({
        computed: propertyPath.node.computed,
        key: propertyPath.get('key').node,
        value: propertyPath.get('value').node
      }))
      path.parentPath.replaceWithMultiple(
        assignments.map(assignment =>
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(path.get('left').node, assignment.key, assignment.computed),
              assignment.value
            )
          )
        )
      )
    }
  })
}

export const convertJSX = (t, path) => {
  path.traverse({
    JSXText(path) {
      path.node.value = path.node.value.replace(/React/g, 'Vue')
    },
    JSXAttribute(path) {
      if (t.isJSXIdentifier(path.get('name')) && path.get('name.name').node === 'className') {
        path.get('name').replaceWith(t.jSXIdentifier('class'))
      }
    }
  })
}

export const convertProps = (t, path) => {
  path.traverse({
    MemberExpression(path) {
      if (
        t.isThisExpression(path.get('object')) &&
        t.isIdentifier(path.get('property')) &&
        path.get('property.name').node === 'props'
      ) {
        path.get('property').replaceWith(t.identifier('$props'))
      }
    }
  })
}

export const convertChildren = (t, path) => {
  path.traverse({
    MemberExpression(path) {
      if (
        t.isMemberExpression(path.get('object')) &&
        t.isThisExpression(path.get('object.object')) &&
        t.isIdentifier(path.get('object.property')) &&
        path.get('object.property.name').node === '$props' &&
        path.get('property.name').node === 'children'
      ) {
        path.replaceWith(t.memberExpression(t.thisExpression(), t.identifier('$children')))
      }
    },
    VariableDeclaration(declarationPath) {
      declarationPath.traverse({
        VariableDeclarator(path) {
          if (
            !t.isObjectPattern(path.get('id')) ||
            !t.isMemberExpression(path.get('init')) ||
            !t.isThisExpression(path.get('init.object')) ||
            !t.isIdentifier(path.get('init.property')) ||
            path.get('init.property.name').node !== '$props' ||
            !t.isObjectPattern(path.get('id'))
          ) {
            return
          }
          const properties = path.get('id.properties')

          properties.forEach(propertyPath => {
            if (!t.isObjectProperty(propertyPath) || propertyPath.get('key.name').node !== 'children') {
              return
            }

            const identifier = propertyPath.get('value').node

            propertyPath.remove()

            declarationPath.insertAfter(
              t.variableDeclaration(declarationPath.get('kind').node, [
                t.variableDeclarator(identifier, t.memberExpression(t.thisExpression(), t.identifier('$children')))
              ])
            )
          })
          if (path.get('id.properties').length === 0) {
            path.remove()
          }
        }
      })
    }
  })
}

export const convertEvents = (t, path) => {
  path.traverse({
    MemberExpression(path) {
      if (
        t.isMemberExpression(path.get('object')) &&
        t.isThisExpression(path.get('object.object')) &&
        t.isIdentifier(path.get('object.property')) &&
        path.get('object.property.name').node === '$props' &&
        path.get('property.name').node.startsWith('on')
      ) {
        let eventName = path.get('property.name').node.substr(2)
        eventName = eventName[0].toLowerCase() + eventName.substr(1)
        path.replaceWith(
          t.callExpression(
            t.memberExpression(t.memberExpression(t.thisExpression(), t.identifier('$emit')), t.identifier('bind')),
            [t.thisExpression(), t.stringLiteral(eventName)]
          )
        )
      }
    },
    VariableDeclaration(declarationPath) {
      declarationPath.traverse({
        VariableDeclarator(path) {
          if (
            !t.isObjectPattern(path.get('id')) ||
            !t.isMemberExpression(path.get('init')) ||
            !t.isThisExpression(path.get('init.object')) ||
            !t.isIdentifier(path.get('init.property')) ||
            path.get('init.property.name').node !== '$props' ||
            !t.isObjectPattern(path.get('id'))
          ) {
            return
          }
          const properties = path.get('id.properties')

          properties.forEach(propertyPath => {
            if (!t.isObjectProperty(propertyPath) || !propertyPath.get('key.name').node.startsWith('on')) {
              return
            }

            let eventName = propertyPath.get('key.name').node.substr(2)
            eventName = eventName[0].toLowerCase() + eventName.substr(1)

            const identifier = propertyPath.get('value').node

            propertyPath.remove()

            declarationPath.insertAfter(
              t.variableDeclaration(declarationPath.get('kind').node, [
                t.variableDeclarator(
                  identifier,
                  t.callExpression(
                    t.memberExpression(
                      t.memberExpression(t.thisExpression(), t.identifier('$emit')),
                      t.identifier('bind')
                    ),
                    [t.thisExpression(), t.stringLiteral(eventName)]
                  )
                )
              ])
            )
          })
          if (path.get('id.properties').length === 0) {
            path.remove()
          }
        }
      })
    }
  })
}

export const optimizeEventEmitters = (t, path) => {
  path.traverse({
    CallExpression(path) {
      if (
        !t.isCallExpression(path.get('callee')) ||
        !t.isMemberExpression(path.get('callee.callee')) ||
        !t.isMemberExpression(path.get('callee.callee.object')) ||
        !t.isThisExpression(path.get('callee.callee.object.object')) ||
        !t.isIdentifier(path.get('callee.callee.object.property')) ||
        path.get('callee.callee.object.property.name').node !== '$emit' ||
        !t.isIdentifier(path.get('callee.callee.property')) ||
        path.get('callee.callee.property.name').node !== 'bind' ||
        path.get('callee.arguments').length !== 2 ||
        !t.isThisExpression(path.get('callee.arguments.0')) ||
        !t.isStringLiteral(path.get('callee.arguments.1'))
      ) {
        return
      }

      const eventNameStringLiteral = path.get('callee.arguments.1').node
      const args = path.get('arguments').map(path => path.node)

      path.replaceWith(
        t.callExpression(t.memberExpression(t.thisExpression(), path.get('callee.callee.object.property').node), [
          eventNameStringLiteral,
          ...args
        ])
      )
    }
  })
}
