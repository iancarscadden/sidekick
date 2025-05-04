const path = require('path');
const webpack = require('webpack');

module.exports = {
  mode: 'development',
  entry: './src/renderer/renderer.tsx',
  target: 'electron-renderer',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader',
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [
                  require('tailwindcss'),
                  require('autoprefixer'),
                ],
              },
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'renderer.js',
    path: path.resolve(__dirname, 'dist/renderer'),
  },
  plugins: [
    // Provide process.platform and other env vars for the renderer
    new webpack.EnvironmentPlugin({
      NODE_ENV: 'development',
    }),
    new webpack.DefinePlugin({
      'process.platform': JSON.stringify(process.platform)
    })
  ],
}; 