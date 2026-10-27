import type { Connection } from "../../core/types";
import { GoogleDriveProvider } from "../providers/googleDrive";
import { DropboxProvider } from "../providers/dropbox";
import { accessToken } from "./accounts";
export function provider(connection: Connection) {
  const token = () => accessToken(connection);
  return connection.provider === "google-drive"
    ? new GoogleDriveProvider(token)
    : new DropboxProvider(token);
}
