import Foundation

enum Dance: String, Codable, CaseIterable, Identifiable {
    case salsa = "Salsa"
    case bachata = "Bachata"
    var id: String { rawValue }
    var sourceFolder: String { self == .salsa ? "1lVR5Pc-6SupJOfLIhcRE-oo69FUDM5Sm" : "17CFKIazhQJTGXvlHP5sa1mqlvu9p-2i1" }
    var destinationFolder: String { self == .salsa ? "1Z8yfu20bLFKChQGXYQQ8uZZoEDMTSx1f" : "1rOwr5utjZ-gfCj5Zj6KlOjmqdFRu8ncq" }
}

enum VideoQuality: String, Codable, CaseIterable, Identifiable {
    case p360 = "360p"
    case p720 = "720p"
    case p1080 = "1080p"
    var id: String { rawValue }
    var landscapeWidth: Int { switch self { case .p360: return 640; case .p720: return 1280; case .p1080: return 1920 } }
    var landscapeHeight: Int { switch self { case .p360: return 360; case .p720: return 720; case .p1080: return 1080 } }
    func supported(width: Int, height: Int) -> Bool {
        // Resolution labels refer to the short axis (for landscape and portrait).
        // Never label a 600px-tall ultrawide original as 720p, for example.
        return min(width, height) >= landscapeHeight
    }
}

enum VideoFormat: String, CaseIterable, Identifiable {
    case mp4, mov
    var id: String { rawValue }
    var title: String { rawValue.uppercased() }
    var mimeType: String { self == .mp4 ? "video/mp4" : "video/quicktime" }
}

enum JobStatus: String, Codable {
    case queued, downloading, processing, uploading, complete, skipped, failed
}

struct DriveVideo: Codable, Identifiable {
    let id: String
    let name: String
    let mimeType: String
    let size: Int64
    let parents: [String]
    let appProperties: [String: String]?
}

struct Rendition: Codable {
    let quality: String
    let driveId: String
    let folderId: String
    let filename: String
    let size: Int64
}

struct ManifestEntry: Codable {
    let sourceId: String
    let dance: String
    var renditions: [Rendition]
}

struct OptimizedManifest: Codable {
    let version: Int
    let rootFolderId: String
    let preset: String
    var entries: [ManifestEntry]
    static var empty: Self {
        .init(version: 2,
              rootFolderId: "1CErkH8BmExpKGZXHSl1hnDbs6fgr08PQ",
              preset: "h264-aac-ladder-v2", entries: [])
    }
    mutating func set(sourceId: String, dance: Dance, rendition: Rendition) {
        let key = "drive:" + sourceId
        if let index = entries.firstIndex(where: { $0.sourceId == key }) {
            entries[index].renditions.removeAll { $0.quality == rendition.quality }
            entries[index].renditions.append(rendition)
            entries[index].renditions.sort { Self.qualityRank($0.quality) < Self.qualityRank($1.quality) }
        } else {
            entries.append(.init(sourceId: key, dance: dance.rawValue, renditions: [rendition]))
        }
        entries.sort { $0.sourceId < $1.sourceId }
    }
    private static func qualityRank(_ name: String) -> Int {
        VideoQuality.allCases.firstIndex { $0.rawValue == name } ?? 999
    }
}

struct VideoJob: Codable, Identifiable {
    var id: String
    var name: String
    var size: Int64
    var dance: Dance
    var status: JobStatus = .queued
    var originalId: String? = nil
    var finished: [String] = []
    // Optional so queues saved by earlier builds can still be decoded.
    var unsupported: [String]? = nil
    var error: String? = nil
    var localFileName: String? = nil
    var isSelected: Bool = true
}

enum DriveLink {
    static func folderID(_ raw: String) -> String? {
        guard let url = URL(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              url.scheme == "https",
              ["drive.google.com", "www.drive.google.com"].contains(url.host ?? "") else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        if parts.count >= 3, parts[0] == "drive", parts[1] == "folders" {
            return validate(parts[2])
        }
        if parts.count >= 2, parts[0] == "folders" {
            return validate(parts[1])
        }
        let id = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "id" }?.value
        return validate(id)
    }
    private static func validate(_ value: String?) -> String? {
        guard let value, (10...100).contains(value.count),
              value.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }) else { return nil }
        return value
    }
}

enum ProcessorError: LocalizedError {
    case setup(String)
    case invalid(String)
    case request(String)
    var errorDescription: String? {
        switch self {
        case .setup(let s), .invalid(let s), .request(let s): return s
        }
    }
}
