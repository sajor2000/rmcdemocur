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

type MediaAssetPreview = {
  id: number;
  label: string;
  textForEmbed: string | null;
  storagePath: string | null;
  hasCaptionInText: boolean | null;
  referenceKind: string;
};

type Props = {
  alignment: Alignment | null;
  excerpt: string;
  linkedMedia?: MediaAssetPreview[];
  onClose: () => void;
  onApprove: (id: number, status: "approved" | "rejected") => void;
};

export function AlignmentDrawer({
  alignment,
  excerpt,
  linkedMedia = [],
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
            {linkedMedia.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-rush-medium">
                  Linked figures
                </p>
                <div className="space-y-3">
                  {linkedMedia.map((media) => (
                    <div key={media.id} className="rounded border p-2">
                      <div className="mb-1 flex items-center gap-2">
                        <p className="text-sm font-medium">{media.label}</p>
                        {!media.hasCaptionInText && (
                          <Badge className="border-rush-medium/40 bg-transparent text-rush-medium">
                            image only
                          </Badge>
                        )}
                      </div>
                      {media.storagePath ? (
                        <img
                          src={`/api/media/${media.id}`}
                          alt={media.label}
                          className="max-h-48 rounded border object-contain"
                        />
                      ) : (
                        <p className="text-xs text-rush-medium">
                          Caption available in text; image file not extracted (PDF or pending extract).
                        </p>
                      )}
                      {media.textForEmbed && (
                        <p className="mt-2 text-xs text-rush-medium">
                          {media.textForEmbed.slice(0, 240)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
