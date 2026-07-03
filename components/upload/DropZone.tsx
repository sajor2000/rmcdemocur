"use client";

import { useCallback, useState } from "react";
import { Upload } from "lucide-react";

const ACCEPT = ".pdf,.docx,.pptx";

type DropZoneProps = {
  onUpload: (file: File) => void;
};

export function DropZone({ onUpload }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.[0]) return;
      const file = files[0];
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (![".pdf", ".docx", ".pptx"].includes(ext)) {
        return;
      }
      onUpload(file);
    },
    [onUpload],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
        dragging ? "border-rush-green bg-green-50" : "border-gray-300 bg-white"
      }`}
    >
      <Upload className="mb-4 h-10 w-10 text-rush-green" />
      <p className="font-medium">Drag and drop faculty guides here</p>
      <p className="mt-1 text-sm text-rush-medium">PDF, DOCX, or PPTX</p>
      <label className="mt-4 cursor-pointer text-sm text-rush-green underline">
        Browse files
        <input
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>
    </div>
  );
}
