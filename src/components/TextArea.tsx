import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion, AnimatePresence } from 'framer-motion';
import LoadingDots from './LoadingDots';

/**
 * TextArea.tsx - Content display component for the Sidekick application
 * Handles markdown parsing, syntax highlighting, and animated text rendering
 */

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

// Interface for heading parts
interface HeadingPart {
  type: 'heading';
  text: string;
}

// Type for content parts (either string, code, or heading)
type ContentPart = string | CodePart | HeadingPart;

const TextArea: React.FC<TextAreaProps> = ({ content, isLoading = false, error = null }) => {
  const textAreaRef = useRef<HTMLDivElement>(null);
  const [formattedContent, setFormattedContent] = useState<JSX.Element | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [displayedContent, setDisplayedContent] = useState('');
  const prevDimensionsRef = useRef({ width: 0, height: 0 });
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const chunkFailsafeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastRenderTimeRef = useRef(0);

  // Simplified controlled text rendering function
  const renderTextChunks = useCallback((fullText: string) => {
    // Clear any existing timeouts
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
      renderTimeoutRef.current = null;
    }
    
    if (chunkFailsafeTimerRef.current) {
      clearTimeout(chunkFailsafeTimerRef.current);
      chunkFailsafeTimerRef.current = null;
    }

    // If not loading or content is empty, just display everything immediately
    if (!isLoading || !fullText) {
      setDisplayedContent(fullText);
      return;
    }

    // If this is the first update after a reset or initial render,
    // just show the content immediately
    const now = Date.now();
    if (now - lastRenderTimeRef.current > 1000 || !displayedContent) {
      setDisplayedContent(fullText);
      lastRenderTimeRef.current = now;
      return;
    }

    // Current display length and target length
    const currentLength = displayedContent.length;
    const targetLength = fullText.length;
    
    // Nothing to do if we're already showing all content
    if (currentLength >= targetLength) {
      return;
    }
    
    // Calculate the next chunk size (simpler algorithm)
    let nextChunkSize = 12; // Default chunk size
    const isInCodeBlock = fullText.slice(0, currentLength).split('```').length % 2 === 0;
    
    if (isInCodeBlock) {
      nextChunkSize = 25; // Larger chunks for code blocks
    }
    
    const nextLength = Math.min(currentLength + nextChunkSize, targetLength);
    
    // Update displayed content
    setDisplayedContent(fullText.slice(0, nextLength));
    lastRenderTimeRef.current = now;
    
    // If we haven't shown all content yet, schedule the next chunk
    if (nextLength < targetLength) {
      const chunkDelay = isInCodeBlock ? 15 : 25;
      
      renderTimeoutRef.current = setTimeout(() => {
        renderTextChunks(fullText);
      }, chunkDelay);
      
      // Set a failsafe timer - if chunks stop rendering for any reason,
      // this will display all content after 2 seconds
      chunkFailsafeTimerRef.current = setTimeout(() => {
        console.log("Chunk rendering failsafe triggered - showing all content");
        setDisplayedContent(fullText);
      }, 2000);
    }
  }, [displayedContent, isLoading]);

  // Effect to handle content changes
  useEffect(() => {
    // Process new content
    if (content !== displayedContent) {
      // If content is shorter than what we're displaying, 
      // we're likely starting over - show immediately
      if (content.length < displayedContent.length) {
        setDisplayedContent(content);
        lastRenderTimeRef.current = 0; // Reset timer
      } else {
        renderTextChunks(content);
      }
    }
    
    // Cleanup function
    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
      if (chunkFailsafeTimerRef.current) {
        clearTimeout(chunkFailsafeTimerRef.current);
      }
    };
  }, [content, renderTextChunks]);

  // Effect to resize the parent window when content changes
  useEffect(() => {
    if (textAreaRef.current && window.electron) {
      // Clear any existing timeout to prevent queue buildup
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      
      // Use a proper debounce to prevent rapid resize calls
      resizeTimeoutRef.current = setTimeout(() => {
        if (!textAreaRef.current) return;
        
        const height = textAreaRef.current.scrollHeight || 0;
        const width = textAreaRef.current.scrollWidth || 0;
        
        // Add padding to account for container padding and header
        const totalHeight = height + 60; // Account for padding and header
        const totalWidth = Math.max(width + 40, 820); // Maintain minimum width
        
        // Get stored dimensions to compare change
        const prevWidth = prevDimensionsRef.current.width;
        const prevHeight = prevDimensionsRef.current.height;
        
        // Special handling for empty content - don't resize smaller than header height
        const minHeight = 42; // Match header height
        
        // Only resize if dimensions are significantly different
        // For empty content, don't animate the height collapse
        if ((content || error || isLoading) && 
            (Math.abs(totalWidth - prevWidth) > 5 || 
             Math.abs(totalHeight - prevHeight) > 5)) {
          
          // Start animation state
          setIsAnimating(true);
          
          // Save current dimensions for future comparison
          prevDimensionsRef.current = { width: totalWidth, height: totalHeight };
          
          // Trigger the resize with animation awareness
          window.electron.resizeWindow(totalWidth, Math.max(totalHeight, minHeight));
          
          // Reset animation state after transition completes
          setTimeout(() => {
            setIsAnimating(false);
          }, 300); // Slightly longer than the CSS transition
        } else if (!content && !error && !isLoading) {
          // For empty state, immediately collapse to minimum height without animation
          setIsAnimating(false);
          
          // Directly update to min height without animation
          prevDimensionsRef.current = { width: totalWidth, height: minHeight };
          window.electron.resizeWindow(totalWidth, minHeight);
        }
      }, 50); // Increased delay for better batching
      
      return () => {
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
        }
      };
    }
  }, [displayedContent, error, isLoading, content]);

  // Process bold text wrapped with & symbols
  const processBoldText = (text: string): React.ReactNode[] => {
    if (!text.includes('&')) {
      // No bold text markers, return the original text
      return [text];
    }

    const elements: React.ReactNode[] = [];
    const segments = text.split(/(&[^&]+&)/);

    segments.forEach((segment, index) => {
      if (segment.startsWith('&') && segment.endsWith('&') && segment.length > 2) {
        // This is bold text, remove & symbols and apply bold styling
        const boldText = segment.substring(1, segment.length - 1);
        elements.push(<strong key={index} className="bold-text">{boldText}</strong>);
      } else if (segment) {
        // Regular text
        elements.push(segment);
      }
    });

    return elements;
  };

  // Enhanced processText function to handle streaming code blocks and headings
  const processText = (text: string, isStreaming = false): JSX.Element => {
    if (!text) {
      return <></>;
    }
    
    // For streaming text, we need more careful parsing
    if (isStreaming) {
      const lines = text.split('\n');
      const parts: ContentPart[] = [];
      
      let inCodeBlock = false;
      let codeBlockStart = 0;
      let codeBlockLang = '';
      let regularTextBuffer = '';
      
      // Process each line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check for heading pattern: ## HEADING ##
        const headingMatch = line.trim().match(/^##\s+(.+?)\s+##$/);
        if (headingMatch && !inCodeBlock) {
          // Add any buffered regular text before this heading
          if (regularTextBuffer) {
            parts.push(regularTextBuffer);
            regularTextBuffer = '';
          }
          
          // Add the heading
          parts.push({
            type: 'heading',
            text: headingMatch[1]
          });
          continue;
        }
        
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
      // For non-streaming text, use regex patterns to find headings and code blocks
      const parts: ContentPart[] = [];
      let lastIndex = 0;
      
      // First, find all occurrences of headings and code blocks
      const combinedRegex = /(?:##\s+(.+?)\s+##)|(?:```([\w]*)\n([\s\S]*?)```)/g;
      
      let match;
      while ((match = combinedRegex.exec(text)) !== null) {
        // Add text before this match
        if (match.index > lastIndex) {
          parts.push(text.substring(lastIndex, match.index));
        }
        
        // Determine if this is a heading or code block
        if (match[1] !== undefined) {
          // This is a heading
          parts.push({
            type: 'heading',
            text: match[1]
          });
        } else {
          // This is a code block
          const lang = match[2] || '';
          const code = match[3] || '';
        parts.push({ type: 'code', lang, code });
        }
        
        lastIndex = match.index + match[0].length;
      }
      
      // Add any remaining text after the last match
      if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
      }
      
      return renderParts(parts);
    }
  };
  
  // Helper function to render the parts (text, headings, and code blocks)
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
                    // Process bold text in list paragraphs
                    return <p key={j} className="list-paragraph">{processBoldText(cleanedParagraph)}</p>;
                  }
                  
                  // Regular paragraphs with bold text processing
                  return <p key={j} className="text-paragraph">{processBoldText(paragraph)}</p>;
                })}
              </React.Fragment>
            );
          } else if (part.type === 'heading') {
            // This is a heading - also process bold text inside headings
            return (
              <h3 key={i} className="text-heading">{processBoldText(part.text)}</h3>
            );
          } else {
            // This is a code block - use SyntaxHighlighter
            // Note: For code blocks, we don't process bold text since it's handled by syntax highlighting
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
    if (!displayedContent) {
      setFormattedContent(null);
      return;
    }
    
    try {
      setFormattedContent(processText(displayedContent, isLoading));
    } catch (err) {
      console.error("Error processing text:", err);
      // Fallback to showing plain text if processing fails
      setFormattedContent(<div>{displayedContent}</div>);
    }
    
  }, [displayedContent, isLoading]);

  // Failsafe useEffect - if we have content but nothing is displayed after 3 seconds,
  // force display all content
  useEffect(() => {
    if (content && !displayedContent && isLoading) {
      const failsafeTimer = setTimeout(() => {
        console.log("Display failsafe triggered - forcing content display");
        setDisplayedContent(content);
      }, 3000);
      
      return () => clearTimeout(failsafeTimer);
    }
  }, [content, displayedContent, isLoading]);

  const containerVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { 
      opacity: 1, 
      x: 0,
      transition: {
        duration: 0.3
      }
    },
    exit: { 
      opacity: 0, 
      x: -20,
      transition: {
        duration: 0.2
      }
    }
  };

  return (
    <div 
      ref={textAreaRef}
      className={`text-area-content ${!displayedContent && !isLoading && !error ? 'empty-state' : ''} ${isAnimating ? 'animating' : ''}`}
      data-content-length={displayedContent.length}
      data-full-length={content.length}
      style={{ 
        height: !displayedContent && !isLoading && !error ? 0 : undefined,
        overflow: !displayedContent && !isLoading && !error ? 'hidden' : undefined
      }}
    >
      <AnimatePresence mode="wait">
      {isLoading && displayedContent.length === 0 && !error ? (
          <motion.div 
            key="loading"
            className="loading-indicator"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={containerVariants}
          >
            <LoadingDots color="#FFFFFF" size={6} gap={6} />
          </motion.div>
      ) : isLoading && displayedContent === 'Ingesting Audio' && !error ? (
          <motion.div 
            key="ingesting"
            className="loading-indicator"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={containerVariants}
          >
          <span>Ingesting Audio</span>
            <LoadingDots color="#FFFFFF" size={6} gap={6} />
          </motion.div>
      ) : error ? (
          <motion.div 
            key="error"
            className="error-message"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={containerVariants}
          >
          {error}
          </motion.div>
      ) : (
          <motion.div 
            key="content"
            className={`ai-response ${isLoading ? 'streaming-text' : ''} ${isAnimating ? 'content-animating' : ''}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
          {formattedContent}
          </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
};

export default TextArea; 