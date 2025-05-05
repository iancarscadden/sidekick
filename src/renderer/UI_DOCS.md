# Sidekick UI Documentation

## Overview

Sidekick's UI is designed as a translucent overlay that remains visible to the user while being hidden from screen capture applications. This document outlines the UI architecture, component structure, and styling approach.

## Core UI Components

### Overlay Component

The primary UI container is the `Overlay` component (`src/components/Overlay.tsx`). It provides:

- A translucent container with dark blackish tint for text visibility
- A simple header displaying "Sidekick" text in the top left corner
- Keybinding hints aligned to the right side of the header for clear, capture, and hide operations
- An integrated close button with an SVG icon that turns red on hover for quitting the application
- A content area for displaying dynamic information
- Sharp grey outline around the container
- Wide horizontal layout (820px) to accommodate content
- Intelligent empty state handling to minimize UI footprint when inactive

```tsx
<Overlay responseText={responseText} isLoading={isLoading} error={error} onClose={handleClose}>
  {/* Children content */}
</Overlay>
```

### Close Button Integration

The close button has been designed for improved appearance and usability:

- Uses a React SVG icon (`IoCloseOutline` from react-icons/io5) for clean, professional appearance
- Maintains the same size and positioning as the keyboard shortcut hints for visual consistency
- Features a grey outline border to distinguish it from the command hints
- Matches the overlay's background color rather than using the grey hint background
- Centered icon with appropriate sizing (18px × 18px)
- Turns red on hover with smooth transition for clear visual feedback
- Remains within the overlay's container for a cohesive UI
- Safely stops the screen filter and terminates the application when clicked

```tsx
{/* Close button with icon */}
<div 
  className={`keybind-hint quit-button no-drag ${isCloseHovered ? 'quit-button-hovered' : ''}`}
  onMouseEnter={handleCloseMouseEnter}
  onMouseLeave={handleCloseMouseLeave}
  onClick={handleCloseClick}
>
  <IoCloseOutline className="close-icon" />
</div>
```

### TextArea Component

The `TextArea` component (`src/components/TextArea.tsx`) handles the display of AI-generated responses:

- Renders the text content received from the OCR and AI processing
- Shows loading indicator with "Thinking..." text and animated dots
- Automatically resizes the parent window to fit content
- Formats text with proper styling for paragraphs, code blocks, and lists
- Real-time syntax highlighting for code blocks using the Dracula theme
- Streaming-aware code formatting that highlights code as it's being received
- Displays error messages with appropriate styling
- Intelligent empty state handling to take up no space when inactive
- Left-aligned "Thinking" indicator with animated dots

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

- `--sidekick-left-align`: CSS variable (12px) for consistent left/right alignment across all UI elements
- `.overlay-container`: Main container with blackish background (rgba(20, 20, 20, 0.8)) and border (820px width) with smooth resize animation
- `.overlay-header`: Header with "Sidekick" text in the top left corner, using a fixed height of 36px for consistent alignment
- `.overlay-keybinds-container`: Container for grouping keybind hints and close button in the top right corner, with fixed 36px height
- `.keybind-hint`: Common styling for keybind hints with consistent appearance, using flexbox for alignment
- `.keybind-text`: Styling for the text part of the keybind hint (e.g., "Clear", "Capture", "Hide")
- `.keybind-key`: Styling for individual key icons in the keybind hint, displayed as grey rectangles
- `.cmd-key`: Specific styling for the command key symbol (⌘)
- `.return-key`: Special styling for the return key icon (⏎)
- `.quit-button`: Interactive close button with custom styling, grey outline border, and overlay background
- `.close-icon`: SVG icon styling for the close button with appropriate size and color
- `.quit-button-hovered`: Red styling for close button hover state with matching border color
- `.overlay-content`: Content area with padding that matches the header alignment
- `.empty-content`: Special styling for empty state to minimize UI footprint when no content is present
- `.empty-state`: TextArea styling to collapse when empty
- `--code-bg`: CSS variable for code block background (rgba(15, 15, 15, 0.5))
- `.text-area-content`: Container for the AI response text
- `.loading-indicator`: Styling for the loading state with "Thinking" text and animated dots, aligned to match content text
- `.loading-dots`: Animated dots for loading state with staggered animation
- `.placeholder`: Styling for placeholder text (removed)
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

2. **Lists**: Text starting with bullets (* character) is formatted as list items with:
   - Proper indentation and bullet styling
   - Automatic removal of the leading * character
   - Matching bullet point color to regular text
   - Same font size as regular text for consistent appearance
   - Consistent spacing between items

3. **Paragraphs**: Regular text is formatted with:
   - Proper spacing between paragraphs
   - Clean line height for readability
   - Normal word wrapping

4. **Error Messages**: Displayed with:
   - Red left border
   - Light red background
   - Clear error text styling

## Loading State

The application provides visual feedback during processing:

