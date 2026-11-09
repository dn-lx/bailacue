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
            displayVersion: "0.1.0",
            bundleVersion: "1",
            appIcon: .placeholder(icon: .camera),
            accentColor: .presetColor(.blue),
            additionalInfoPlistContentFilePath: "AppInfo.plist",
            supportedDeviceFamilies: [.pad],
            supportedInterfaceOrientations: [.landscapeRight, .landscapeLeft, .portrait, .portraitUpsideDown(.when(deviceFamilies: [.pad]))]
        )
    ],
    targets: [
        .executableTarget(name: "AppModule", path: ".", exclude: ["Package.swift"])
    ]
)
