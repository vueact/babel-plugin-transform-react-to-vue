import parseReactComponent from './parse-react-component'
import generateVueComponent from './generate-vue-component'

export default (t, path, isDefaultExport) =>
  path.replaceWith(generateVueComponent(t, isDefaultExport, parseReactComponent(t, path)))
