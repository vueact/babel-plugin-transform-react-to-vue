module.exports = function ({ types: t }) {
  const mapKey = key => {
    const map = {
      componentDidMount: t.identifier('mounted'),
      componentWillMount: t.identifier('beforeMount'),
      componentWillUnmount: t.identifier('beforeDestroy'),
      state: t.identifier('data')
    }
    return map[key.name] || key
  }

  return {
    inherits: require('babel-plugin-syntax-class-properties'),
    visitor: {
      ClassDeclaration(path) {
        if (!path.node.superClass || path.node.superClass.name !== 'Component') {
          return
        }

        const body = []

        path.node.body.body.forEach(exp => {
          if (exp.type === 'ClassMethod') {
            if (exp.kind === 'method') {
              exp.type = 'ObjectMethod'
              exp.key = mapKey(exp.key)
              body.push(exp)
            }
          } else if (exp.type === 'ClassProperty') {
            if (exp.key.name === 'state') {
              exp.key = mapKey(exp.key)
              body.push(t.objectMethod(
                'method',
                t.identifier('data'),
                [],
                t.blockStatement([
                  t.returnStatement(exp.value)
                ])
              ))
            }
          }
        })

        path.replaceWith(
          t.variableDeclaration(
            'var',
            [
              t.variableDeclarator(
                path.node.id,
                t.objectExpression(body)
              )
            ]
          )
        )
      }
    }
  }
}

function looksLike(a, b) {
  return (
    a &&
    b &&
    Object.keys(b).every(bKey => {
      const bVal = b[bKey]
      const aVal = a[bKey]
      if (typeof bVal === 'function') {
        return bVal(aVal)
      }
      return isPrimitive(bVal) ? bVal === aVal : looksLike(aVal, bVal)
    })
  )
}

function isPrimitive(val) {
  // eslint-disable-next-line no-eq-null,eqeqeq
  return val == null || /^[sbn]/.test(typeof val)
}
