import Foundation
import Combine
import UIKit

@MainActor
final class ProcessingStore: ObservableObject {
    @Published var jobs: [VideoJob] = []
    @Published var selectedDance: Dance = .salsa
    @Published var folderLink = ""
    @Published var selectedQualities: Set<VideoQuality> = Set(VideoQuality.allCases)
    @Published var running = false
    @Published var status = "Connect Google Drive, paste a folder link, and import the videos."
    @Published var lastError: String? = nil
    @Published var manifest = OptimizedManifest.empty
    @Published var ownerConnected = false
    @Published var publishAutomatically = true

    let publisher: BailaCuePublisher
    let auth: GoogleAuth
    private let drive: GoogleDriveService
    private var worker: Task<Void, Never>?
    private let location: URL

    var manifestURL: URL { location.appendingPathComponent("bailacue-optimized-manifest.json") }
    var selectedCount: Int { jobs.filter(\.isSelected).count }
    var finishedCount: Int { jobs.filter { $0.status == .complete }.count }
    var queuedCount: Int { jobs.filter { $0.status != .complete && $0.isSelected }.count }

    init() {
        let account = GoogleAuth()
        auth = account
        drive = GoogleDriveService(auth: account)
        publisher = BailaCuePublisher()
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        location = support.appendingPathComponent("BailaCueProcessor", isDirectory: true)
        try? FileManager.default.createDirectory(at: location, withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: location.appendingPathComponent("queue.json")),
           let previous = try? JSONDecoder().decode([VideoJob].self, from: data) {
            jobs = previous.map { job in
                var copy = job
                if copy.status != .complete { copy.status = .queued }
                return copy
            }
        }
        if let data = try? Data(contentsOf: manifestURL),
           let saved = try? JSONDecoder().decode(OptimizedManifest.self, from: data),
           saved.rootFolderId == OptimizedManifest.empty.rootFolderId,
           saved.preset == OptimizedManifest.empty.preset {
            manifest = saved
        }
    }

    func signIn() async {
        do {
            try await auth.signIn()
            status = "Connected to Google Drive. Paste a folder link or resume."
        } catch { lastError = error.localizedDescription }
    }

    func loginOwner(email: String, password: String) async {
        do {
            try await publisher.login(email: email, password: password)
            ownerConnected = publisher.authorized
            status = "BailaCue owner connected. New quality versions will publish automatically."
        } catch { lastError = error.localizedDescription }
    }

    func restoreOwner() async {
        await publisher.restore()
        ownerConnected = publisher.authorized
    }

    func logoutOwner() {
        publisher.logout()
        ownerConnected = false
    }

    func importFolder() async {
        guard !running else { return }
        guard let folderID = DriveLink.folderID(folderLink) else {
            lastError = "Paste a Google Drive folder link (drive.google.com/drive/folders/…). Google Photos links require a separate Picker integration."
            return
        }
        do {
            status = "Reading the Google Drive folder…"
            let files = try await drive.listVideos(folderID: folderID)
            var added = 0
            for item in files {
                let key = "drive:" + item.id
                guard !jobs.contains(where: { $0.id == key }) else { continue }
                jobs.append(VideoJob(id: key, name: item.name, size: item.size, dance: selectedDance))
                added += 1
            }
            saveQueue()
            status = "Found \(files.count) videos; added \(added) new videos. Select Start to process."
        } catch { lastError = error.localizedDescription; status = "Could not read the folder." }
    }

    func addFixedCollections() async {
        guard !running else { return }
        do {
            status = "Loading existing Salsa and Bachata videos…"
            var added = 0
            for dance in Dance.allCases {
                let videos = try await drive.listVideos(folderID: dance.sourceFolder)
                for video in videos {
                    let key = "drive:" + video.id
                    if !jobs.contains(where: { $0.id == key }) {
                        jobs.append(VideoJob(id: key, name: video.name, size: video.size, dance: dance))
                        added += 1
                    }
                }
            }
            saveQueue()
            status = "Added \(added) videos. Existing jobs and completed quality versions were kept."
        } catch { lastError = error.localizedDescription }
    }

    func selectAll(_ enabled: Bool) {
        for index in jobs.indices { jobs[index].isSelected = enabled }
        saveQueue()
    }

