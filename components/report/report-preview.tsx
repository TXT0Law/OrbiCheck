"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReportPreviewProps {
  content: string;
}

export function ReportPreview({ content }: ReportPreviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Markdown Preview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="prose prose-zinc min-w-0 max-w-none break-words dark:prose-invert">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div
                  role="region"
                  aria-label="Report table"
                  tabIndex={0}
                  className="max-w-full overflow-x-auto"
                >
                  <table>{children}</table>
                </div>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </CardContent>
    </Card>
  );
}
