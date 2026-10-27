import ExpoModulesCore
import AVFoundation
import UIKit

public class BailaMediaModule: Module {
  private var currentExport: AVAssetExportSession?

  public func definition() -> ModuleDefinition {
    Name("BailaMedia")

    AsyncFunction("getInfoAsync") { (uri: String) async throws -> [String: Any] in
      let url = try self.ownedURL(uri)
      let asset = AVURLAsset(url: url)
      let duration = try await asset.load(.duration).seconds
      guard duration.isFinite && duration > 0 else { throw MediaError.invalidVideo }
      let tracks = try await asset.loadTracks(withMediaType: .video)
      guard let track = tracks.first else { throw MediaError.invalidVideo }
      let size = try await track.load(.naturalSize)
      var result: [String: Any] = ["duration": duration, "width": size.width, "height": size.height]
      let generator = AVAssetImageGenerator(asset: asset)
      generator.appliesPreferredTrackTransform = true
      generator.maximumSize = CGSize(width: 480, height: 480)
      if let image = try? generator.copyCGImage(at: .zero, actualTime: nil), let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.75) {
        let folder = try self.folder("bailacue-thumbnails")
        let output = folder.appendingPathComponent("\(UUID().uuidString).jpg")
        try data.write(to: output, options: .atomic)
        result["thumbnail"] = output.absoluteString
      }
      return result
    }

    AsyncFunction("trimAsync") { (uri: String, start: Double, end: Double) async throws -> [String: Any] in
      guard self.currentExport == nil else { throw MediaError.busy }
      guard start.isFinite, end.isFinite, start >= 0, end - start >= 0.25 else { throw MediaError.invalidRange }
      let asset = AVURLAsset(url: try self.ownedURL(uri))
      let duration = try await asset.load(.duration).seconds
      guard end <= duration + 0.001 else { throw MediaError.invalidRange }
      let folder = try self.folder("bailacue-exports")
      let output = folder.appendingPathComponent("BailaCue-\(UUID().uuidString).mp4")
      guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality), session.supportedFileTypes.contains(.mp4) else { throw MediaError.unsupported }
      self.currentExport = session
      defer { self.currentExport = nil }
      session.outputURL = output
      session.outputFileType = .mp4
      session.shouldOptimizeForNetworkUse = true
      session.timeRange = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600), end: CMTime(seconds: end, preferredTimescale: 600))
      await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in session.exportAsynchronously { continuation.resume() } }
      guard session.status == .completed else {
        try? FileManager.default.removeItem(at: output)
        throw session.error ?? MediaError.exportFailed
      }
      return ["uri": output.absoluteString, "duration": end - start]
    }

    Function("cancelExport") { self.currentExport?.cancelExport() }
    OnDestroy { self.currentExport?.cancelExport() }
  }

  private func folder(_ name: String) throws -> URL {
    let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let folder = root.appendingPathComponent(name, isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    var mutable = folder; try mutable.setResourceValues(values)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: folder.path)
    return folder
  }

  private func ownedURL(_ uri: String) throws -> URL {
    guard let url = URL(string: uri), url.isFileURL else { throw MediaError.invalidVideo }
    let path = url.resolvingSymlinksInPath().path
    let roots = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask) + FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)
    guard roots.contains(where: { path.hasPrefix($0.resolvingSymlinksInPath().path + "/") }), FileManager.default.fileExists(atPath: path) else { throw MediaError.invalidVideo }
    var parent = url.deletingLastPathComponent()
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    try parent.setResourceValues(values)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: path)
    return url
  }
}

private enum MediaError: LocalizedError {
  case invalidVideo, invalidRange, unsupported, exportFailed, busy
  var errorDescription: String? {
    switch self {
    case .invalidVideo: return "This video is unavailable or unreadable. Import an H.264 MP4 and try again."
    case .invalidRange: return "Choose a section of at least 0.25 seconds within the video."
    case .unsupported: return "This format cannot be exported as MP4 on this device."
    case .exportFailed: return "Export failed or was cancelled. The original is unchanged."
    case .busy: return "Another clip is being exported. Wait for it to finish."
    }
  }
}
