import { supabase } from './supabaseClient';

export const ATTACHMENTS_BUCKET = 'tarefas-anexos';
export const MAX_ATTACHMENT_SIZE_MB = 10;

export interface UploadResult {
  url: string;
  nome: string;
  tipo: string;
}

/**
 * Remove caracteres especiais do nome do arquivo para compatibilidade com o Storage
 */
function sanitizeFileName(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf('.');
  const ext = extensionIndex !== -1 ? fileName.slice(extensionIndex) : '';
  const base = extensionIndex !== -1 ? fileName.slice(0, extensionIndex) : fileName;

  const cleanBase = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 50);

  return `${cleanBase}${ext}`;
}

/**
 * Faz upload de um arquivo para o bucket de anexos no Supabase Storage
 */
export async function uploadAttachment(file: File, userId: string): Promise<UploadResult> {
  const maxBytes = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`O arquivo excede o limite de ${MAX_ATTACHMENT_SIZE_MB}MB.`);
  }

  const safeName = sanitizeFileName(file.name);
  const filePath = `${userId}/${Date.now()}_${safeName}`;

  const { error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    if (error.message.includes('bucket not found') || error.message.includes('Bucket not found')) {
      throw new Error(
        'O armazenamento de anexos ainda não foi criado. Execute o script supabase/migracao_v5_anexos_tarefas.sql no Supabase.'
      );
    }
    throw new Error(`Erro ao enviar anexo: ${error.message}`);
  }

  const { data } = supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(filePath);

  return {
    url: data.publicUrl,
    nome: file.name,
    tipo: file.type,
  };
}

/**
 * Remove um anexo do bucket a partir de sua URL pública
 */
export async function deleteAttachment(publicUrl: string): Promise<void> {
  try {
    const bucketMarker = `/${ATTACHMENTS_BUCKET}/`;
    const markerIndex = publicUrl.indexOf(bucketMarker);
    if (markerIndex === -1) return;

    const filePath = decodeURIComponent(publicUrl.substring(markerIndex + bucketMarker.length));
    if (!filePath) return;

    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([filePath]);
  } catch (err) {
    console.warn('Não foi possível remover o anexo anterior do storage:', err);
  }
}
