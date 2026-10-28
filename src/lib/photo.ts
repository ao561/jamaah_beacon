// Photos are shrunk and re-encoded on the device before upload. Re-encoding through a canvas
// also drops EXIF metadata, including the GPS position phones embed in photos.

const MAX_DIMENSION = 1280;
const MAX_BYTES = 350_000; // the server rejects anything over 400 KB
const QUALITIES = [0.75, 0.6, 0.45, 0.3];

export interface PreparedPhoto {
  /** Base64 JPEG without the data: prefix, as the server expects. */
  base64: string;
  /** For previews. */
  dataUrl: string;
}

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    // Applies the EXIF orientation, so portrait photos aren't sideways.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older browsers: fall back to an <img>, which also respects orientation in modern engines.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo (JPEG, PNG or HEIC).');

  const source = await decode(file).catch(() => {
    throw new Error("Couldn't read that photo. Try a different one.");
  });
  const scale = Math.min(1, MAX_DIMENSION / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);

  for (const quality of QUALITIES) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= MAX_BYTES) {
      const dataUrl = await toDataUrl(blob);
      return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), dataUrl };
    }
  }
  throw new Error('That photo is too large, even after shrinking. Try another.');
}
