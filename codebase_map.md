# Sidekick App Codebase Map

## Main Process

- `src/main/main.ts` - Entry point for Electron's main process, creates and configures the transparent overlay window
- `src/main/utils/windows-utils.ts` - Windows-specific utilities to exclude the window from screen capture

## Renderer Process

- `src/renderer/App.tsx` - Root React component defining the main UI structure
- `src/renderer/renderer.tsx` - Entry point for the renderer process that initializes React and sets up event handlers

## Preload Script

- `src/preload/preload.ts` - Secure bridge between main and renderer processes, exposes electron APIs to the web context

## React Components

- `src/components/Overlay.tsx` - Component that displays the caption box with welcome message

## Styles

- `src/styles/global.css` - Global styles and Tailwind CSS configuration

## Public Assets

- `public/index.html` - HTML entry point that serves as the container for the React application

## Configuration Files

- `tailwind.config.js` - Tailwind CSS configuration
- `tsconfig.json` - TypeScript compiler configuration
- `postcss.config.js` - PostCSS configuration for processing CSS 

## Visual Directory Structure

```
sidekick_app/
├── src/
│   ├── main/                 # Main process code
│   │   ├── main.ts           # Main entry point
│   │   └── utils/            # Main process utilities
│   │       └── windows-utils.ts  # Windows-specific utils
│   │
│   ├── renderer/             # Renderer process code
│   │   ├── App.tsx           # Root React component
│   │   └── renderer.tsx      # Renderer entry point
│   │
│   ├── preload/              # Bridge between processes
│   │   └── preload.ts        # Secure API exposure
│   │
│   ├── components/           # Shared React components
│   │   └── Overlay.tsx       # Caption box component
│   │
│   └── styles/               # Styling
│       └── global.css        # Global styles with Tailwind
│
├── public/                   # Static assets
│   └── index.html            # HTML entry point
│
├── dist/                     # Compiled output (generated)
│
└── (config files)            # Configuration
    ├── tsconfig.json         # TypeScript config
    ├── tailwind.config.js    # Tailwind CSS config
    └── postcss.config.js     # PostCSS config
``` 