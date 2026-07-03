"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { confidenceBadgeClass, formatConfidence } from "@/lib/utils";

type Alignment = {
  id: number;
  frameworkLabel: string | null;
  confidence: string | null;
  rationale: string | null;
  status: string | null;
};

type Props = {
  alignment: Alignment | null;
  excerpt: string;
  onClose: () => void;
  onApprove: (id: number, status: "approved" | "rejected") => void;
};

export function AlignmentDrawer({
  alignment,
  excerpt,
  onClose,
  onApprove,
}: Props) {
  return (
    <Dialog open={!!alignment} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{alignment?.frameworkLabel ?? "Alignment"}</DialogTitle>
        </DialogHeader>
        {alignment && (
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-rush-medium">
                Chunk excerpt
              </p>
              <p className="text-sm">{excerpt.slice(0, 500)}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-rush-medium">
                AI rationale
              </p>
              <p className="text-sm">{alignment.rationale}</p>
            </div>
            <Badge
              className={confidenceBadgeClass(Number(alignment.confidence ?? 0))}
            >
              Confidence {formatConfidence(Number(alignment.confidence ?? 0))}
            </Badge>
            <p className="text-xs capitalize text-rush-medium">
              Status: {alignment.status}
            </p>
            <div className="flex gap-2">
              <Button onClick={() => onApprove(alignment.id, "approved")}>
                Approve
              </Button>
              <Button
                variant="outline"
                onClick={() => onApprove(alignment.id, "rejected")}
              >
                Reject
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
