import { getComponentId } from './parsers'
import {
  convertClassPropsToMethods,
  convertSetState,
  convertStateAccess,
  convertMethods,
  convertInitialState,
  convertJSX,
  optimizeStateAccess,
  optimizeDeepStateMutations,
  convertProps,
  convertChildren,
  convertEvents,
  optimizeEventEmitters
} from './convertors'

export default (t, path) => {
  const componentId = getComponentId(path)
  convertClassPropsToMethods(t, path)
  convertSetState(t, path)
  convertStateAccess(t, path)
  convertJSX(t, path)
  convertProps(t, path)
  convertChildren(t, path)
  convertEvents(t, path)
  optimizeEventEmitters(t, path)
  optimizeStateAccess(t, path)
  optimizeDeepStateMutations(t, path)
  const { rootMethods, methods, watchers } = convertMethods(t, path)
  const data = convertInitialState(t, path)

  return { componentId, data, rootMethods, methods, watchers }
}
