export type SharedFileMetadata = {
  name: string;
  type: string;
  size: number;
  url: string;
};

export type SharedTargetMetadata = {
  id: string;
  files: SharedFileMetadata[];
  created_at: number;
};

export async function loadSharedTargetFiles(shareId: string) {
  const metadataResponse = await fetch(
    `/share-target-cache/${encodeURIComponent(shareId)}/metadata`,
  );

  if (!metadataResponse.ok) {
    throw new Error("Nao foi possivel abrir o arquivo compartilhado.");
  }

  const metadata = (await metadataResponse.json()) as SharedTargetMetadata;

  return Promise.all(
    metadata.files.map(async (sharedFile) => {
      const fileResponse = await fetch(sharedFile.url);

      if (!fileResponse.ok) {
        throw new Error(`Nao foi possivel abrir ${sharedFile.name}.`);
      }

      const blob = await fileResponse.blob();

      return new File([blob], sharedFile.name, {
        lastModified: metadata.created_at,
        type: sharedFile.type || blob.type || "application/octet-stream",
      });
    }),
  );
}

export function clearShareParamFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("share");
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}