    func toggleSelection(_ id: String) {
        guard let index = jobs.firstIndex(where: { $0.id == id }) else { return }
        jobs[index].isSelected.toggle()
        saveQueue()
    }

    func retryFailures() {
        for index in jobs.indices where jobs[index].status == .failed {
            jobs[index].status = .queued
            jobs[index].error = nil
            jobs[index].isSelected = true
        }
        saveQueue()
    }

    func start() {
        guard !running, !selectedQualities.isEmpty else { return }
        running = true
        UIApplication.shared.isIdleTimerDisabled = true
        worker = Task {
            defer {
                UIApplication.shared.isIdleTimerDisabled = false
                running = false
                worker = nil
            }
            await processQueue()
        }
    }

    private func needsProcessing(_ job: VideoJob) -> Bool {
        if job.status == .failed { return true }
        if job.status != .complete { return true }
        let previouslyCovered = Set(job.finished).union(job.unsupported ?? [])
        return selectedQualities.contains { !previouslyCovered.contains($0.rawValue) }
    }

    func stop() {
        worker?.cancel()
        status = "Stopping after the current safe cancellation point…"
    }

    private func processQueue() async {
        do {
            // Publish a complete manifest, including copies created by the desktop
            // converter, rather than replacing it with a partial iPad-only list.
            status = "Checking existing optimized copies in Google Drive…"
            try await reconcileRenditions()
        } catch {
            lastError = "Could not verify existing quality versions: " + error.localizedDescription
            return
        }
        let identifiers = jobs.filter { $0.isSelected && needsProcessing($0) }.map(\.id)
        var failed = 0, done = 0
        for id in identifiers {
            if Task.isCancelled { break }
            guard let index = jobs.firstIndex(where: { $0.id == id }) else { continue }
            do {
                try await process(index)
                done += 1
            } catch is CancellationError {
                jobs[index].status = .queued
                saveQueue()
                break
            } catch {
                failed += 1
                jobs[index].status = .failed
                jobs[index].error = error.localizedDescription
                saveQueue()
            }
        }
        status = "Finished this run: \(done) videos complete, \(failed) need retry. \(manifest.entries.count) originals have quality copies. Use Share manifest to publish in BailaCue."
    }

