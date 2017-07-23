const babel = require('babel-core')

const input = `
class Foo {

}

class Counter extends Component {
  state = {
    bar: 'foo'
  }

  componentDidMount() {
    console.log(this.state.bar)
  }
}
`

const { code } = babel.transform(input, {
  plugins: [require.resolve('..')]
})

console.log(input)
console.log('⇣⇣⇣')
console.log(code)
