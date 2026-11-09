import Foundation

@main
enum ModelsSmoke {
    static func main() {
        func check(_ condition: @autoclosure () -> Bool, _ message: String) {
            precondition(condition(), "Failed: " + message)
        }

        let id = "1lVR5Pc-6SupJOfLIhcRE-oo69FUDM5Sm"
        check(DriveLink.folderID("https://drive.google.com/drive/folders/" + id) == id, "Drive folder URL")
        check(DriveLink.folderID("https://www.drive.google.com/drive/folders/" + id + "?usp=sharing") == id, "URL with sharing query")
        check(DriveLink.folderID("https://photos.google.com/share/album") == nil, "Photos links are not Drive folders")
        check(DriveLink.folderID("http://drive.google.com/drive/folders/" + id) == nil, "HTTP rejected")
        check(DriveLink.folderID("https://evil.example.com/drive/folders/" + id) == nil, "Non-Google host rejected")
        check(DriveLink.folderID("https://drive.google.com/drive/folders/..") == nil, "Malformed IDs rejected")

        check(VideoQuality.p360.supported(width: 640, height: 360), "360 landscape")
        check(VideoQuality.p360.supported(width: 360, height: 640), "360 portrait")
        check(!VideoQuality.p720.supported(width: 1920, height: 600), "Ultrawide is not 720p")
        check(VideoQuality.p720.supported(width: 960, height: 720), "4:3 720p")
        check(!VideoQuality.p1080.supported(width: 1280, height: 720), "720p source is not 1080p")
        check(VideoQuality.p1080.supported(width: 1080, height: 1920), "1080 portrait")

        var manifest = OptimizedManifest.empty
        check(manifest.entries.isEmpty, "New manifest empty")
        let source = "1AbcDEfG-hiJKlmNoPQR"
        let p360 = Rendition(quality: "360p", driveId: "1MP4file360p_ABCD", folderId: Dance.salsa.destinationFolder,
                             filename: "0001-360p.mp4", size: 1500)
        let p720 = Rendition(quality: "720p", driveId: "1MP4file720p_ABCD", folderId: Dance.salsa.destinationFolder,
                             filename: "0001-720p.mp4", size: 2600)
        manifest.set(sourceId: source, dance: .salsa, rendition: p720)
        manifest.set(sourceId: source, dance: .salsa, rendition: p360)
        manifest.set(sourceId: source, dance: .salsa, rendition: p720)
        check(manifest.entries.count == 1, "Duplicate originals prevented")
        check(manifest.entries.first?.renditions.map(\.quality) == ["360p", "720p"], "Sorted quality variants and duplicate quality removed")
        check(manifest.entries.first?.sourceId == "drive:" + source, "Canonical source IDs")
        let coder = JSONEncoder()
        let json = try! coder.encode(manifest)
        let object = try! JSONSerialization.jsonObject(with: json) as! [String: Any]
        check(object["version"] as? Int == 2, "Manifest version")
        check(object["preset"] as? String == "h264-aac-ladder-v2", "Manifest preset")
        let decoded = try! JSONDecoder().decode(OptimizedManifest.self, from: json)
        check(decoded.entries.first?.renditions.count == 2, "Round-trip manifest")

        let job = VideoJob(id: "drive:" + source, name: "sample.mp4", size: 1000, dance: .salsa)
        let restored = try! JSONDecoder().decode(VideoJob.self, from: JSONEncoder().encode(job))
        check(restored.id == job.id && restored.unsupported == nil, "Queue serialization")
        print("BailaCue iPad model smoke tests passed")
    }
}
