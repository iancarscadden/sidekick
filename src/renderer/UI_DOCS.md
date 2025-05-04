# Sidekick UI Documentation

## Overview

Sidekick's UI is designed as a translucent overlay that remains visible to the user while being hidden from screen capture applications. This document outlines the UI architecture, component structure, and styling approach.

## Core UI Components

### Overlay Component

The primary UI container is the `Overlay` component (`src/components/Overlay.tsx`). It provides:

- A translucent container with dark blackish tint for text visibility
- A header displaying the Rinnegan logo and "Sidekick" text in the top left corner
- Keybinding hints aligned to the right side of the header for hide/show, screenshot capture, and movement controls
- An integrated close button that turns red on hover for quitting the application
- A content area for displaying dynamic information
- Sharp grey outline around the container
- Wide horizontal layout (820px) to accommodate content

```tsx
<Overlay responseText={responseText} isLoading={isLoading} error={error} onClose={handleClose}>
  {/* Children content */}
</Overlay>
```

### Close Button Integration

The close functionality is now integrated directly into the Overlay component's header:

- Positioned at the far right of the keybinds container
- Styled consistently with other keybind hints but interactive
- Displays a "✕" symbol with gray background that turns red on hover
- Safely stops the screen filter and terminates the application when clicked
- Uses specialized event handling to maintain proper click-through behavior
- Remains within the overlay's container for a cohesive UI

```tsx
{/* Close button integrated with keybind hints */}
<div 
  className={`keybind-hint close-hint no-drag ${isCloseHovered ? 'close-hint-hovered' : ''}`}
  onMouseEnter={handleCloseMouseEnter}
  onMouseLeave={handleCloseMouseLeave}
  onClick={handleCloseClick}
>
  ✕
</div>
```

### TextArea Component

The `TextArea` component (`src/components/TextArea.tsx`) handles the display of AI-generated responses:

- Renders the text content received from the OCR and AI processing
- Shows loading indicators and placeholders when appropriate
- Automatically resizes the parent window to fit content
- Formats text with proper styling for paragraphs, code blocks, and lists
- Real-time syntax highlighting for code blocks using the Dracula theme
- Streaming-aware code formatting that highlights code as it's being received
- Displays error messages with appropriate styling
- Provides animated loading indicators with dot animation

```tsx
<TextArea content={responseText} isLoading={isLoading} error={error} />
```

### App Component

The `App` component (`src/renderer/App.tsx`) serves as the application root and:

- Renders the `Overlay` component with all necessary props
- Manages state for the response text, loading status, and error handling
- Handles the screenshot capture flow
- Manages API communication for OCR and AI processing
- Processes and formats streaming response data
- Provides the container for the entire UI
- Implements the `handleClose` function for application termination

## Styling

The UI uses a combination of:

- TailwindCSS for utility classes
- Custom CSS in `src/styles/global.css` for component-specific styling
- CSS variables for theme colors and consistent styling

Key style elements:

- `.overlay-container`: Main container with blackish background (rgba(20, 20, 20, 0.8)) and border (820px width) with smooth resize animation
- `.overlay-header`: Header with logo and text in the top left corner, using flexbox alignment
- `.header-logo`: Logo styling with size and opacity settings
- `.overlay-keybinds-container`: Container for grouping keybind hints and close button in the top right corner
- `.keybind-hint`: Common styling for keybind hints with consistent appearance, using flexbox for alignment
- `.close-hint`: Interactive close button styled like keybind hints but with hover functionality
- `.close-hint-hovered`: Red styling for close button hover state
- `.overlay-content`: Content area with appropriate padding
- `--code-bg`: CSS variable for code block background (rgba(15, 15, 15, 0.5))
- `.text-area-content`: Container for the AI response text
- `.loading-indicator`: Styling for the loading state with animated dots
- `.loading-dots`: Animated dots for loading state with staggered animation
- `.placeholder`: Styling for placeholder text
- `.initial-message`: Instructions shown when no response is present
- `.ai-response`: Styling for the AI-generated text content
- `.code-wrapper`: Container for code blocks and language labels with relative positioning
- `.code-block`: Styled code snippets with monospace font and dark background (no border)
- `.code-lang`: Language label positioned in the top right of code blocks
- `.text-paragraph`: Regular text paragraphs with proper spacing
- `.list-paragraph`: List items with bullet points
- `.error-message`: Error display with red highlight and border
- `.streaming-text`: Text being actively received with blinking cursor indicator
- `.streaming-code`: Special styling for code blocks that are still being streamed in

