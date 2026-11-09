import Foundation

@MainActor
final class GoogleDriveService {
    private let auth: GoogleAuth
    private let api = "https://www.googleapis.com/drive/v3"
    private let uploadAPI = "https://www.googleapis.com/upload/drive/v3"
    private let chunkSize = 8 * 1024 * 1024

    init(auth: GoogleAuth) { self.auth = auth }

    private func request(_ url: URL, method: String = "GET", data: Data? = nil,
                         headers: [String: String] = [:]) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer " + (try await auth.validAccessToken()), forHTTPHeaderField: "Authorization")
        for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
        request.httpBody = data
        let (bytes, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ProcessorError.request("No Google Drive response.") }
        guard (200...299).contains(http.statusCode) || http.statusCode == 308 else {
            let message = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any]
            let detail = (message?["error"] as? [String: Any])?["message"] as? String
            throw ProcessorError.request("Google Drive HTTP \(http.statusCode): " + (detail ?? "request failed"))
        }
        return (bytes, http)
    }

    private func json(_ data: Data) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw ProcessorError.request("Google Drive returned invalid JSON.")
        }
        return value
    }

    private func file(_ data: [String: Any]) throws -> DriveVideo {
        guard let id = data["id"] as? String, let name = data["name"] as? String,
              let mime = data["mimeType"] as? String else {
            throw ProcessorError.request("Google Drive returned incomplete file metadata.")
        }
        return DriveVideo(
            id: id, name: name, mimeType: mime,
            size: Int64(data["size"] as? String ?? "") ?? 0,
            parents: data["parents"] as? [String] ?? [],
            appProperties: data["appProperties"] as? [String: String]
        )
    }

    func listVideos(folderID: String) async throws -> [DriveVideo] {
        guard Self.validID(folderID) else { throw ProcessorError.invalid("Invalid Google Drive folder ID.") }
        let files = try await listAll(folderID: folderID)
        return files.filter { $0.mimeType.hasPrefix("video/") && $0.size > 1024 }
    }

    func listAll(folderID: String) async throws -> [DriveVideo] {
        guard Self.validID(folderID) else { throw ProcessorError.invalid("Invalid Google Drive folder ID.") }
        var page = ""
        var records: [DriveVideo] = []
        repeat {
            var parts = URLComponents(string: api + "/files")!
            parts.queryItems = [
                .init(name: "q", value: "'\(folderID)' in parents and trashed = false"),
                .init(name: "fields", value: "nextPageToken,files(id,name,mimeType,size,parents,appProperties)"),
                .init(name: "pageSize", value: "1000"),
                .init(name: "supportsAllDrives", value: "true"),
                .init(name: "includeItemsFromAllDrives", value: "true")
            ]
            if !page.isEmpty { parts.queryItems?.append(.init(name: "pageToken", value: page)) }
            let value = try json((try await request(parts.url!)).0)
            for item in value["files"] as? [[String: Any]] ?? [] {
                records.append(try file(item))
            }
            page = value["nextPageToken"] as? String ?? ""
        } while !page.isEmpty
        return records
    }

    func ensureOriginal(_ video: DriveVideo, dance: Dance) async throws -> DriveVideo {
        guard video.mimeType.hasPrefix("video/") else { throw ProcessorError.invalid("Only video files can be imported.") }
        if video.parents.contains(dance.sourceFolder) { return video }
        let existing = try await listAll(folderID: dance.sourceFolder)
        if let previous = existing.first(where: {
            $0.appProperties?["bailacueExternalId"] == video.id && $0.size == video.size
        }) { return previous }
        let highest = existing.compactMap { file -> Int? in
            let stem = URL(fileURLWithPath: file.name).deletingPathExtension().lastPathComponent
            return stem.allSatisfy(\.isNumber) ? Int(stem) : nil
        }.max() ?? 0
        let suffix = (video.name as NSString).pathExtension.lowercased()
        guard ["mp4", "mov", "m4v", "webm", "mkv", "avi", "3gp"].contains(suffix) else {
            throw ProcessorError.invalid("Unsupported source format: \(video.name)")
        }
        let targetName = String(format: "%04d", highest + 1) + "." + suffix
        let details: [String: Any] = [
            "name": targetName,
            "parents": [dance.sourceFolder],
            "appProperties": ["bailacueExternalId": video.id]
        ]
        let body = try JSONSerialization.data(withJSONObject: details)
        var parts = URLComponents(string: api + "/files/" + video.id + "/copy")!
        parts.queryItems = [.init(name: "supportsAllDrives", value: "true"),
                            .init(name: "fields", value: "id,name,mimeType,size,parents,appProperties")]
        let answer = try await request(parts.url!, method: "POST", data: body,
                                       headers: ["Content-Type": "application/json"])
        let copied = try file(json(answer.0))
        guard copied.parents.contains(dance.sourceFolder), copied.id != video.id else {
            throw ProcessorError.request("Drive did not confirm the original copy in the correct collection.")
        }
        return copied
    }

    func download(_ video: DriveVideo, into destination: URL) async throws {
        guard Self.validID(video.id), video.size >= 1024 else {
            throw ProcessorError.invalid("Invalid video for download.")
        }
        var parts = URLComponents(string: api + "/files/" + video.id)!
        parts.queryItems = [.init(name: "alt", value: "media"), .init(name: "supportsAllDrives", value: "true")]
        var request = URLRequest(url: parts.url!)
        request.setValue("Bearer " + (try await auth.validAccessToken()), forHTTPHeaderField: "Authorization")
        let (temporary, response) = try await URLSession.shared.download(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw ProcessorError.request("Google Drive download failed. Check permission and quota.")
        }
        let size = (try FileManager.default.attributesOfItem(atPath: temporary.path)[.size] as? NSNumber)?.int64Value ?? 0
        guard size == video.size else {
            throw ProcessorError.request("Downloaded file size differs from Google Drive metadata.")
        }
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.moveItem(at: temporary, to: destination)
    }

    func existingRenditions(sourceID: String, dance: Dance) async throws -> [Rendition] {
        let files = try await listAll(folderID: dance.destinationFolder)
        return files.compactMap { video -> Rendition? in
            let attributes = video.appProperties ?? [:]
            guard attributes["bailacueSourceId"] == sourceID,
                  attributes["bailacuePreset"] == "h264-aac-ladder-v2",
                  let quality = attributes["bailacueQuality"],
                  VideoQuality(rawValue: quality) != nil,
                  video.mimeType == "video/mp4",
                  video.size >= 1024 && video.size <= 2_147_483_648,
                  video.name.range(of: "^[A-Za-z0-9_.()-]{1,190}\\.mp4$", options: .regularExpression) != nil else { return nil }
            return Rendition(quality: quality, driveId: video.id,
                             folderId: dance.destinationFolder, filename: video.name, size: video.size)
        }
    }

    func uploadOptimized(_ local: URL, source: DriveVideo, dance: Dance,
                         quality: VideoQuality, name: String) async throws -> Rendition {
        guard source.parents.contains(dance.sourceFolder), Self.validID(source.id) else {
            throw ProcessorError.invalid("Original must first belong to the fixed Salsa or Bachata collection.")
        }
        guard name.range(of: "^[A-Za-z0-9_.()-]{1,190}\\.mp4$", options: .regularExpression) != nil else {
            throw ProcessorError.invalid("Invalid optimized video name.")
        }
        let size = (try FileManager.default.attributesOfItem(atPath: local.path)[.size] as? NSNumber)?.int64Value ?? 0
        guard size >= 1024 && size <= 2_147_483_648 else {
            throw ProcessorError.invalid("Optimized video is empty or over the 2 GiB manifest limit.")
        }
        let attributes: [String: String] = [
            "bailacueSourceId": source.id,
            "bailacuePreset": "h264-aac-ladder-v2",
            "bailacueQuality": quality.rawValue
        ]
        let metadata: [String: Any] = [
            "name": name, "parents": [dance.destinationFolder], "appProperties": attributes
        ]
        var parts = URLComponents(string: uploadAPI + "/files")!
        parts.queryItems = [.init(name: "uploadType", value: "resumable"),
                            .init(name: "supportsAllDrives", value: "true"),
                            .init(name: "fields", value: "id,name,mimeType,size,parents,appProperties")]
        let (ignored, sessionResponse) = try await request(
            parts.url!, method: "POST", data: JSONSerialization.data(withJSONObject: metadata),
            headers: [
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": "video/mp4",
                "X-Upload-Content-Length": String(size)
            ])
        _ = ignored
        guard let sessionValue = sessionResponse.value(forHTTPHeaderField: "Location"),
              let sessionURL = URL(string: sessionValue), sessionURL.scheme == "https",
              ["www.googleapis.com", "content.googleapis.com"].contains(sessionURL.host ?? "") else {
            throw ProcessorError.request("Google Drive did not return a trusted resumable upload URL.")
        }
        let reader = try FileHandle(forReadingFrom: local)
        defer { try? reader.close() }
        var offset: Int64 = 0
        while offset < size {
            try Task.checkCancellation()
            try reader.seek(toOffset: UInt64(offset))
            let length = Int(min(Int64(chunkSize), size - offset))
            guard let bytes = try reader.read(upToCount: length), bytes.count == length else {
                throw ProcessorError.request("Failed to read local encoding for upload.")
            }
            let end = offset + Int64(length) - 1
            let (data, reply) = try await request(sessionURL, method: "PUT", data: bytes,
                headers: ["Content-Type": "video/mp4", "Content-Range": "bytes \(offset)-\(end)/\(size)"])
            if [200, 201].contains(reply.statusCode) {
                let video = try file(json(data))
                guard video.parents.contains(dance.destinationFolder), video.name == name,
                      video.size == size else {
                    throw ProcessorError.request("Drive returned a mismatched optimized upload.")
                }
                return Rendition(quality: quality.rawValue, driveId: video.id,
                                 folderId: dance.destinationFolder, filename: name, size: size)
            }
            guard reply.statusCode == 308,
                  let range = reply.value(forHTTPHeaderField: "Range"),
                  range.hasPrefix("bytes=0-"),
                  let endIndex = Int64(range.dropFirst("bytes=0-".count)),
                  endIndex + 1 > offset else {
                throw ProcessorError.request("Drive did not confirm the next upload chunk.")
            }
            offset = endIndex + 1
        }
        throw ProcessorError.request("Drive never confirmed completion of the optimized upload.")
    }

    private static func validID(_ input: String) -> Bool {
        (10...100).contains(input.count) &&
        input.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }
    }
}
