const IMAGE_MAX_DIMENSION = 1280;
const IMAGE_QUALITY = 0.72;
const FALLBACK_IMAGE_MAX_DIMENSION = 960;
const FALLBACK_IMAGE_QUALITY = 0.62;
const EMERGENCY_IMAGE_MAX_DIMENSION = 480;
const EMERGENCY_IMAGE_QUALITY = 0.42;
const MIN_COMPRESS_SIZE = 180 * 1024;
const FORCE_NORMALIZE_SIZE = 1.2 * 1024 * 1024;

function isImageFile(file: File) {
  const name = file.name.toLowerCase();

  return (
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|heic|heif)$/i.test(name)
  );
}

function isHeicImage(file: File) {
  const name = file.name.toLowerCase();

  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
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

  return file.size >= MIN_COMPRESS_SIZE || isHeicImage(file);
}

function shouldForceJpegNormalization(file: File) {
  return isHeicImage(file) || isGenericCameraImage(file) || file.size >= FORCE_NORMALIZE_SIZE;
}

function isGenericCameraImage(file: File) {
  return /^(image|photo|captured|camera|foto)\.jpe?g$/i.test(file.name);
}

function getCompressedName(file: File) {
  const baseName = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!baseName || isGenericCameraImage(file) || isHeicImage(file)) {
    return `atendimento-${Date.now().toString(36)}.jpg`;
  }

  return `${baseName}.jpg`;
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

function isCanvasMostlyBlank(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const stepX = Math.max(1, Math.floor(width / 18));
  const stepY = Math.max(1, Math.floor(height / 18));
  let checked = 0;
  let visiblePixels = 0;

  try {
    for (let y = Math.floor(stepY / 2); y < height; y += stepY) {
      for (let x = Math.floor(stepX / 2); x < width; x += stepX) {
        const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data;
        checked += 1;

        if (alpha > 8 && !(red > 248 && green > 248 && blue > 248)) {
          visiblePixels += 1;
        }
      }
    }
  } catch {
    return false;
  }

  return checked > 0 && visiblePixels / checked < 0.015;
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

  if (isCanvasMostlyBlank(context, width, height)) {
    return null;
  }

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

function buildJpegFile(file: File, blob: Blob) {
  return new File([blob], getCompressedName(file), {
    lastModified: file.lastModified,
    type: "image/jpeg",
  });
}

export async function compressImageFile(file: File) {
  if (!isCompressibleImage(file)) {
    return file;
  }

  try {
    const blob = await drawToJpeg(file, IMAGE_MAX_DIMENSION, IMAGE_QUALITY);

    if (blob && blob.size < file.size) {
      return buildJpegFile(file, blob);
    }

    if (!shouldForceJpegNormalization(file)) {
      return file;
    }

    const fallbackBlob = await drawToJpeg(
      file,
      FALLBACK_IMAGE_MAX_DIMENSION,
      FALLBACK_IMAGE_QUALITY,
    );

    if (!fallbackBlob) {
      return file;
    }

    if (fallbackBlob.size < file.size || isHeicImage(file)) {
      return buildJpegFile(file, fallbackBlob);
    }

    return file;
  } catch {
    return file;
  }
}

export async function prepareEmergencyImageForUpload(file: File) {
  if (!isImageFile(file)) {
    return file;
  }

  try {
    const blob = await drawToJpeg(
      file,
      EMERGENCY_IMAGE_MAX_DIMENSION,
      EMERGENCY_IMAGE_QUALITY,
    );

    if (!blob) {
      return file;
    }

    return new File([blob], `atendimento-${Date.now().toString(36)}.jpg`, {
      lastModified: Date.now(),
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
