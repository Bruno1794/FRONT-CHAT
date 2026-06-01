const IMAGE_MAX_DIMENSION = 1280;
const IMAGE_QUALITY = 0.72;
const MIN_COMPRESS_SIZE = 180 * 1024;

function isImageFile(file: File) {
  const name = file.name.toLowerCase();

  return (
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|heic|heif)$/i.test(name)
  );
}

function isCompressibleImage(file: File) {
  const name = file.name.toLowerCase();

  if (
    !isImageFile(file) ||
    file.type === "image/gif" ||
    file.type === "image/svg+xml" ||
    name.endsWith(".gif") ||
    name.endsWith(".svg")
  ) {
    return false;
  }

  return file.size >= MIN_COMPRESS_SIZE;
}

function getCompressedName(file: File) {
  const baseName = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${baseName || "imagem"}.jpg`;
}

async function loadImage(file: File) {
  const url = URL.createObjectURL(file);

  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Imagem invalida."));
      image.src = url;

      if ("decode" in image) {
        image.decode().then(() => resolve(image)).catch(() => undefined);
      }
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function drawToJpeg(file: File, maxDimension: number, quality: number) {
  const image = await loadImage(file);
  const scale = Math.min(
    1,
    maxDimension / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {
    alpha: false,
  });

  if (!context) {
    return null;
  }

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

export async function compressImageFile(file: File) {
  if (!isCompressibleImage(file)) {
    return file;
  }

  try {
    const blob = await drawToJpeg(file, IMAGE_MAX_DIMENSION, IMAGE_QUALITY);

    if (!blob || blob.size >= file.size) {
      return file;
    }

    return new File([blob], getCompressedName(file), {
      lastModified: file.lastModified,
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

export async function prepareFileForUpload(file: File) {
  if (isImageFile(file)) {
    return compressImageFile(file);
  }

  return file;
}
