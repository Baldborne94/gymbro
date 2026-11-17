import { useEffect, useState } from 'react';
import { db } from '../db';

/** Mostra una foto: prima la copia sul dispositivo, altrimenti quella sul server. */
export function Photo({ id, alt, className }: { id: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | undefined;
    let alive = true;
    db.blobs.get(id).then((b) => {
      if (!alive) return;
      if (b) {
        url = URL.createObjectURL(b.blob);
        setSrc(url);
      } else {
        setSrc(`/api/photos/${id}`);
      }
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return src ? <img className={className} src={src} alt={alt} /> : null;
}

/** Riduce la foto a un JPEG di dimensioni ragionevoli prima di salvarla. */
export async function shrinkImage(file: File, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversione non riuscita'))), 'image/jpeg', 0.85),
  );
}
