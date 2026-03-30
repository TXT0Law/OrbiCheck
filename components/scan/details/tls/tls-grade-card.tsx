import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { TlsCipherStats } from "@/shared/types/scan";

interface TlsGradeCardProps {
  grade?: string | null;
  score?: number | null;
  preferredProtocol?: string;
  cipherStats?: TlsCipherStats | null;
}

const GRADE_COLORS: Record<string, string> = {
  "A+": "bg-green-500 text-white",
  A: "bg-green-400 text-white",
  "A-": "bg-green-400/90 text-white",
  B: "bg-yellow-400 text-black",
  C: "bg-orange-400 text-white",
  D: "bg-red-400 text-white",
  F: "bg-red-600 text-white",
};

export function TlsGradeCard({
  grade,
  score,
  preferredProtocol,
  cipherStats,
}: TlsGradeCardProps) {
  const displayGrade = grade || "—";
  const gradeColor = GRADE_COLORS[grade ?? ""] ?? "bg-zinc-400 text-white";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>TLS Grade</span>
          <span
            className={`inline-flex h-12 w-12 items-center justify-center rounded-lg text-xl font-bold ${gradeColor}`}
          >
            {displayGrade}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {score !== undefined && score !== null && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Score: {score}/100
            </p>
            <Progress value={score} className="h-2" />
          </div>
        )}
        {preferredProtocol && (
          <p className="text-sm text-muted-foreground">
            Preferred Protocol:{" "}
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {preferredProtocol}
            </span>
          </p>
        )}
        {cipherStats && cipherStats.total > 0 && (
          <div className="text-sm text-muted-foreground">
            Forward Secrecy:{" "}
            {cipherStats.forwardSecrecyPercent >= 100 ? (
              <span className="font-medium text-green-600 dark:text-green-400">
                Yes ({cipherStats.forwardSecrecyPercent}%)
              </span>
            ) : (
              <span className="font-medium text-yellow-600 dark:text-yellow-400">
                Partial ({cipherStats.forwardSecrecyPercent}%)
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
