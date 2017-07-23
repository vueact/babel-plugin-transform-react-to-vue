const babel = require('babel-core')

const transform = input => {
  return babel.transform(input, {
    plugins: [require.resolve('../')]
  }).code
}

test('main', () => {
  expect(transform(`
  class Foo extends Component {}
  `)).toMatchSnapshot()
})