    private func process(_ index: Int) async throws {
        try Task.checkCancellation()
        let item = jobs[index]
        guard item.id.hasPrefix("drive:") else {
            throw ProcessorError.invalid("This job is not a Google Drive video.")
        }
        jobs[index].error = nil
        jobs[index].status = .downloading
        saveQueue()
        status = "\(index + 1)/\(jobs.count) · Preparing \(item.name)…"

        let source = try await drive.metadata(fileID: String(item.id.dropFirst("drive:".count)))
        guard source.mimeType.hasPrefix("video/"), source.size >= 1024 else {
            throw ProcessorError.invalid("Selected Drive item is not a valid video.")
        }
        let original = try await drive.ensureOriginal(source, dance: item.dance)
        // The owner publisher checks both bundled and previously published
        // IDs before registering anything. Existing video metadata is preserved.
        if ownerConnected && publishAutomatically {
            try await publisher.ensureOriginalRegistered(original, dance: item.dance)
        }
        jobs[index].originalId = original.id
        saveQueue()
        let cached = manifest.entries.first { $0.sourceId == "drive:" + original.id }?.renditions ?? []
        let required = VideoQuality.allCases.filter { selectedQualities.contains($0) }
        let alreadyUnsupported = Set(jobs[index].unsupported ?? [])
        let missing = required.filter { quality in
            !cached.contains(where: { $0.quality == quality.rawValue }) &&
            !alreadyUnsupported.contains(quality.rawValue)
        }
        // Every quality is checked against the *actual* source dimensions below.
        if missing.isEmpty {
            jobs[index].finished = cached.map(\.quality)
            if ownerConnected && publishAutomatically {
                try await publisher.publishManifest(manifest)
            }
            jobs[index].status = .complete
            saveQueue()
            status = "Already optimized: \(item.name)"
            return
        }
        let originalExt = URL(fileURLWithPath: original.name).pathExtension.lowercased()
        let scratch = location.appendingPathComponent("working-" + original.id, isDirectory: true)
        try FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: scratch) }
        let local = scratch.appendingPathComponent("source." + originalExt)
        status = "Downloading \(item.name) to temporary iPad storage…"
        try await drive.download(original, into: local)
        let dimensions = try await VideoEncoder.sourceDimensions(local)
        jobs[index].unsupported = required.filter {
            !$0.supported(width: dimensions.width, height: dimensions.height)
        }.map(\.rawValue)
        saveQueue()
        for quality in required {
            try Task.checkCancellation()
            guard quality.supported(width: dimensions.width, height: dimensions.height) else { continue }
            if manifest.entries.first(where: { $0.sourceId == "drive:" + original.id })?
                .renditions.contains(where: { $0.quality == quality.rawValue }) == true {
                continue
            }
            jobs[index].status = .processing
            status = "Encoding \(quality.rawValue) on iPad: \(item.name)"
            saveQueue()
            let filename = outputName(original, quality)
            let output = scratch.appendingPathComponent(filename)
            try await VideoEncoder.export(source: local, quality: quality, destination: output)
            try Task.checkCancellation()
            jobs[index].status = .uploading
            status = "Uploading \(quality.rawValue) to Google Drive: \(item.name)"
            saveQueue()
            let rendition = try await drive.uploadOptimized(
                output, source: original, dance: item.dance, quality: quality, name: filename
            )
            manifest.set(sourceId: original.id, dance: item.dance, rendition: rendition)
            saveManifest()
            if !jobs[index].finished.contains(quality.rawValue) {
                jobs[index].finished.append(quality.rawValue)
            }
            saveQueue()
            try? FileManager.default.removeItem(at: output)
        }
        if ownerConnected && publishAutomatically {
            status = "Publishing available qualities to BailaCue…"
            try await publisher.publishManifest(manifest)
        }
        jobs[index].finished = manifest.entries
            .first(where: { $0.sourceId == "drive:" + original.id })?
            .renditions.map(\.quality) ?? jobs[index].finished
        jobs[index].status = .complete
        saveQueue()
        status = "Saved optimized copies for \(item.name)."
    }

    private func reconcileRenditions() async throws {
        var discovered = OptimizedManifest.empty
        for dance in Dance.allCases {
            let copies = try await drive.listAll(folderID: dance.destinationFolder)
            for item in copies {
                let props = item.appProperties ?? [:]
                guard let sourceID = props["bailacueSourceId"],
                      let quality = props["bailacueQuality"],
                      VideoQuality(rawValue: quality) != nil,
                      props["bailacuePreset"] == "h264-aac-ladder-v2",
                      item.mimeType == "video/mp4",
                      item.size >= 1024 && item.size <= 2_147_483_648,
                      item.name.range(of: "^[A-Za-z0-9_.()-]{1,190}\\.mp4$", options: .regularExpression) != nil else { continue }
                discovered.set(
                    sourceId: sourceID, dance: dance,
                    rendition: Rendition(quality: quality, driveId: item.id,
                                         folderId: dance.destinationFolder,
                                         filename: item.name, size: item.size)
                )
            }
        }
        manifest = discovered
        saveManifest()
    }

    private func outputName(_ original: DriveVideo, _ quality: VideoQuality) -> String {
        let stem = URL(fileURLWithPath: original.name).deletingPathExtension().lastPathComponent
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.()-")
        let normalized = stem.unicodeScalars.prefix(48).map {
            allowed.contains($0) ? String($0) : "_"
        }.joined().trimmingCharacters(in: CharacterSet(charactersIn: "._-"))
        let safe = normalized.isEmpty ? "video" : normalized
        return safe + "-" + String(original.id.prefix(10)) + "-" + quality.rawValue + ".mp4"
    }

    private func saveQueue() {
        if let bytes = try? JSONEncoder().encode(jobs) {
            try? bytes.write(to: location.appendingPathComponent("queue.json"), options: .atomic)
        }
    }

    private func saveManifest() {
        if let bytes = try? JSONEncoder().encode(manifest) {
            try? bytes.write(to: manifestURL, options: .atomic)
        }
    }
}
