"use client";

import { useEffect, useState } from "react";

type Props = { files: File[] };

export default function PhotoBatchPreview({ files }: Props) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const newUrls = files.map((file) => URL.createObjectURL(file));
    setUrls(newUrls);
    return () => {
      newUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  if (files.length === 0) return null;

  return (
    <div
      className="content-block"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
        gap: "8px",
      }}
    >
      {files.map((file, i) => (
        <img
          key={i}
          src={urls[i]}
          alt={file.name}
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            objectFit: "cover",
            display: "block",
            background: "var(--surface)",
          }}
        />
      ))}
    </div>
  );
}
