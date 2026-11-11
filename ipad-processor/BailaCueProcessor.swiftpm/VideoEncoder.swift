import Foundation
import AVFoundation
import CoreMedia
import AudioToolbox

/// Hardware-backed AVFoundation exports. Conversion happens on the iPad.
/// Each rendition is checked before it is eligible for Drive publishing.
enum VideoEncoder {
    static func sourceDimensions(_ source: URL) async throws -> (width: Int, height: Int) {
        let asset = AVURLAsset(url: source)
        guard let track = try await asset.loadTracks(withMediaType: .video).first else {
            throw ProcessorError.invalid("The source contains no video track.")
        }
        let natural = try await track.load(.naturalSize)
        let preferred = try await track.load(.preferredTransform)
        let box = CGRect(origin: .zero, size: natural).applying(preferred)
        guard abs(box.width) >= 2, abs(box.height) >= 2 else {
            throw ProcessorError.invalid("Video dimensions are invalid.")
        }
        return (Int(abs(box.width)), Int(abs(box.height)))
    }

    static func export(source: URL, quality: VideoQuality, format: VideoFormat, destination: URL) async throws {
        let asset = AVURLAsset(url: source)
        guard let track = try await asset.loadTracks(withMediaType: .video).first else {
            throw ProcessorError.invalid("This file contains no playable video track.")
        }
        let natural = try await track.load(.naturalSize)
        let preferred = try await track.load(.preferredTransform)
        let rect = CGRect(origin: .zero, size: natural).applying(preferred)
        let sourceWidth = abs(rect.width), sourceHeight = abs(rect.height)
        guard sourceWidth > 0, sourceHeight > 0,
              quality.supported(width: Int(sourceWidth), height: Int(sourceHeight)) else {
            throw ProcessorError.invalid("This source is too small for \(quality.rawValue). Upscaling is disabled.")
        }
        let portrait = sourceHeight > sourceWidth
        let maximumWidth = CGFloat(portrait ? quality.landscapeHeight : quality.landscapeWidth)
        let maximumHeight = CGFloat(portrait ? quality.landscapeWidth : quality.landscapeHeight)
        let scale = min(1.0, minimumPositive(maximumWidth / sourceWidth, maximumHeight / sourceHeight))
        let outWidth = even(sourceWidth * scale)
        let outHeight = even(sourceHeight * scale)
        let duration = try await asset.load(.duration)
        guard CMTimeCompare(duration, .zero) > 0 else {
            throw ProcessorError.invalid("This video has no valid duration.")
        }
        let videoComposition = AVMutableVideoComposition()
        videoComposition.renderSize = CGSize(width: outWidth, height: outHeight)
        let frameRate = try await track.load(.nominalFrameRate)
        let fps = max(1, min(30, Int(frameRate.rounded())))
        videoComposition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps))
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: duration)
        let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
        let normalize = preferred.concatenating(
            CGAffineTransform(translationX: -rect.minX, y: -rect.minY)
        )
        let transform = normalize.concatenating(CGAffineTransform(scaleX: scale, y: scale))
        layer.setTransform(transform, at: .zero)
        instruction.layerInstructions = [layer]
        videoComposition.instructions = [instruction]

        guard let session = AVAssetExportSession(asset: asset,
                                                 presetName: AVAssetExportPresetHighestQuality) else {
            throw ProcessorError.request("This device cannot export the source video.")
        }
        session.videoComposition = videoComposition
        session.shouldOptimizeForNetworkUse = true
        try? FileManager.default.removeItem(at: destination)
        try Task.checkCancellation()
        let fileType: AVFileType = format == .mp4 ? .mp4 : .mov
        guard session.supportedFileTypes.contains(fileType) else {
            throw ProcessorError.request("This video cannot be exported as \(format.title) on this device.")
        }
        session.outputURL = destination
        session.outputFileType = fileType
        try await withTaskCancellationHandler {
            try Task.checkCancellation()
            await withCheckedContinuation { continuation in
                session.exportAsynchronously { continuation.resume() }
            }
        } onCancel: {
            session.cancelExport()
        }
        try Task.checkCancellation()
        guard session.status == .completed else {
            throw session.error ?? ProcessorError.request("The video export failed.")
        }

        let output = AVURLAsset(url: destination)
        guard let encoded = try await output.loadTracks(withMediaType: .video).first else {
            throw ProcessorError.request("The optimized output has no video track.")
        }
        let dimensions = try await encoded.load(.naturalSize)
        guard dimensions.width > 0, dimensions.height > 0,
              dimensions.width <= CGFloat(outWidth + 2),
              dimensions.height <= CGFloat(outHeight + 2) else {
            throw ProcessorError.request("The encoded dimensions failed validation.")
        }
        let formatDescriptions = try await encoded.load(.formatDescriptions)
        guard let descriptor = formatDescriptions.first,
              CMFormatDescriptionGetMediaSubType(descriptor) == kCMVideoCodecType_H264 else {
            throw ProcessorError.request("Output is not H.264; it will not be published.")
        }
        let audioTracks = try await output.loadTracks(withMediaType: .audio)
        for audio in audioTracks {
            let formats = try await audio.load(.formatDescriptions)
            guard formats.allSatisfy({ CMFormatDescriptionGetMediaSubType($0) == kAudioFormatMPEG4AAC }) else {
                throw ProcessorError.request("Output audio is not AAC; it will not be published.")
            }
        }
        let size = (try FileManager.default.attributesOfItem(atPath: destination.path)[.size] as? NSNumber)?.int64Value ?? 0
        guard size >= 1024, size <= 2_147_483_648 else {
            throw ProcessorError.request("Output is empty or exceeds the BailaCue 2 GiB limit.")
        }
    }

    private static func minimumPositive(_ x: CGFloat, _ y: CGFloat) -> CGFloat {
        min(x, y)
    }
    private static func even(_ number: CGFloat) -> Int {
        max(2, Int(floor(number / 2)) * 2)
    }
}
