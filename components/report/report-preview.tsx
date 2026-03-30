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
        <div className="prose prose-zinc max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </CardContent>
    </Card>
  );
}