1. **Thinking Indicator**:
   - Shows "Thinking" text with animated dots while processing
   - Left-aligned within the content area
   - Clean, non-italic white text for better readability
   - Three animated dots with staggered fade-in/fade-out effect
   - Appropriate spacing and sizing for good visibility

## Stream Processing

The application handles streaming data from the Gemini API:

1. **Data Parsing**: 
   - Decodes binary chunks from the response stream
   - Parses SSE (Server-Sent Events) format, removing "data:" prefixes
   - Extracts JSON content to get clean text
   - Handles partial chunks with a buffer system

2. **Visual Feedback**:
   - Shows "Thinking" text with animated dots during initial loading
   - Displays a blinking cursor at the end of text during streaming
   - Updates content in real-time as new chunks arrive
   - Properly handles streaming completion

3. **Real-time Code Highlighting**:
   - Detects code blocks as soon as opening backticks are encountered
   - Applies syntax highlighting to incomplete code blocks during streaming
   - Highlights language-specific syntax as code is being received
   - Provides visual indication for streaming code blocks with pulsing left border
   - Displays language label in real-time when language is specified

## Empty State Handling

The application implements intelligent empty state handling:

1. **TextArea Empty State**:
   - When no content, not loading, and no error, the TextArea collapses to zero height
   - Uses `.empty-state` class to remove all padding, margin, and set zero height
   - Prevents empty space when the overlay is inactive

2. **Overlay Empty Content**:
   - When TextArea is empty, the content area collapses while maintaining header space
   - Uses `.empty-content` class to maintain top padding for header but remove all other padding
   - Minimizes UI footprint when inactive
   - Clean appearance with just header bar visible

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
| ⌘; (Command+Semicolon) | macOS | Clear text area and return to initial state |
| ⌘⇧I (Command+Shift+I) | macOS | Toggle DevTools |
| Ctrl+↑ (Control+Up Arrow) | Windows/Linux | Move overlay up by 200px |
| Ctrl+↓ (Control+Down Arrow) | Windows/Linux | Move overlay down by 200px |
| Ctrl+← (Control+Left Arrow) | Windows/Linux | Move overlay left by 200px |
| Ctrl+→ (Control+Right Arrow) | Windows/Linux | Move overlay right by 200px |
| Ctrl+⏎ (Control+Return) | Windows/Linux | Capture screenshot and process with OCR + AI |
| Ctrl+; (Control+Semicolon) | Windows/Linux | Clear text area and return to initial state |
| Ctrl+Shift+I | Windows/Linux | Toggle DevTools |

These shortcuts are registered using Electron's globalShortcut API in the main process. The movement commands include bounds checking to ensure the overlay stays within the screen's visible area.

## UI Layout Updates

Recent UI improvements include:

1. **Header and Branding Enhancements**:
   - Removed Rinnegan logo for a cleaner, simpler header
   - Retained "Sidekick" text as the app identifier
   - Improved header alignment with fixed 36px height
   - Consistent vertical alignment for all header elements

2. **Keybind Hints and Close Button Organization**:
   - Keybind hints display Clear, Capture, and Hide commands, removing the Move command for simplicity
   - Each hint now shows text followed by key icons in grey squares for better visual distinction
   - Command key (⌘) and the specific key are shown as separate elements for clearer appearance
   - Close button is integrated into the keybinds container with matching sizing
   - Uses a flexbox container to align hints and close button horizontally
   - Improved return key representation with dedicated ⏎ icon and styling
   - Consistent sizing with improved readability
   - Organized to display in a logical left-to-right sequence
   - Close button uses a React SVG icon instead of text character for better appearance
   - Close button features a grey outline border that matches the overlay border
   - Close button background matches the overlay for visual distinction from command hints
   - The SVG icon turns bright white with red background on hover for clear feedback

3. **Code Block Enhancements**:
   - Properly positioned language label in the top-right corner of code blocks
   - Improved streaming code block detection and formatting
   - Real-time syntax highlighting with VS Code Dracula theme
   - Enhanced styling for better readability and code presentation

4. **Loading State Improvements**:
   - Changed "Processing screenshot..." text to simply "Thinking"
   - Aligned the "Thinking" indicator to match content text
   - Improved animated dots with larger size and better animation
   - Removed italic styling and made text fully white for better visibility
   - Vertical alignment adjustments for consistent appearance

5. **Empty State Handling**:
   - Added intelligent empty state behavior for minimal UI footprint when inactive
   - TextArea collapses completely when empty
   - Overlay content area maintains header space while collapsing body when empty
   - Clean, minimal appearance when no content is being displayed

6. **Alignment Consistency**:
   - Implemented a CSS variable `--sidekick-left-align` (12px) for consistent alignment
   - Applied consistent left alignment between header text and content
   - Ensured the "Sidekick" header text and content text align perfectly
   - Used the same variable for right-side alignment of keybind hints
   - Created consistent padding on left and right sides
   - Removed additional padding from nested elements to prevent misalignment

7. **Application Management**:
   - Close functionality integrated directly into the UI header
   - Modern SVG icon implementation for better visual quality
   - Safely terminates the application and stops the helper processes
   - Proper mouse event handling for interactive close button
   - Smooth transition animations for hover states

