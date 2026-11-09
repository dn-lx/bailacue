import Foundation
import Combine

/// Publishes only through BailaCue's existing Supabase RLS-authorized owner account.
/// This uses public config from the develop site. No service-role key is embedded.
@MainActor
final class BailaCuePublisher: ObservableObject {
    @Published private(set) var authorized = false
    private struct PublicConfig: Decodable {
        let supabaseUrl: String
        let supabasePublishableKey: String
    }
    private var config: PublicConfig?
    private var jwt = ""
    private var validUntil = Date.distantPast

    func restore() async {
        guard KeychainStore.read("bailacue-admin-refresh") != nil else { return }
        do {
            try await refresh()
            try await verifyOwner()
            authorized = true
        } catch {
            authorized = false
        }
    }

    func login(email: String, password: String) async throws {
        guard !email.isEmpty, !password.isEmpty else {
            throw ProcessorError.invalid("Enter the BailaCue owner email and password.")
        }
        let config = try await loadConfig()
        let body = try JSONSerialization.data(withJSONObject: ["email": email, "password": password])
        let response = try await call(config.supabaseUrl + "/auth/v1/token?grant_type=password",
                                      method: "POST", body: body, auth: false)
        let payload = try dictionary(response)
        try acceptSession(payload)
        do {
            try await verifyOwner()
            authorized = true
        } catch {
            logout()
            throw error
        }
    }

    func logout() {
        jwt = ""
        validUntil = .distantPast
        authorized = false
        KeychainStore.delete("bailacue-admin-refresh")
    }

    private var builtInCatalogueIDs: Set<String>? = nil

    /// Skip untouched built-in originals and all previously published originals.
    /// Only genuinely new files are registered with the public BailaCue catalogue.
    func ensureOriginalRegistered(_ original: DriveVideo, dance: Dance) async throws {
        guard authorized else { throw ProcessorError.setup("Connect the BailaCue owner account first.") }
        guard original.parents.contains(dance.sourceFolder) else {
            throw ProcessorError.invalid("The original is outside the trusted collection.")
        }
        let sourceKey = "drive:" + original.id
        if builtInCatalogueIDs == nil {
            let url = URL(string: "https://develop--bailacue.netlify.app/catalogue.json")!
            let (data, response) = try await URLSession.shared.data(from: url)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let source = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  source["rootFolderId"] as? String == "1elTpDpgefwwlnrSEFc8vyREt3HUpDS8P",
                  let records = source["videos"] as? [[String: Any]] else {
                throw ProcessorError.request("Cannot verify the existing BailaCue catalogue. No originals published.")
            }
            builtInCatalogueIDs = Set(records.compactMap { $0["id"] as? String })
        }
        if builtInCatalogueIDs?.contains(sourceKey) == true { return }
        let config = try await loadConfig()
        var url = URLComponents(string: config.supabaseUrl + "/rest/v1/bailacue_web_content")!
        url.queryItems = [.init(name: "key", value: "eq.drive:" + sourceKey),
                          .init(name: "select", value: "key")]
        let response = try await call(url.url!.absoluteString, method: "GET", body: nil, auth: true)
        let existing = (try? JSONSerialization.jsonObject(with: response)) as? [[String: Any]] ?? []
        if existing.contains(where: { $0["key"] as? String == "drive:" + sourceKey }) { return }
        try await publishOriginal(original, dance: dance)
    }

    func publishOriginal(_ original: DriveVideo, dance: Dance) async throws {
        guard original.parents.contains(dance.sourceFolder) else {
            throw ProcessorError.invalid("Cannot register an original outside the trusted dance collection.")
        }
        let name = URL(fileURLWithPath: original.name).deletingPathExtension().lastPathComponent
        let payload: [String: Any] = [
            "id": "drive:" + original.id,
            "provider": "drive", "providerId": original.id,
            "dance": dance.rawValue, "folderId": dance.sourceFolder,
            "title": name, "filename": original.name,
            "addedAt": ISO8601DateFormatter().string(from: Date()),
            "updatedAt": "", "size": original.size,
            "duration": NSNull(), "width": NSNull(), "height": NSNull(),
            "mimeType": original.mimeType
        ]
        try await upsert(key: "drive:drive:" + original.id, payload: payload)
    }

    func publishManifest(_ current: OptimizedManifest) async throws {
        guard authorized else { throw ProcessorError.setup("Sign in as BailaCue owner to publish automatically.") }
        let config = try await loadConfig()
        try await ensureSession()
        let key = "optimized:manifest"
        var merged = current
        // Merge any already-published copies first, so this iPad never drops
        // quality mappings created by another authorized processor.
        var url = URLComponents(string: config.supabaseUrl + "/rest/v1/bailacue_web_content")!
        url.queryItems = [.init(name: "key", value: "eq." + key),
                          .init(name: "select", value: "payload")]
        let fetched = try await call(url.url!.absoluteString, method: "GET", body: nil, auth: true)
        if let list = try? JSONSerialization.jsonObject(with: fetched) as? [[String: Any]],
           let payload = list.first?["payload"],
           let encoded = try? JSONSerialization.data(withJSONObject: payload),
           let previous = try? JSONDecoder().decode(OptimizedManifest.self, from: encoded),
           previous.version == 2, previous.rootFolderId == current.rootFolderId,
           previous.preset == current.preset {
            for entry in previous.entries {
                guard let dance = Dance(rawValue: entry.dance),
                      entry.sourceId.hasPrefix("drive:") else { continue }
                let sourceID = String(entry.sourceId.dropFirst("drive:".count))
                let existing = merged.entries.first { $0.sourceId == entry.sourceId }?.renditions ?? []
                for rendition in entry.renditions where
                    !existing.contains(where: { $0.quality == rendition.quality }) {
                    merged.set(sourceId: sourceID, dance: dance, rendition: rendition)
                }
            }
        }
        let data = try JSONEncoder().encode(merged)
        let payload = try JSONSerialization.jsonObject(with: data)
        try await upsert(key: key, payload: payload)
    }

