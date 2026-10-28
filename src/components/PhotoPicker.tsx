import { ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { usePhoto } from '../hooks/usePhoto';
import { preparePhoto } from '../lib/photo';
import type { Beacon } from '../lib/types';

export type PhotoChange = { kind: 'keep' } | { kind: 'set'; base64: string; dataUrl: string } | { kind: 'remove' };

interface Props {
  value: PhotoChange;
  onChange: (change: PhotoChange) => void;
  /** When editing: the beacon whose current photo "keep" refers to. */
  existing?: Beacon;
  onError: (message: string) => void;
}

export function PhotoPicker({ value, onChange, existing, onError }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const existingSrc = usePhoto(value.kind === 'keep' ? existing : null);

  const preview = value.kind === 'set' ? value.dataUrl : value.kind === 'keep' ? existingSrc : null;
  const hasExisting = value.kind === 'keep' && Boolean(existing?.photo_updated_at);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setProcessing(true);
    try {
      const { base64, dataUrl } = await preparePhoto(file);
      onChange({ kind: 'set', base64, dataUrl });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't use that photo.");
    } finally {
      setProcessing(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {preview || hasExisting ? (
        <div className="flex items-center gap-3">
          <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
            {preview && <img src={preview} alt="Photo of the spot" className="h-full w-full object-cover" />}
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="text-left text-sm font-semibold text-emerald-700 dark:text-emerald-400"
            >
              Replace photo
            </button>
            <button
              type="button"
              onClick={() => onChange({ kind: 'remove' })}
              className="flex items-center gap-1 text-left text-sm font-medium text-rose-700 dark:text-rose-400"
            >
              <Trash2 className="size-3.5" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {processing ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {processing ? 'Preparing photo…' : 'Add a photo of the spot'}
        </button>
      )}
    </div>
  );
}
