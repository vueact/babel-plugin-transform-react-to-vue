import babel from 'rollup-plugin-babel'

export default {
  input: 'src/index.js',
  plugins: [
    babel({
      exclude: 'node_modules/**'
    })
  ],
  output: {
    format: 'cjs',
    file: `dist/bundle${process.env.NODE_ENV === 'test' ? '-test' : ''}.js`
  }
}
