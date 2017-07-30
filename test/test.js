import test from 'ava'
import { transform } from 'babel-core'

const transpile = input =>
  transform(input, {
    plugins: ['syntax-class-properties', 'syntax-object-rest-spread', 'syntax-jsx', './index']
  }).code

const transpileTest = (name, reactCode) =>
  test(name, t => {
    t.snapshot(reactCode, `${name}: React`)
    t.snapshot(transpile(reactCode), `${name}: Vue`)
  })

transpileTest(
  'Generic code',
  `
import ReactDOM from 'react-dom'
import React, { Component as Some } from 'react'

class App extends Some {
  state = {
    hello: 'world',
    count: 10,
    some: {
      deep: {
        object: {
          hello: 'world'
        }
      }
    }
  }
  someRandomProp = 'not used'
  myMethod1(a, b) {
    return a + b
  }
  myMethod2 = (a, b) => {
    console.log(a, b)
  }
  inc = () => this.setState({ ...this.state, count: this.state.count + 1 })
  deep = () =>
    this.setState({
      ...this.state,
      some: {
        ...this.state.some,
        deep: {
          ...this.state.some.deep,
          object: {
            ...this.state.some.deep.object,
            hello: 'world2'
          }
        }
      }
    })
  dec = () => {
    console.log('what will happen?')
    this.setState({ count: this.state.count + 0, ['hell' + 'o']: 'yay!' })
  }
  render() {
    return (
      <div className="App">
        <div className="App-header" onClick={this.inc} onChange={() => this.myMethod1(1, 2)}>
          <h2>
            Welcome to React {this.state.hello} {this.myMethod1()}
          </h2>
        </div>
        <p className="App-intro">
          To get started, edit <code>src/App.js</code> and save to reload.
        </p>
      </div>
    )
  }
  componentDidMount = () => console.log(this.state)
}

ReactDOM.render(<App />, document.getElementById('root'))

`
)

transpileTest(
  'Parameter-less functional component',
  `
import React from 'react'

export default () => <h1>Hello World</h1>
`
)

transpileTest('Ignores namespace import', `import * as r from 'react'`)

transpileTest(
  'Ignores Component if imported as different name',
  `
import React, { Component as Cmp, somethingElse as Component } from 'react'

export default class App extends Component {
  state = {
    hello: 'world'
  }
  myMethod = () => {
    this.setState({ hello: 'not world ;)' })
  }
  render() {
    return (
      <div className="App">
        <div className="App-header" onClick={this.myMethod}>
          <h2>
            Hello {this.state.hello}
          </h2>
        </div>
        <p className="App-intro">
          To get started, edit <code>src/App.js</code> and save to reload.
        </p>
      </div>
    )
  }
  componentDidMount = () => console.log(this.state)
}
`
)

transpileTest(
  'Component without methods',
  `
import React, { Component } from 'react'

export default class App extends Component {
  state = {
    hello: 'world'
  }
  render() {
    return (
      <div className="App">
        <p>{this.props.prop} {this.hello}</p>
      	<button onClick={() => this.setState({hello: 'not world'})}> Mutate </button>
      </div>
    )
  }
}
`
)

transpileTest(
  'Component with children',
  `
import React, { Component } from 'react'

export default class App extends Component {
  method1() {
    const { children: a } = this.props
    console.log(a)
  }
  method2() {
    const { children } = this.props
    console.log(children)
  }
  method3() {
    const { children, a, ...props } = this.props
    console.log(children)
  }
  method4() {
    const msg = 'testing'
    console.log(this.props.children, msg)
  }
}
`
)

transpileTest(
  'Component with events',
  `
import React, { Component } from 'react'

export default class App extends Component {
  method1() {
    const { onSomething: a } = this.props
    a(1, '2')
  }
  method2() {
    const { onSomethingElse } = this.props
    onSomethingElse(3, '4')
  }
  method3() {
    const { onHello, a, ...props } = this.props
    onHello(5, '6')
  }
  method4() {
    const a = 'test'
    this.props.onSomeEvent(7, '8', a)
  }
}`
)

transpileTest(
  'named import from react-dom',
  `
import React, { Component } from 'react'
import { render } from 'react-dom'

class App extends Component {}
render(<App />, document.getElementById('root'))
`
)

transpileTest(
  'import render from react-dom as different name',
  `
import React, { Component } from 'react'
import { render as foo } from 'react-dom'

class App extends Component {}
foo(<App />, document.getElementById('root'))
`
)

transpileTest(
  'ignores some named import from react-dom',
  `
import React, { Component } from 'react'
import { foo as render } from 'react-dom'

class App extends Component {}
render(<App />, document.getElementById('root'))
`
)

transpileTest(
  'convert constructor() to data()',
  `
import React, { Component } from 'react'

class App extends Component {
  constructor(props) {
    super(props)
    this.state = {
      count: props.count
    }
    this.something = something
  }
}
`
)

transpileTest(
  'convert React.Component',
  `
import React from 'react'

class App extends React.Component {}
`
)
