import { Card, CardContent } from "@/components/ui/card";

export function AiAnswerBox({ answer }: { answer: string }) {
  return (
    <Card className="border-rush-green/30 bg-green-50">
      <CardContent className="pt-6">
        <p className="mb-2 text-xs font-semibold uppercase text-rush-green">AI Answer</p>
        <p className="text-sm leading-relaxed">{answer}</p>
      </CardContent>
    </Card>
  );
}
