# React Components

This directory contains reusable React components used throughout the application. These components make up the user interface and are rendered in the Electron renderer process.

## Files

### Overlay.tsx

A component that displays information in a styled caption box:

- Renders a blurred, semi-transparent container
- Displays messages passed as props
- Uses Tailwind CSS for styling
- Implements the main user-facing UI element
- Has proper TypeScript typing through interfaces

This component is the primary UI element visible to users in the overlay window. 