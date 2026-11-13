import SwiftUI

@main
struct BailaCueProcessorApp: App {
    @StateObject private var store = ProcessingStore()
    var body: some Scene {
        WindowGroup {
            ProcessorHome()
                .environmentObject(store)
                .tint(Color(red: 0.32, green: 0.78, blue: 0.72))
        }
    }
}

struct ProcessorHome: View {
    @EnvironmentObject private var studio: ProcessingStore
    @State private var ownerEmail = ""
    @State private var ownerPassword = ""
    private let background = Color(red: 0.055, green: 0.080, blue: 0.11)
    private let surface = Color(red: 0.10, green: 0.15, blue: 0.19)

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    header
                    connectionPanel
                    ownerPanel
                    importPanel
                    queuePanel
                    publishingPanel
                }
                .padding(24)
                .frame(maxWidth: 980)
                .frame(maxWidth: .infinity)
            }
            .background(background.ignoresSafeArea())
            .navigationTitle("BailaCue Processor")
            .toolbarBackground(background, for: .navigationBar)
            .preferredColorScheme(.dark)
            .task { await studio.restoreOwner() }
            .alert("BailaCue Processor", isPresented: Binding(
                get: { studio.lastError != nil },
                set: { if !$0 { studio.lastError = nil } }
            )) {
                Button("OK") { studio.lastError = nil }
            } message: {
                Text(studio.lastError ?? "")
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("BAILACUE / VIDEO STUDIO", systemImage: "play.rectangle.on.rectangle")
                .font(.caption.weight(.bold)).tracking(2).foregroundStyle(.mint)
            Text("One folder. Every video.")
                .font(.system(size: 39, weight: .bold, design: .rounded))
            Text("Your device does the conversion. Originals remain untouched. Optimized copies are saved in the existing Google Drive dance collections.")
                .foregroundStyle(.secondary)
            HStack(spacing: 14) {
                metric("\(studio.jobs.count)", "Videos queued")
                metric("\(studio.finishedCount)", "Completed")
                metric("\(studio.manifest.entries.count)", "With quality copies")
            }.padding(.top, 6)
        }
    }

    private func metric(_ value: String, _ caption: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value).font(.title2.bold()).monospacedDigit()
            Text(caption).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(surface, in: RoundedRectangle(cornerRadius: 14))
    }

    private var connectionPanel: some View {
        panel {
            HStack(spacing: 12) {
                Image(systemName: "lock.shield.fill")
                    .foregroundStyle(.mint).font(.title2)
                VStack(alignment: .leading) {
                    Text("Google Drive connection").font(.headline)
                    Text(studio.auth.signedIn ? "Connected using on-device Keychain credentials" : "Sign in to access your video folders")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 12)
                if studio.auth.signedIn {
                    Button("Disconnect", role: .destructive) { studio.auth.disconnect() }
                        .buttonStyle(.bordered)
                } else {
                    Button("Connect Google") { Task { await studio.signIn() } }
                        .buttonStyle(.borderedProminent)
                        .disabled(studio.running)
                }
            }
            if GoogleSetup.clientID.isEmpty {
                Label("Google OAuth configuration is required before Drive import or upload. See the project SETUP.md.", systemImage: "exclamationmark.triangle")
                    .font(.callout).foregroundStyle(.orange)
            }
        }
    }

    private var ownerPanel: some View {
        panel {
            VStack(alignment: .leading, spacing: 12) {
                Label("BailaCue owner publishing", systemImage: "checkmark.shield.fill")
                    .font(.headline)
                Text("Sign in once with your existing BailaCue administrator account to publish optimized copies automatically. The password is not saved; only a refresh token is kept in the iPad Keychain.")
                    .font(.subheadline).foregroundStyle(.secondary)
                if studio.ownerConnected {
                    Label("Authorized BailaCue owner", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Button("Disconnect BailaCue owner") { studio.logoutOwner() }
                        .buttonStyle(.bordered)
                } else {
                    TextField("BailaCue owner email", text: $ownerEmail)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                        .textFieldStyle(.roundedBorder)
                    SecureField("BailaCue owner password", text: $ownerPassword)
                        .textContentType(.password)
                        .textFieldStyle(.roundedBorder)
                    Button {
                        let email = ownerEmail
                        let password = ownerPassword
                        ownerPassword = ""
                        Task { await studio.loginOwner(email: email, password: password) }
                    } label: { Label("Authorize automatic publishing", systemImage: "person.crop.circle.badge.checkmark") }
                        .buttonStyle(.bordered)
                        .disabled(studio.running)
                }
                Toggle("Publish completed videos and quality choices automatically", isOn: $studio.publishAutomatically)
                    .disabled(!studio.ownerConnected)
                Text("Uploads and automatic publishing use existing BailaCue RLS authorization. New copies are stored in Drive, not on a paid video host.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var importPanel: some View {
        panel {
            VStack(alignment: .leading, spacing: 14) {
                Label("01  Import source videos", systemImage: "link").font(.headline)
                Text("Paste one Google Drive folder link, including a parent folder containing Salsa/Bachata subfolders. Select all or a subset; the app remembers progress.")
                    .font(.subheadline).foregroundStyle(.secondary)
                TextField("https://drive.google.com/drive/folders/...", text: $studio.folderLink)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel("Google Drive video folder link")
                Picker("Destination collection", selection: $studio.selectedDance) {
                    ForEach(Dance.allCases) { dance in Text(dance.rawValue).tag(dance) }
                }.pickerStyle(.segmented)
                HStack {
                    Button {
                        Task { await studio.importFolder() }
                    } label: { Label("Import linked folder", systemImage: "folder.badge.plus") }
                        .buttonStyle(.borderedProminent)
                        .disabled(studio.running || !studio.auth.signedIn)
                    Button {
                        Task { await studio.addFixedCollections() }
                    } label: { Label("Load existing Salsa & Bachata videos", systemImage: "arrow.clockwise") }
                        .buttonStyle(.bordered)
                        .disabled(studio.running || !studio.auth.signedIn)
                }
                Text("Google Photos share links require the Google Photos Picker integration; they cannot be bulk-imported as Drive folders.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var queuePanel: some View {
        panel {
            VStack(alignment: .leading, spacing: 14) {
                Label("02  Choose output qualities", systemImage: "slider.horizontal.3").font(.headline)
                ForEach(VideoFormat.allCases) { format in
                    Toggle(format.title, isOn: Binding(
                        get: { studio.selectedFormats.contains(format) },
                        set: { enabled in
                            if enabled { studio.selectedFormats.insert(format) }
                            else { studio.selectedFormats.remove(format) }
                        }
                    ))
                }
                .disabled(studio.running)
                VStack(spacing: 8) {
                    ForEach(VideoQuality.allCases) { quality in
                        Toggle(quality.rawValue, isOn: Binding(
                            get: { studio.selectedQualities.contains(quality) },
                            set: { enabled in
                                if enabled { studio.selectedQualities.insert(quality) }
                                else { studio.selectedQualities.remove(quality) }
                            }
                        )).toggleStyle(.switch)
                    }
                }
                .disabled(studio.running)
                Text("MP4 and MOV use H.264 video and AAC audio. Only MP4 is listed in the BailaCue player. Resolution options depend on the source size.")
                    .font(.caption).foregroundStyle(.secondary)
                Divider()
                HStack(spacing: 10) {
                    Button("Select all") { studio.selectAll(true) }.disabled(studio.running)
                    Button("Deselect all") { studio.selectAll(false) }.disabled(studio.running)
                    Button("Retry failed") { studio.retryFailures() }.disabled(studio.running)
                    Spacer()
                    Text("\(studio.selectedCount) selected").font(.caption).foregroundStyle(.secondary)
                }.buttonStyle(.bordered)
                if studio.jobs.isEmpty {
                    ContentUnavailableView("No videos imported", systemImage: "film.stack",
                                           description: Text("Connect Google Drive and load a folder to begin."))
                        .frame(minHeight: 140)
                } else {
                    LazyVStack(spacing: 1) {
                        ForEach(studio.jobs) { job in
                            let coveredQualities = Set(job.finished).union(job.unsupported ?? [])
                            let missingQualities = VideoQuality.allCases.filter { !coveredQualities.contains($0.rawValue) }
                            HStack(spacing: 12) {
                                Button { studio.toggleSelection(job.id) } label: {
                                    Image(systemName: job.isSelected ? "checkmark.circle.fill" : "circle")
                                        .font(.title3)
                                }.buttonStyle(.plain).disabled(studio.running)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(job.name).lineLimit(1).font(.subheadline.weight(.medium))
                                    Text("\(job.dance.rawValue) · \(formatBytes(job.size)) · \(job.status.rawValue.capitalized)")
                                        .font(.caption).foregroundStyle(.secondary)
                                    if !job.finished.isEmpty {
                                        Text("Available: " + job.finished.map { $0.replacingOccurrences(of: "p", with: "") }.joined(separator: ", ") + "p")
                                            .font(.caption2).foregroundStyle(.green)
                                    }
                                    if !missingQualities.isEmpty {
                                        Text("Missing: " + missingQualities.map { $0.rawValue }.joined(separator: ", ") + " · convertible")
                                            .font(.caption2).foregroundStyle(.secondary)
                                        Button("Convert missing") { studio.convertMissing(job.id) }
                                            .font(.caption).buttonStyle(.bordered).disabled(studio.running)
                                    }
                                    if let error = job.error {
                                        Text(error).font(.caption).foregroundStyle(.orange).lineLimit(2)
                                    }
                                }
                                Spacer(minLength: 8)
                                if job.status == .complete {
                                    Image(systemName: "checkmark.seal.fill").foregroundStyle(.green)
                                } else if job.status == .processing || job.status == .downloading || job.status == .uploading {
                                    ProgressView().tint(.mint)
                                } else if job.status == .skipped {
                                    Image(systemName: "minus.circle.fill").foregroundStyle(.yellow)
                                } else if job.status == .failed {
                                    Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.orange)
                                }
                            }
                            .padding(.vertical, 10)
                            Divider()
                        }
                    }
                    .frame(maxHeight: 500)
                }
                HStack {
                    if studio.running {
                        Button(role: .cancel) { studio.stop() } label: {
                            Label("Stop safely", systemImage: "stop.circle")
                        }.buttonStyle(.borderedProminent)
                    } else {
                        Button { studio.start() } label: {
                            Label("Start / Resume conversion", systemImage: "play.fill")
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(studio.selectedCount == 0 || studio.selectedQualities.isEmpty || studio.selectedFormats.isEmpty || !studio.auth.signedIn)
                    }
                    Spacer()
                }
                Text(studio.status)
                    .font(.subheadline).foregroundStyle(.mint)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
    }

    private var publishingPanel: some View {
        panel {
            VStack(alignment: .leading, spacing: 10) {
                Label("03  Publish in BailaCue", systemImage: "square.and.arrow.up").font(.headline)
                Text("Each completed quality is uploaded directly to the correct Google Drive optimized folder. Export the full manifest to link those copies to BailaCue's public player.")
                    .font(.subheadline).foregroundStyle(.secondary)
                HStack {
                    if FileManager.default.fileExists(atPath: studio.manifestURL.path) {
                        ShareLink(item: studio.manifestURL) {
                            Label("Share optimized manifest", systemImage: "square.and.arrow.up")
                        }.buttonStyle(.borderedProminent)
                    }
                    Link("Open BailaCue Develop", destination: URL(string: "https://develop--bailacue.netlify.app/#upload")!)
                        .buttonStyle(.bordered)
                }
                Text(studio.ownerConnected && studio.publishAutomatically
                     ? "BailaCue owner publishing is enabled. The manifest is updated automatically after each video."
                     : "Without BailaCue owner authorization, share the manifest and import it manually as administrator.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func panel<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(surface, in: RoundedRectangle(cornerRadius: 18))
    }

    private func formatBytes(_ bytes: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }
}
