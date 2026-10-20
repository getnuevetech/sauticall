import path from "path";

export function dataDir() {
  return process.env.SAUTICALL_DATA_DIR || path.join(process.cwd(), "data");
}

export function uploadDir() {
  return process.env.SAUTICALL_UPLOAD_DIR || path.join(process.cwd(), "public", "uploads");
}
