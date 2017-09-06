export default (t, path) => {
  let result = null

  path.traverse({
    ExportDefaultDeclaration(path) {
      result = path.get('declaration')
    }
  })

  return result
}