    private func upsert(key: String, payload: Any) async throws {
        guard authorized else { throw ProcessorError.setup("Sign in as BailaCue owner to publish.") }
        let config = try await loadConfig()
        try await ensureSession()
        let body = try JSONSerialization.data(withJSONObject: [["key": key, "payload": payload]])
        let url = config.supabaseUrl + "/rest/v1/bailacue_web_content?on_conflict=key"
        _ = try await call(url, method: "POST", body: body, auth: true,
                           prefer: "resolution=merge-duplicates,return=minimal")
    }

    private func verifyOwner() async throws {
        let config = try await loadConfig()
        let user = try dictionary(try await call(config.supabaseUrl + "/auth/v1/user",
                                                 method: "GET", body: nil, auth: true))
        guard let id = user["id"] as? String, !id.isEmpty else {
            throw ProcessorError.request("The BailaCue account could not be verified.")
        }
        var parts = URLComponents(string: config.supabaseUrl + "/rest/v1/bailacue_web_admins")!
        parts.queryItems = [.init(name: "select", value: "user_id"),
                            .init(name: "user_id", value: "eq." + id)]
        let rows = try await call(parts.url!.absoluteString, method: "GET", body: nil, auth: true)
        let results = (try? JSONSerialization.jsonObject(with: rows)) as? [[String: Any]] ?? []
        guard results.contains(where: { $0["user_id"] as? String == id }) else {
            throw ProcessorError.setup("This account is not authorized as BailaCue owner.")
        }
    }

    private func loadConfig() async throws -> PublicConfig {
        if let config { return config }
        let url = URL(string: "https://develop--bailacue.netlify.app/public-config.json")!
        let (data, response) = try await URLSession.shared.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw ProcessorError.request("BailaCue public configuration is unavailable.")
        }
        let value = try JSONDecoder().decode(PublicConfig.self, from: data)
        guard let host = URL(string: value.supabaseUrl)?.host,
              host.hasSuffix(".supabase.co"),
              value.supabaseUrl.hasPrefix("https://"),
              value.supabasePublishableKey.hasPrefix("sb_publishable_") else {
            throw ProcessorError.invalid("BailaCue public configuration is invalid.")
        }
        config = value
        return value
    }

    private func ensureSession() async throws {
        if validUntil > Date().addingTimeInterval(60), !jwt.isEmpty { return }
        try await refresh()
    }

    private func refresh() async throws {
        guard let token = KeychainStore.read("bailacue-admin-refresh") else {
            throw ProcessorError.setup("Sign in as BailaCue owner first.")
        }
        let config = try await loadConfig()
        let body = try JSONSerialization.data(withJSONObject: ["refresh_token": token])
        let data = try await call(config.supabaseUrl + "/auth/v1/token?grant_type=refresh_token",
                                  method: "POST", body: body, auth: false)
        try acceptSession(dictionary(data))
    }

    private func acceptSession(_ payload: [String: Any]) throws {
        guard let access = payload["access_token"] as? String, !access.isEmpty,
              let refresh = payload["refresh_token"] as? String, !refresh.isEmpty else {
            throw ProcessorError.request("BailaCue owner authentication returned no session.")
        }
        jwt = access
        KeychainStore.write(refresh, for: "bailacue-admin-refresh")
        let seconds = (payload["expires_in"] as? NSNumber)?.doubleValue ?? 3600
        validUntil = Date().addingTimeInterval(seconds)
    }

    private func dictionary(_ data: Data) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw ProcessorError.request("BailaCue returned unexpected authentication data.")
        }
        return value
    }

    private func call(_ rawURL: String, method: String,
                      body: Data?, auth: Bool, prefer: String? = nil) async throws -> Data {
        guard let url = URL(string: rawURL), url.scheme == "https" else {
            throw ProcessorError.invalid("Unsafe BailaCue API URL.")
        }
        let config = try await loadConfig()
        guard url.host == URL(string: config.supabaseUrl)?.host else {
            throw ProcessorError.invalid("Unexpected API host.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(config.supabasePublishableKey, forHTTPHeaderField: "apikey")
        if auth { request.setValue("Bearer " + jwt, forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let prefer { request.setValue(prefer, forHTTPHeaderField: "Prefer") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw ProcessorError.request("BailaCue owner API rejected the request. Reconnect and check owner permissions.")
        }
        return data
    }
}
