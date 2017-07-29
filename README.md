# babel-plugin-transform-react-to-vue

[![NPM version](https://img.shields.io/npm/v/babel-plugin-transform-react-to-vue.svg?style=flat)](https://npmjs.com/package/babel-plugin-transform-react-to-vue) [![NPM downloads](https://img.shields.io/npm/dm/babel-plugin-transform-react-to-vue.svg?style=flat)](https://npmjs.com/package/babel-plugin-transform-react-to-vue) [![CircleCI](https://circleci.com/gh/vueact/babel-plugin-transform-react-to-vue/tree/master.svg?style=shield)](https://circleci.com/gh/vueact/babel-plugin-transform-react-to-vue/tree/master)  [![donate](https://img.shields.io/badge/$-donate-ff69b4.svg?maxAge=2592000&style=flat)](https://github.com/egoist/donate)

## Install

```bash
yarn add babel-plugin-transform-react-to-vue --dev
```

## Usage

```js
{
  "plugins": ["transform-react-to-vue"]
}
```

> **NOTE**: If you want it to work with experimental ECMAScript feature like `class-properties`, please use the plugin with `babel-plugin-syntax-class-properties`, or `babel-plugin-transform-class-properties` if you want to transpile it.

Input:

```js
import ReactDOM from 'react-dom'
import React, { Component } from 'react'

class App extends Component {
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

ReactDOM.render(<App />, document.getElementById('root'))
```

Output:

```js
import Vue from 'vue'

const App = {
  data: () => ({
    hello: 'world'
  }),

  render() {
    return (
      <div class="App">
        <div class="App-header" onClick={this.myMethod}>
          <h2>
            Hello {this.$data.hello}
          </h2>
        </div>
        <p class="App-intro">
          To get started, edit <code>src/App.js</code> and save to reload.
        </p>
      </div>
    )
  },

  mounted() {
    return console.log(this.$data)
  },

  methods: {
    myMethod() {
      this.hello = 'not world ;)'
    }
  }
}

new Vue({
  el: document.getElementById('root'),

  render() {
    return <App />
  }
})
```

## Contributing

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request :D


## Team

[![EGOIST](https://github.com/egoist.png?size=100)](https://github.com/egoist) | [![Nick Messing](https://github.com/nickmessing.png?size=100)](https://github.com/nickmessing)
---|---
[EGOIST](http://github.com/egoist) | [Nick Messing](https://github.com/nickmessing)