## OCR and AI Integration

The app integrates with a cloud-based OCR and AI service:

1. **Screenshot Capture**: When the user presses ⌘⏎ (Cmd+Return), the app:
   - Captures a screenshot of the entire screen
   - Converts it to base64 encoded PNG format
   - Sends it to the OCR and AI processing service

2. **Processing Flow**:
   - The overlay shows a "Thinking" indicator with animated dots
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
6. The "Thinking" indicator with animated dots appears on the left side
7. As streaming responses are received, they are parsed and formatted
8. The TextArea processes text in real-time, detecting and highlighting code blocks 
9. Syntax highlighting is applied using the Dracula theme
10. The window smoothly animates to fit content with a natural easing effect

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

### Close Button Implementation 

The close button uses the IoCloseOutline icon from the react-icons library:

```tsx
import { IoCloseOutline } from 'react-icons/io5';

// In the render function
<div 
  className={`keybind-hint quit-button no-drag ${isCloseHovered ? 'quit-button-hovered' : ''}`}
  onMouseEnter={handleCloseMouseEnter}
  onMouseLeave={handleCloseMouseLeave}
  onClick={handleCloseClick}
>
  <IoCloseOutline className="close-icon" />
</div>
```

### Empty State Implementation

The TextArea component implements empty state logic:

```tsx
<div 
  ref={textAreaRef}
  className={`text-area-content ${!content && !isLoading && !error ? 'empty-state' : ''}`}
>
  {/* Component content */}
</div>
```

And the Overlay component detects empty content:

```tsx
// Determine if content area should be collapsed
const isEmptyContent = !responseText && !isLoading && !error;

// Later in render
<div className={`overlay-content ${isEmptyContent ? 'empty-content' : ''}`}>
  <TextArea content={responseText} isLoading={isLoading} error={error} />
  {children}
</div>
```

### Thinking Indicator Implementation

The TextArea shows a "Thinking" indicator when loading:

```tsx
{isLoading && content.length === 0 && !error ? (
  <div className="loading-indicator">
    <span>Thinking</span>
    <div className="loading-dots">
      <span>.</span><span>.</span><span>.</span>
    </div>
  </div>
) : /* other rendering */ }
```

### Consistent Alignment Implementation

The application uses CSS variables to ensure consistent alignment across components:

```css
:root {
  /* Other variables... */
  --sidekick-left-align: 12px; /* Standard left alignment value */
}

.overlay-header {
  position: absolute;
  top: 0;
  left: var(--sidekick-left-align);
  /* Other styles... */
}

.overlay-keybinds-container {
  position: absolute;
  top: 0;
  right: var(--sidekick-left-align);
  /* Other styles... */  
}

.overlay-content {
  padding-top: 36px;
  padding-left: var(--sidekick-left-align);
  padding-right: var(--sidekick-left-align);
  padding-bottom: 16px;
  /* Other styles... */
}

.empty-content {
  padding-top: 36px;
  padding-left: var(--sidekick-left-align);
  padding-right: var(--sidekick-left-align);
  padding-bottom: 0;
  /* Other styles... */
}
```

## Future Enhancements

Completed UI improvements:
- ✅ Syntax highlighting for code blocks
- ✅ Real-time code block formatting during streaming
- ✅ Improved keybind hint organization
- ✅ Better language label positioning
- ✅ Reduced code font size for better density and readability
- ✅ Improved code block styling with darker background and no border
- ✅ Improved keyboard shortcut display with proper return key icon
- ✅ Increased movement distance for arrow key navigation (200px steps)
- ✅ Added smooth animation for window resizing with easing function
- ✅ Improved resize handling with debouncing and dimension tracking
- ✅ Integrated close button into UI header with matching style
- ✅ Enhanced close button with SVG icon and consistent styling
- ✅ Removed Rinnegan logo for cleaner header
- ✅ Changed loading text from "Processing screenshot..." to "Thinking"
- ✅ Improved animated dots with better sizing and alignment
- ✅ Left-aligned the "Thinking" indicator for better appearance
- ✅ Added empty state handling for minimal UI footprint when inactive
- ✅ Fixed vertical alignment of header elements
- ✅ Implemented consistent left alignment using CSS variables
- ✅ Improved bullet point styling to match text color and size
- ✅ Enhanced list detection to properly remove leading * characters
- ✅ Added keyboard shortcut (⌘; / Ctrl+;) to clear text area and reset to initial state
- ✅ Improved keyboard shortcut display in header with text + key format
- ✅ Simplified header commands by removing the Move command for cleaner appearance

Planned UI improvements:
- Region selection for screenshots (instead of full screen)
- Settings panel for customizing OCR/AI behavior
- History of previous queries and responses
- Filter status indicators (if needed)
- Additional keyboard shortcuts for common actions
- Markdown rendering for more complex text formatting
- Copy-to-clipboard functionality for code blocks and responses 