import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const NonMemoizedMarkdown = ({ children }: { children: string }) => {
  const components = {
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || "");
      return !inline && match ? (
        <pre
          {...props}
          className={`${className} text-sm w-full max-w-full overflow-x-auto p-3 rounded-md mt-3 mb-3 border font-mono`}
          style={{
            backgroundColor: 'var(--active-bg)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-color)'
          }}
        >
          <code className={`language-${match[1]} text-sm`} style={{ color: 'var(--text-color)' }}>
            {children}
          </code>
        </pre>
      ) : (
        <code
          className={`${className} text-sm py-0.5 px-1.5 rounded-md font-mono`}
          style={{
            backgroundColor: 'var(--active-bg)',
            color: 'var(--text-color)'
          }}
          {...props}
        >
          {children}
        </code>
      );
    },
    ol: ({ node, children, ...props }: any) => {
      return (
        <ol className="list-decimal ml-6 mb-4 space-y-1" {...props}>
          {children}
        </ol>
      );
    },
    ul: ({ node, children, ...props }: any) => {
      return (
        <ul className="list-disc ml-6 mb-4 space-y-1" {...props}>
          {children}
        </ul>
      );
    },
    li: ({ node, children, ...props }: any) => {
      return (
        <li className="leading-relaxed" {...props}>
          {children}
        </li>
      );
    },
    p: ({ node, children, ...props }: any) => {
      return (
        <p className="mb-3 leading-relaxed" {...props}>
          {children}
        </p>
      );
    },
    h1: ({ node, children, ...props }: any) => {
      return (
        <h1 className="text-xl font-bold mb-3 mt-4" {...props}>
          {children}
        </h1>
      );
    },
    h2: ({ node, children, ...props }: any) => {
      return (
        <h2 className="text-lg font-semibold mb-2 mt-3" {...props}>
          {children}
        </h2>
      );
    },
    h3: ({ node, children, ...props }: any) => {
      return (
        <h3 className="text-md font-medium mb-2 mt-3" {...props}>
          {children}
        </h3>
      );
    },
    blockquote: ({ node, children, ...props }: any) => {
      return (
        <blockquote 
          className="border-l-4 pl-4 my-3 italic"
          style={{
            borderColor: 'var(--border-color)',
            color: 'var(--muted-text-color)'
          }}
          {...props}
        >
          {children}
        </blockquote>
      );
    },
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
};

export const Markdown = React.memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children
);
