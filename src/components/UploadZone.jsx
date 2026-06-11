/**
 * UploadZone — single and batch upload.
 * Single: drag/drop + browse, JPG/PNG/PDF, instant preview.
 * Batch: ZIP (JSZip, client-side) and folder picker (webkitdirectory),
 * both feeding the same queue. All file-type/size errors surface with
 * specific, actionable messages.
 */
import { useRef, useState } from 'react';
import JSZip from 'jszip';

const SUPPORTED = ['image/jpeg', 'image/png', 'application/pdf'];
const SUPPORTED_EXT = /\.(jpe?g|png|pdf)$/i;
const MAX_BYTES = 10 * 1024 * 1024;

export function checkFile(file) {
  const okType = SUPPORTED.includes(file.type) || SUPPORTED_EXT.test(file.name);
  if (!okType) {
    return 'This file type is not supported. Please upload JPG, PNG, or PDF files only.';
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `This file is ${mb}MB which exceeds the 10MB limit. Please compress the image and try again.`;
  }
  return null;
}

/** Unpack a ZIP entirely in the browser. Returns { files, notice } or throws { message }. */
export async function unpackZip(file) {
  let zip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch (e) {
    if (/encrypted|password/i.test(String(e?.message))) {
      throw new Error('This ZIP file is password protected. Please remove password protection and re-upload.');
    }
    throw new Error('This file appears to be corrupted and cannot be read. Please re-export from the original source and try again.');
  }
  const entries = Object.values(zip.files).filter((e) => !e.dir && !e.name.startsWith('__MACOSX'));
  if (entries.some((e) => e.options?.compression === null)) { /* noop — jszip handles */ }
  const supported = entries.filter((e) => SUPPORTED_EXT.test(e.name));
  const unsupported = entries.filter((e) => !SUPPORTED_EXT.test(e.name));
  if (supported.length === 0) {
    throw new Error('Your ZIP file contains no supported image files. Please check that the ZIP contains JPG, PNG, or PDF files.');
  }
  const files = await Promise.all(supported.map(async (e) => {
    const blob = await e.async('blob');
    const name = e.name.split('/').pop();
    return new File([blob], name, { type: name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : `image/${name.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'}` });
  }));
  const notice = unsupported.length
    ? `Found ${supported.length} supported image files and ${unsupported.length} unsupported files in your ZIP. Only the image files will be analyzed. Unsupported files: ${unsupported.map((u) => u.name.split('/').pop()).join(', ')}`
    : null;
  return { files, notice };
}

export default function UploadZone({ mode, onModeChange, onSingleFile, onBatchFiles, onError, onNotice }) {
  const [dragging, setDragging] = useState(false);
  const browseRef = useRef(null);
  const zipRef = useRef(null);
  const folderRef = useRef(null);

  function handleSingle(file) {
    if (!file) return;
    const err = checkFile(file);
    if (err) { onError(err); return; }
    onSingleFile(file);
  }

  async function handleZip(file) {
    if (!file) return;
    try {
      const { files, notice } = await unpackZip(file);
      if (notice) onNotice(notice);
      onBatchFiles(files);
    } catch (e) {
      onError(e.message);
    }
  }

  function handleFolder(fileList) {
    const all = Array.from(fileList || []);
    const files = all.filter((f) => SUPPORTED_EXT.test(f.name));
    if (files.length === 0) {
      onError('The selected folder contains no supported image files.');
      return;
    }
    onBatchFiles(files);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    if (mode === 'batch') {
      if (files.length === 1 && /\.zip$/i.test(files[0].name)) handleZip(files[0]);
      else handleFolder(files);
    } else {
      if (/\.zip$/i.test(files[0].name)) {
        onError('This file type is not supported. Please upload JPG, PNG, or PDF files only. (Switch to Batch Mode to upload a ZIP.)');
        return;
      }
      handleSingle(files[0]);
    }
  }

  return (
    <section aria-label="Upload">
      <div className="flex gap-0 mb-4" role="tablist" aria-label="Upload mode">
        {[['single', 'Single Label'], ['batch', 'Batch Mode']].map(([m, label]) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => onModeChange(m)}
            className={`min-h-[44px] px-6 text-base font-semibold border border-navy-600 first:rounded-l last:rounded-r ${
              mode === m ? 'bg-navy-700 text-white' : 'bg-white text-navy-700 hover:bg-navy-50'}`}>
            {label}
          </button>
        ))}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`min-h-[300px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-3 p-8 text-center ${
          dragging ? 'border-navy-600 bg-navy-50' : 'border-gray-400 bg-gray-50'}`}>
        <span className="text-5xl" aria-hidden="true">🏷️</span>
        {mode === 'single' ? (
          <>
            <p className="text-lg text-gray-800 font-medium">Drag a label image here</p>
            <p className="text-base text-gray-600">JPG, PNG, or PDF — up to 10MB</p>
            <button onClick={() => browseRef.current?.click()}
              className="min-h-[44px] px-6 bg-navy-700 text-white text-base font-semibold rounded hover:bg-navy-800">
              Or click to choose a file
            </button>
            <input ref={browseRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
              onChange={(e) => { handleSingle(e.target.files?.[0]); e.target.value = ''; }} />
          </>
        ) : (
          <>
            <p className="text-lg text-gray-800 font-medium">Drop a ZIP file here, or choose an option</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button onClick={() => zipRef.current?.click()}
                className="min-h-[44px] px-6 bg-navy-700 text-white text-base font-semibold rounded hover:bg-navy-800">
                Upload ZIP File
              </button>
              <button onClick={() => folderRef.current?.click()}
                className="min-h-[44px] px-6 border-2 border-navy-700 text-navy-700 text-base font-semibold rounded hover:bg-navy-50">
                Select Folder
              </button>
            </div>
            <input ref={zipRef} type="file" accept=".zip" className="hidden"
              onChange={(e) => { handleZip(e.target.files?.[0]); e.target.value = ''; }} />
            <input ref={folderRef} type="file" webkitdirectory="" multiple className="hidden"
              onChange={(e) => { handleFolder(e.target.files); e.target.value = ''; }} />
          </>
        )}
      </div>
    </section>
  );
}
