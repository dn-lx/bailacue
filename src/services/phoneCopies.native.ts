import { safeVideoName } from "../core/numbering";
import { Directory, File, Paths } from "expo-file-system";
// Copy first: metadata must be committed before the caller removes the old file.
// Isolated identity directories prevent same-number Salsa/Bachata collisions.
export async function prepareNamedCopy(
  uri: string,
  name: string,
  identity: string,
) {
  if (!uri.startsWith(Paths.document.uri))
    throw new Error("Only BailaCue phone copies can be renamed.");
  const directory = new Directory(
    Paths.document,
    "bailacue-numbered",
    identity.replace(/[^a-z0-9_-]/gi, "_"),
  );
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, safeVideoName(name));
  if (destination.uri === uri) return uri;
  const original = new File(uri);
  if (!original.exists)
    throw new Error("This phone copy is unavailable. Download it again.");
  if (destination.exists) {
    if (
      destination.size !== original.size ||
      (await destination.digest("SHA-256")) !==
        (await original.digest("SHA-256"))
    )
      throw new Error(
        "A different phone file already uses that name. Your copy is unchanged.",
      );
    return destination.uri;
  }
  try {
    await original.copy(destination);
    if (destination.size !== original.size)
      throw new Error("The numbered phone copy is incomplete.");
    return destination.uri;
  } catch (e) {
    if (destination.exists) destination.delete();
    throw e;
  }
}
