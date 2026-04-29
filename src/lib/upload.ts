import type { Attachment } from "../types/sori";
import { uploadFormData } from "./api";

export async function uploadAttachment(file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await uploadFormData<{ attachment: Attachment }>("/upload", formData);
  return response.attachment;
}
