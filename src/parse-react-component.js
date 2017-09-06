const getComponentId = path => path.get('id').node

const removeSuper = (t, path) =>
  path.traverse({
    CallExpression(path) {
      if (t.isSuper(path.get('callee'))) {
        path.remove()
      }
    }
  })

const isIdentifierUsed = (path, identifier) => {
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

const isPropsAssignedMultipleTimes = (t, path) => {
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

const convertConstructor = (t, path) => {
  removeSuper(t, path)
  const propsIdentifier = path.get('params.0')
  const propsIdentifierValue = propsIdentifier && propsIdentifier.get('name').node
  path.node.params = []
  const propsIsUsed = propsIdentifierValue && isIdentifierUsed(path, propsIdentifierValue)

  if (propsIsUsed) {
    path
      .get('body')
      .unshiftContainer(
        'body',
        t.variableDeclaration('const', [
          t.variableDeclarator(propsIdentifier.node, t.memberExpression(t.thisExpression(), t.identifier('$props')))
        ])
      )
  }

  let dataIdentifier = 'data'
  while (isIdentifierUsed(path, dataIdentifier)) {
    dataIdentifier = `_${dataIdentifier}`
  }
  const multipleTimes = isPropsAssignedMultipleTimes(t, path)
  let isAssigned = false

  path.traverse({
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
            t.variableDeclaration(multipleTimes ? 'let' : 'const', [
              t.variableDeclarator(t.identifier(dataIdentifier), path.get('right').node)
            ])
          )
        }
      }
    }
  })
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

  let statements = path.get('body.body')

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

  statements = path.get('body.body')
  if (statements.length === 1 && t.isReturnStatement(statements[0])) {
    return t.objectProperty(t.identifier('data'), t.arrowFunctionExpression([], statements[0].get('argument').node))
  }

  path.get('key').replaceWith(t.identifier('data'))

  path.node.type = 'ObjectMethod'
  return path.node
}

export default (t, path) => {
  const component = {
    componentId: getComponentId(path)
  }

  path.traverse({
    ClassMethod(path) {
      if (path.get('kind').node === 'constructor') {
        component.data = convertConstructor(t, path)
      }
    }
  })

  return component
}
