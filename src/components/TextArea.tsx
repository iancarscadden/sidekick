import React, { useRef, useEffect, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';

// TextArea component - Updated May 2025 - Handles syntax highlighting with dracula theme
interface TextAreaProps {
  content: string;
  isLoading?: boolean;
  error?: string | null;
}

// Interface for code parts to include streaming property
interface CodePart {
  type: 'code';
  lang: string;
  code: string;
  streaming?: boolean;
}

// Type for content parts (either string or CodePart)
type ContentPart = string | CodePart;

const TextArea: React.FC<TextAreaProps> = ({ content, isLoading = false, error = null }) => {
  const textAreaRef = useRef<HTMLDivElement>(null);
  const [formattedContent, setFormattedContent] = useState<JSX.Element | null>(null);

  // Effect to resize the parent window when content changes
  useEffect(() => {
    if (textAreaRef.current && window.electron) {
      // Use a proper debounce to prevent rapid resize calls
      const timeoutId = setTimeout(() => {
        const height = textAreaRef.current?.scrollHeight || 0;
        const width = textAreaRef.current?.scrollWidth || 0;
        
        // Add padding to account for container padding and header
        const totalHeight = height + 60; // Account for padding and header
        const totalWidth = Math.max(width + 40, 820); // Maintain minimum width
        
        // Store last dimensions to prevent unnecessary resizes
        const lastWidth = textAreaRef.current?.getAttribute('data-last-width');
        const lastHeight = textAreaRef.current?.getAttribute('data-last-height');
        
        // Only resize if dimensions are significantly different
        if (
          !textAreaRef.current ||
          !lastWidth || 
          !lastHeight || 
          Math.abs(totalWidth - parseInt(lastWidth)) > 5 || 
          Math.abs(totalHeight - parseInt(lastHeight)) > 5
        ) {
          // Save current dimensions for future comparison
          textAreaRef.current?.setAttribute('data-last-width', totalWidth.toString());
          textAreaRef.current?.setAttribute('data-last-height', totalHeight.toString());
          
          window.electron.resizeWindow(totalWidth, totalHeight);
        }
      }, 50); // Increased delay for better batching
      
      return () => clearTimeout(timeoutId);
    }
  }, [content, error]);

  // Enhanced processText function to handle streaming code blocks
  const processText = (text: string, isStreaming = false): JSX.Element => {
    if (!text) {
      return <></>;
    }
    
    // For streaming text, we need to check if we're in the middle of a code block
    if (isStreaming) {
      const lines = text.split('\n');
      const parts: ContentPart[] = [];
      
      let inCodeBlock = false;
      let codeBlockStart = 0;
      let codeBlockLang = '';
      let regularTextBuffer = '';
      
      // Process each line to find code block markers
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check for opening code block marker
        if (line.trim().startsWith('```') && !inCodeBlock) {
          // Add any buffered regular text before this code block
          if (regularTextBuffer) {
            parts.push(regularTextBuffer);
            regularTextBuffer = '';
          }
          
          inCodeBlock = true;
          codeBlockStart = i;
          
          // Extract language if present
          const langMatch = line.trim().match(/^```([\w]*)/);
          codeBlockLang = langMatch && langMatch[1] ? langMatch[1] : '';
        }
        // Check for closing code block marker
        else if (line.trim() === '```' && inCodeBlock) {
          // Extract the code inside the block (excluding the markers)
          const codeContent = lines.slice(codeBlockStart + 1, i).join('\n');
          
          parts.push({ 
            type: 'code', 
            lang: codeBlockLang, 
            code: codeContent 
          });
          
          inCodeBlock = false;
        }
        // Regular line
        else if (!inCodeBlock) {
          regularTextBuffer += (regularTextBuffer ? '\n' : '') + line;
        }
      }
      
      // If we're still in a code block at the end, it's an unclosed streaming code block
      if (inCodeBlock) {
        // Add any buffered regular text before this code block
        if (regularTextBuffer) {
          parts.push(regularTextBuffer);
          regularTextBuffer = '';
        }
        
        // Extract the code inside the block (excluding the opening marker)
        // Include everything from the opening marker to the end
        const codeContent = lines.slice(codeBlockStart + 1).join('\n');
        
        parts.push({ 
          type: 'code', 
          lang: codeBlockLang, 
          code: codeContent,
          streaming: true // Mark this as a streaming code block
        });
      } else if (regularTextBuffer) {
        // Add any remaining regular text
        parts.push(regularTextBuffer);
      }
      
      return renderParts(parts);
    } else {
      // For non-streaming text, use the regex pattern to find complete code blocks
      const codeBlockRegex = /```([\w]*)\n([\s\S]*?)```/g;
      const parts: ContentPart[] = [];
      
      let lastIndex = 0;
      let match;
      
      // Extract all code blocks
      while ((match = codeBlockRegex.exec(text)) !== null) {
        // Add text before this code block
        if (match.index > lastIndex) {
          parts.push(text.substring(lastIndex, match.index));
        }
        
        // Add the code block
        const lang = match[1] || '';
        const code = match[2] || '';
        parts.push({ type: 'code', lang, code });
        
        lastIndex = match.index + match[0].length;
      }
      
      // Add any remaining text after the last code block
      if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
      }
      
      return renderParts(parts);
    }
  };
  
  // Helper function to render the parts (text and code blocks)
  const renderParts = (parts: ContentPart[]): JSX.Element => {
    return (
      <>
        {parts.map((part, i) => {
          if (typeof part === 'string') {
            // This is regular text - process paragraphs and lists
            const paragraphs = part.split('\n\n');
            return (
              <React.Fragment key={i}>
                {paragraphs.map((paragraph, j) => {
                  // Handle lists
                  if (paragraph.trim().match(/^[\*\-\+]|\d+\./)) {
                    // Strip out the leading bullet character (* or - or +)
                    const cleanedParagraph = paragraph.trim().replace(/^[\*\-\+]\s*/, '');
                    return <p key={j} className="list-paragraph">{cleanedParagraph}</p>;
                  }
                  
                  // Regular paragraphs
                  return <p key={j} className="text-paragraph">{paragraph}</p>;
                })}
              </React.Fragment>
            );
          } else {
            // This is a code block - use SyntaxHighlighter
            const isStreaming = part.streaming === true;
            return (
              <div key={i} className={`code-wrapper ${isStreaming ? 'streaming-code' : ''}`}>
                {part.lang && <div className="code-lang">{part.lang}</div>}
                <SyntaxHighlighter
                  language={part.lang || 'text'}
                  style={dracula}
                  showLineNumbers={false}
                  wrapLines={true}
                  className="code-block"
                >
                  {part.code}
                </SyntaxHighlighter>
              </div>
            );
          }
        })}
      </>
    );
  };

  // Format content with code block detection, handling streaming mode separately
  useEffect(() => {
    if (!content) {
      setFormattedContent(null);
      return;
    }
    
    setFormattedContent(processText(content, isLoading));
    
  }, [content, isLoading]);

  return (
    <div 
      ref={textAreaRef}
      className={`text-area-content ${!content && !isLoading && !error ? 'empty-state' : ''}`}
    >
      {isLoading && content.length === 0 && !error ? (
        <div className="loading-indicator">
          <span>Thinking</span>
          <div className="loading-dots">
            <span>.</span><span>.</span><span>.</span>
          </div>
        </div>
      ) : error ? (
        <div className="error-message">
          {error}
        </div>
      ) : (
        <div className={`ai-response ${isLoading ? 'streaming-text' : ''}`}>
          {formattedContent}
        </div>
      )}
    </div>
  );
};

export default TextArea; 