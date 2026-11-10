// swift-tools-version: 5.9
import PackageDescription
import AppleProductTypes

let package = Package(
    name: "BailaCue Processor",
    platforms: [.iOS("17.0")],
    products: [
        .iOSApplication(
            name: "BailaCue Processor",
            targets: ["AppModule"],
            bundleIdentifier: "app.bailacue.processor",
            displayVersion: "0.2.1",
            bundleVersion: "3",
            appIcon: .placeholder(icon: .camera),
            accentColor: .presetColor(.blue),
            supportedDeviceFamilies: [.phone, .pad],
            supportedInterfaceOrientations: [.landscapeRight, .landscapeLeft, .portrait, .portraitUpsideDown(.when(deviceFamilies: [.pad]))],
            additionalInfoPlistContentFilePath: "AppInfo.plist"
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: ".",
            exclude: ["Package.swift", "AppInfo.plist"],
            sources: [
                "BailaCuePublisher.swift",
                "ContentView.swift",
                "GoogleAuth.swift",
                "GoogleDriveService.swift",
                "Models.swift",
                "ProcessingStore.swift",
                "VideoEncoder.swift"
            ]
        )
    ]
)
