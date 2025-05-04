# Styles

This directory contains global styling and CSS configurations for the application. It houses Tailwind CSS definitions and any custom styles.

## Files

### global.css

The main stylesheet for the application:

- Imports Tailwind CSS base, components, and utilities
- Defines CSS variables for consistent theming (colors, etc.)
- Sets up global styles for the body and other elements
- Contains custom component styling using Tailwind's @layer directives
- Defines special styling needed for the transparent overlay window
- Handles special cases like -webkit-app-region properties for draggable regions

## Processing

The CSS is processed in two ways:

1. **Development build**: 
   - Tailwind CLI processes the CSS to generate `dist/styles/global.css`
   - Webpack also processes the CSS when imported in renderer code using:
     - style-loader: Injects CSS into the DOM
     - css-loader: Resolves CSS imports
     - postcss-loader: Applies Tailwind and autoprefixer

2. **Webpack integration**:
   - The styles are imported directly in the renderer.tsx file
   - Webpack bundles the CSS with the JavaScript
   - This resolves module compatibility issues with CSS imports 