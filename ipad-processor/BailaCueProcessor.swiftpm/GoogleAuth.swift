import Foundation
import AuthenticationServices
import CryptoKit
import Security
import UIKit
import Combine

/// The iOS OAuth client must be registered for bundle ID app.bailacue.processor.
/// Its reversed client ID must also be present in the signed app's URL schemes.
/// This is intentionally never a web-app client secret or a Supabase service key.
enum GoogleSetup {
    static let clientID = "561540535573-g5oebqho7c14lec0iotvn5frsud0j8v6.apps.googleusercontent.com"
    static let scopes = "https://www.googleapis.com/auth/drive"
    static var callbackScheme: String {
        guard let prefix = clientID.components(separatedBy: ".apps.googleusercontent.com").first, !prefix.isEmpty
        else { return "" }
        return "com.googleusercontent.apps." + prefix
    }
    static var redirectURI: String { callbackScheme + ":/oauth2redirect" }
}

@MainActor
final class GoogleAuth: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published private(set) var signedIn = false
    private var accessTokenValue = ""
    private var tokenExpires = Date.distantPast
    private var session: ASWebAuthenticationSession?

    override init() {
        super.init()
        signedIn = KeychainStore.read("google-refresh-token") != nil
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first(where: { $0.isKeyWindow }) ?? UIWindow()
    }

    func signIn() async throws {
        guard !GoogleSetup.clientID.isEmpty,
              GoogleSetup.clientID.hasSuffix(".apps.googleusercontent.com") else {
            throw ProcessorError.setup("Google sign-in needs the iOS OAuth client ID and its registered callback URL scheme. See SETUP.md.")
        }
        let verifier = Self.randomString()
        let challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        let state = Self.randomString()
        var parts = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        parts.queryItems = [
            .init(name: "client_id", value: GoogleSetup.clientID),
            .init(name: "response_type", value: "code"),
            .init(name: "redirect_uri", value: GoogleSetup.redirectURI),
            .init(name: "scope", value: GoogleSetup.scopes),
            .init(name: "code_challenge", value: challenge),
            .init(name: "code_challenge_method", value: "S256"),
            .init(name: "state", value: state),
            .init(name: "access_type", value: "offline"),
            .init(name: "prompt", value: "consent")
        ]
        guard let url = parts.url else { throw ProcessorError.invalid("Invalid Google authentication URL.") }
        let callback = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
            let login = ASWebAuthenticationSession(url: url, callbackURLScheme: GoogleSetup.callbackScheme) { url, error in
                if let error { continuation.resume(throwing: error) }
                else if let url { continuation.resume(returning: url) }
                else { continuation.resume(throwing: ProcessorError.request("Google sign-in was cancelled.")) }
            }
            login.presentationContextProvider = self
            login.prefersEphemeralWebBrowserSession = false
            self.session = login
            if !login.start() {
                self.session = nil
                continuation.resume(throwing: ProcessorError.request("Could not start Google sign-in. Check the OAuth URL scheme."))
            }
        }
        session = nil
        let callbackItems = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let returnedState = callbackItems.first { $0.name == "state" }?.value
        guard returnedState == state else { throw ProcessorError.request("Google sign-in state did not match.") }
        guard let code = callbackItems.first(where: { $0.name == "code" })?.value else {
            throw ProcessorError.request("Google did not return an authorization code.")
        }
        let result = try await requestToken([
            "client_id": GoogleSetup.clientID, "code": code,
            "code_verifier": verifier, "redirect_uri": GoogleSetup.redirectURI,
            "grant_type": "authorization_code"
        ])
        if let refresh = result["refresh_token"] as? String, !refresh.isEmpty {
            KeychainStore.write(refresh, for: "google-refresh-token")
        }
        signedIn = KeychainStore.read("google-refresh-token") != nil
    }

    func validAccessToken() async throws -> String {
        if tokenExpires > Date().addingTimeInterval(90), !accessTokenValue.isEmpty {
            return accessTokenValue
        }
        guard !GoogleSetup.clientID.isEmpty,
              let refresh = KeychainStore.read("google-refresh-token") else {
            throw ProcessorError.setup("Connect Google Drive in the app first.")
        }
        _ = try await requestToken([
            "client_id": GoogleSetup.clientID,
            "refresh_token": refresh,
            "grant_type": "refresh_token"
        ])
        return accessTokenValue
    }

    func disconnect() {
        accessTokenValue = ""
        tokenExpires = .distantPast
        signedIn = false
        KeychainStore.delete("google-refresh-token")
    }

    private func requestToken(_ fields: [String: String]) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var parameters = URLComponents()
        parameters.queryItems = fields.map { URLQueryItem(name: $0.key, value: $0.value) }
        request.httpBody = parameters.percentEncodedQuery?.data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: request)
        let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              let token = payload["access_token"] as? String, !token.isEmpty else {
            let reason = (payload["error_description"] as? String) ?? (payload["error"] as? String) ?? "Token request failed"
            throw ProcessorError.request("Google authentication: " + reason)
        }
        accessTokenValue = token
        tokenExpires = Date().addingTimeInterval((payload["expires_in"] as? Double) ?? 3300)
        return payload
    }

    private static func randomString() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else { return UUID().uuidString + UUID().uuidString }
        return base64URL(Data(bytes))
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

enum KeychainStore {
    private static let service = "app.bailacue.processor"
    static func read(_ account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: account,
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var value: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &value) == errSecSuccess,
              let data = value as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func write(_ value: String, for account: String) {
        delete(account)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: Data(value.utf8)
        ]
        _ = SecItemAdd(query as CFDictionary, nil)
    }
    static func delete(_ account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: account
        ]
        _ = SecItemDelete(query as CFDictionary)
    }
}
