const IMAGE_MAX_DIMENSION = 1600;
const IMAGE_QUALITY = 0.82;
const MIN_COMPRESS_SIZE = 450 * 1024;

function isCompressibleImage(file: File) {
  const name = file.name.toLowerCase();

  if (!file.type.startsWith("image/")) {
    return false;
  }

  if (
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
  const baseName = file.name.replace(/\.[^.]+$/, "");

  return `${baseName || "imagem"}.jpg`;
}

async function loadImage(file: File) {
  const url = URL.createObjectURL(file);

  try {
    const image = new Image();

    image.decoding = "async";
    image.src = url;

    await image.decode();

    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImageFile(file: File) {
  if (!isCompressibleImage(file)) {
    return file;
  }

  try {
    const image = await loadImage(file);
    const scale = Math.min(
      1,
      IMAGE_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", {
      alpha: false,
    });

    if (!context) {
      return file;
    }

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", IMAGE_QUALITY);
    });

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
  return compressImageFile(file);
}