## Text Formatting

The TextArea component intelligently formats different types of content:

1. **Code Blocks**: Content between triple backticks (```) or indented with tabs/spaces is rendered as code blocks with:
   - Dark, more black-tinted background with increased opacity (no border)
   - Smaller monospace font (11px) for better code readability and density
   - Preservation of whitespace and proper overflow handling
   - Syntax highlighting using the Dracula theme (VS Code style)
   - Language detection and display in the top right corner (10px font size)
   - Real-time syntax highlighting for streaming code blocks
   - Pre/code tags for semantic correctness

2. **Lists**: Text starting with bullets or numbers is formatted as list items with:
   - Proper indentation and bullet styling
   - Blue bullet points for better visibility
   - Consistent spacing between items

3. **Paragraphs**: Regular text is formatted with:
   - Proper spacing between paragraphs
   - Clean line height for readability
   - Normal word wrapping

4. **Error Messages**: Displayed with:
   - Red left border
   - Light red background
   - Clear error text styling

## Stream Processing

The application handles streaming data from the Gemini API:

1. **Data Parsing**: 
   - Decodes binary chunks from the response stream
   - Parses SSE (Server-Sent Events) format, removing "data:" prefixes
   - Extracts JSON content to get clean text
   - Handles partial chunks with a buffer system

2. **Visual Feedback**:
   - Shows animated dots during initial loading
   - Displays a blinking cursor at the end of text during streaming
   - Updates content in real-time as new chunks arrive
   - Properly handles streaming completion

3. **Real-time Code Highlighting**:
   - Detects code blocks as soon as opening backticks are encountered
   - Applies syntax highlighting to incomplete code blocks during streaming
   - Highlights language-specific syntax as code is being received
   - Provides visual indication for streaming code blocks with pulsing left border
   - Displays language label in real-time when language is specified

## Keyboard Shortcuts

The application implements global keyboard shortcuts that work even when the app doesn't have focus:

| Shortcut | Platform | Function |
|----------|----------|----------|
| ⌘\ (Command+Backslash) | macOS | Toggle overlay visibility (hide/show) |
| Ctrl+\ | Windows/Linux | Toggle overlay visibility (hide/show) |
| ⌘↑ (Command+Up Arrow) | macOS | Move overlay up by 200px |
| ⌘↓ (Command+Down Arrow) | macOS | Move overlay down by 200px |
| ⌘← (Command+Left Arrow) | macOS | Move overlay left by 200px |
| ⌘→ (Command+Right Arrow) | macOS | Move overlay right by 200px |
| ⌘⏎ (Command+Return) | macOS | Capture screenshot and process with OCR + AI |
| ⌘⇧I (Command+Shift+I) | macOS | Toggle DevTools |
| Ctrl+↑ (Control+Up Arrow) | Windows/Linux | Move overlay up by 200px |
| Ctrl+↓ (Control+Down Arrow) | Windows/Linux | Move overlay down by 200px |
| Ctrl+← (Control+Left Arrow) | Windows/Linux | Move overlay left by 200px |
| Ctrl+→ (Control+Right Arrow) | Windows/Linux | Move overlay right by 200px |
| Ctrl+⏎ (Control+Return) | Windows/Linux | Capture screenshot and process with OCR + AI |
| Ctrl+Shift+I | Windows/Linux | Toggle DevTools |

These shortcuts are registered using Electron's globalShortcut API in the main process. The movement commands include bounds checking to ensure the overlay stays within the screen's visible area.

## UI Layout Updates

Recent UI improvements include:

1. **Header and Branding Enhancements**:
   - Added Rinnegan SVG logo to the left of the app name
   - Changed header text from "AI Response" to "Sidekick"
   - Applied flexbox layout to properly align logo and text

2. **Keybind Hints and Close Button Organization**:
   - All keybind hints are grouped on the right side of the header
   - Close button is integrated into the keybinds container with matching style
   - Uses a flexbox container to align hints and close button horizontally
   - Improved return key representation with dedicated ⏎ icon and styling
   - Consistent styling with improved readability
   - Organized to display in a logical left-to-right sequence
   - Close button turns red on hover for clear visual feedback

3. **Code Block Enhancements**:
   - Properly positioned language label in the top-right corner of code blocks
   - Improved streaming code block detection and formatting
   - Real-time syntax highlighting with VS Code Dracula theme
   - Enhanced styling for better readability and code presentation

4. **Application Management**:
   - Close functionality integrated directly into the UI header
   - Visual styling matches other UI elements for consistency
   - Safely terminates the application and stops the helper processes
   - Proper mouse event handling for interactive close button

## OCR and AI Integration

The app integrates with a cloud-based OCR and AI service:

1. **Screenshot Capture**: When the user presses ⌘⏎ (Cmd+Return), the app:
   - Captures a screenshot of the entire screen
   - Converts it to base64 encoded PNG format
   - Sends it to the OCR and AI processing service

2. **Processing Flow**:
   - The overlay shows a loading indicator with animated dots
   - The cloud function extracts text using Google's Vision API
   - The extracted text is sent to Google's Gemini AI for processing
   - The AI generates a response based on the content of the screenshot

3. **Response Handling**:
   - The API streams back text chunks as they're generated
   - The App component parses and formats these chunks
   - The TextArea component displays formatted text with proper styling and syntax highlighting
   - The window smoothly animates to fit the content with a cubic easing function

## Content Security Policy

The application uses a Content Security Policy (CSP) to ensure secure connections:

- The CSP is defined in the HTML file as a meta tag
- It allows connections to the Supabase API domain and specific functions
- It restricts other resource origins to maintain security

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://wnwvguldjsqmynxdrfij.supabase.co/ https://wnwvguldjsqmynxdrfij.supabase.co/functions/v1/ocr-and-response">
```

## Mouse Interaction

The UI handles mouse interactions to allow:
- Clickthrough behavior when not interacting with UI elements
- Normal clicking on interactive UI elements like the close button
- Proper event handling for interactive elements using specialized classes

This is managed in `renderer.tsx` with event listeners that dynamically toggle the `setIgnoreMouseEvents` electron API based on the target element.

## Rendering Process

1. `renderer.tsx` initializes the application
2. React renders the `App` component
3. `App` renders the `Overlay` component with appropriate content
4. Mouse events are captured to handle clickthrough behavior
5. When screenshot is triggered, OCR processing begins
6. As streaming responses are received, they are parsed and formatted
7. The TextArea processes text in real-time, detecting and highlighting code blocks 
8. Syntax highlighting is applied using the Dracula theme
9. The window smoothly animates to fit content with a natural easing effect

## Debugging

The application includes developer tooling to assist with troubleshooting:

- DevTools can be toggled with ⌘⇧I (Cmd+Shift+I) or Ctrl+Shift+I
- Console logs provide detailed information about streaming data processing
- Network monitoring allows inspection of API requests and responses
- The main process displays detailed logs about application state

## Implementation Details

### Syntax Highlighting

The application uses react-syntax-highlighter with the Prism renderer and Dracula theme:

```tsx
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Later in the component
<SyntaxHighlighter
  language={languageId}
  style={dracula}
  showLineNumbers={false}
  wrapLines={true}
  className="code-block"
>
  {codeContent}
</SyntaxHighlighter>
```

### Streaming Code Block Detection

The TextArea component implements a sophisticated algorithm to detect and format code blocks in streaming text:

1. Parses the text line by line during streaming
2. Detects opening code block markers (```` ``` ````)
3. Extracts any specified language identifier
4. Processes and formats the code content
5. Applies special styling for incomplete code blocks
6. Highlights the code in real-time as it streams in
7. Adds a visual indicator for streaming state

## Future Enhancements

Completed UI improvements:
- ✅ Syntax highlighting for code blocks
- ✅ Real-time code block formatting during streaming
- ✅ Improved keybind hint organization
- ✅ Better language label positioning
- ✅ Reduced code font size for better density and readability
- ✅ Improved code block styling with darker background and no border
- ✅ Added Rinnegan logo to application header
- ✅ Improved keyboard shortcut display with proper return key icon
- ✅ Increased movement distance for arrow key navigation (200px steps)
- ✅ Added smooth animation for window resizing with easing function
- ✅ Improved resize handling with debouncing and dimension tracking
- ✅ Integrated close button into UI header with matching style

Planned UI improvements:
- Region selection for screenshots (instead of full screen)
- Settings panel for customizing OCR/AI behavior
- History of previous queries and responses
- Filter status indicators (if needed)
- Additional keyboard shortcuts for common actions
- Markdown rendering for more complex text formatting
- Copy-to-clipboard functionality for code blocks and responses 