export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  type: 'image' | 'text' | 'document';
  mimeType: string;
  data: string; // base64 DataURL
  previewUrl: string;
  textContent?: string;
}

/**
 * Converte e ottimizza un File per l'invio alla chat multimodale.
 * Se è un'immagine molto grande, la ridimensiona preservando la nitidezza dei testi/tabelle
 * per evitare di sovraccaricare la memoria del browser o i tempi di upload.
 */
export async function processFileToAttachment(file: File): Promise<ChatAttachment> {
  const id = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const isImage = file.type.startsWith('image/');
  const isText = file.type.startsWith('text/') || 
                 file.name.endsWith('.csv') || 
                 file.name.endsWith('.json') || 
                 file.name.endsWith('.txt') || 
                 file.name.endsWith('.md');
  const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');

  if (isImage) {
    const dataUrl = await readFileAsDataUrl(file);
    const optimized = await optimizeImage(dataUrl, file.type || 'image/png');
    return {
      id,
      name: file.name || `Screenshot_${new Date().toLocaleTimeString().replace(/:/g, '')}.png`,
      size: optimized.size,
      type: 'image',
      mimeType: optimized.mimeType,
      data: optimized.dataUrl,
      previewUrl: optimized.dataUrl,
    };
  }

  if (isText) {
    const textContent = await readFileAsText(file);
    const dataUrl = await readFileAsDataUrl(file);
    return {
      id,
      name: file.name,
      size: file.size,
      type: 'text',
      mimeType: file.type || 'text/plain',
      data: dataUrl,
      previewUrl: '',
      textContent: textContent.slice(0, 100000), // Limite prudenziale a 100k caratteri per file testuali
    };
  }

  // Documento generico (es. PDF)
  const dataUrl = await readFileAsDataUrl(file);
  return {
    id,
    name: file.name,
    size: file.size,
    type: isPdf ? 'document' : 'document',
    mimeType: file.type || 'application/octet-stream',
    data: dataUrl,
    previewUrl: '',
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Ridimensiona l'immagine se eccede dimensioni massime (es. 2048px),
 * mantenendo un'altissima leggibilità dei testi e tabelle di FM26.
 */
function optimizeImage(dataUrl: string, originalMime: string): Promise<{ dataUrl: string; size: number; mimeType: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 2048;
      let width = img.width;
      let height = img.height;

      // Se l'immagine è già moderata (< 2MB e <= 2048px), non comprimerla inutilmente
      if (width <= maxDim && height <= maxDim && dataUrl.length < 2.5 * 1024 * 1024) {
        resolve({
          dataUrl,
          size: Math.round(dataUrl.length * 0.75),
          mimeType: originalMime || 'image/png'
        });
        return;
      }

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({
          dataUrl,
          size: Math.round(dataUrl.length * 0.75),
          mimeType: originalMime || 'image/png'
        });
        return;
      }

      // Disegna con interpolazione di qualità
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const targetMime = originalMime === 'image/png' ? 'image/png' : 'image/jpeg';
      const quality = targetMime === 'image/jpeg' ? 0.90 : undefined;
      const resultDataUrl = canvas.toDataURL(targetMime, quality);

      resolve({
        dataUrl: resultDataUrl,
        size: Math.round(resultDataUrl.length * 0.75),
        mimeType: targetMime
      });
    };
    img.onerror = () => {
      resolve({
        dataUrl,
        size: Math.round(dataUrl.length * 0.75),
        mimeType: originalMime || 'image/png'
      });
    };
    img.src = dataUrl;
  });
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
