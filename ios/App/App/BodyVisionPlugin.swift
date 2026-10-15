import AVFoundation
import Capacitor
import CoreML
import UIKit
import Vision
import VisionKit
import Security

/// Нативная часть распознавания для веб-приложения.
/// JS-сторона: src/lib/bodyVision.ts (registerPlugin('BodyVision')).
@objc(BodyVisionPlugin)
public class BodyVisionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BodyVisionPlugin"
    public let jsName = "BodyVision"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "classifyFood", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "detectBarcode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanBarcode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isScannerAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSecret", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSecret", returnType: CAPPluginReturnPromise),
    ]

    private var scannerDelegate: AnyObject?

    private func keyQuery(_ call: CAPPluginCall) -> [String: Any]? {
        let name = call.getString("name") ?? "gemini_api_key"
        guard ["gemini_api_key", "groq_api_key", "openrouter_api_key", "cloudflare_api_key", "cloudflare_account_id", "bodytrain_session"].contains(name) else {
            call.reject("Неизвестное имя ключа", "BAD_KEY")
            return nil
        }
        return [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: Bundle.main.bundleIdentifier ?? "com.voodeex.bodytrain",
         kSecAttrAccount as String: name]
    }

    @objc func getSecret(_ call: CAPPluginCall) {
        guard var query = keyQuery(call) else { return }
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Не удалось прочитать ключ из Keychain", "KEYCHAIN")
            return
        }
        let value = (result as? Data).flatMap { String(data: $0, encoding: .utf8) } ?? ""
        call.resolve(["value": value])
    }

    @objc func setSecret(_ call: CAPPluginCall) {
        guard let query = keyQuery(call) else { return }
        let value = (call.getString("value") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if value.isEmpty {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else {
                call.reject("Не удалось удалить ключ", "KEYCHAIN")
                return
            }
        } else {
            let attributes: [String: Any] = [kSecValueData as String: Data(value.utf8),
                kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
            var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
            if status == errSecItemNotFound {
                var query = query
                attributes.forEach { query[$0.key] = $0.value }
                status = SecItemAdd(query as CFDictionary, nil)
            }
            guard status == errSecSuccess else {
                call.reject("Не удалось сохранить ключ в Keychain", "KEYCHAIN")
                return
            }
        }
        call.resolve()
    }

    private func image(from call: CAPPluginCall) -> CGImage? {
        guard let b64 = call.getString("image"),
              let data = Data(base64Encoded: b64, options: .ignoreUnknownCharacters),
              let img = UIImage(data: data) else { return nil }
        return img.cgImage
    }

    /// В симуляторе нет Neural Engine/GPU-инференса Vision — считаем на CPU.
    private static func preferCPUInSimulator(_ request: VNRequest) {
        #if targetEnvironment(simulator)
        if #available(iOS 17.0, *) {
            if let devices = try? request.supportedComputeStageDevices[.main],
               let cpu = devices.first(where: { if case .cpu = $0 { return true } else { return false } }) {
                request.setComputeDevice(cpu, for: .main)
            }
        } else {
            request.usesCPUOnly = true
        }
        #endif
    }

    // MARK: - Классификация еды (встроенная модель Apple, ~1300 меток)

    @objc func classifyFood(_ call: CAPPluginCall) {
        guard let cg = image(from: call) else {
            call.reject("Не удалось прочитать изображение", "BAD_IMAGE")
            return
        }
        #if targetEnvironment(simulator)
        // Классификатор Apple в симуляторе не работает: без Neural Engine он либо падает
        // («Failed to create espresso context»), либо на CPU выдаёт одинаковый мусор для любого фото.
        _ = cg
        call.reject("В симуляторе встроенная модель Apple не работает — проверь на iPhone или используй облачный анализ", "SIMULATOR")
        #else
        DispatchQueue.global(qos: .userInitiated).async {
            let request = VNClassifyImageRequest()
            let handler = VNImageRequestHandler(cgImage: cg, orientation: .up)
            do {
                try handler.perform([request])
                let labels = (request.results ?? [])
                    .filter { $0.confidence >= 0.01 }
                    .sorted { $0.confidence > $1.confidence }
                    .prefix(80)
                    .map { ["id": $0.identifier, "confidence": Double($0.confidence)] }
                call.resolve(["labels": Array(labels)])
            } catch {
                call.reject("Ошибка распознавания: \(error.localizedDescription)", "VISION_ERROR", error)
            }
        }
        #endif
    }

    // MARK: - Штрихкод на фото

    @objc func detectBarcode(_ call: CAPPluginCall) {
        guard let cg = image(from: call) else {
            call.reject("Не удалось прочитать изображение", "BAD_IMAGE")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let request = VNDetectBarcodesRequest()
            request.symbologies = [.ean13, .ean8, .upce, .code128, .itf14]
            Self.preferCPUInSimulator(request)
            let handler = VNImageRequestHandler(cgImage: cg, orientation: .up)
            do {
                try handler.perform([request])
                let codes = (request.results ?? []).compactMap { $0.payloadStringValue }
                call.resolve(["codes": codes])
            } catch {
                call.reject("Ошибка распознавания: \(error.localizedDescription)", "VISION_ERROR", error)
            }
        }
    }

    // MARK: - Живой сканер (VisionKit, iOS 16+, A12 и новее)

    @objc func isScannerAvailable(_ call: CAPPluginCall) {
        Task { @MainActor in
            if #available(iOS 16.0, *) {
                call.resolve(["available": DataScannerViewController.isSupported])
            } else {
                call.resolve(["available": false])
            }
        }
    }

    @objc func scanBarcode(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard #available(iOS 16.0, *), DataScannerViewController.isSupported else {
                call.reject("Живой сканер не поддерживается на этом устройстве", "UNAVAILABLE")
                return
            }
            guard await AVCaptureDevice.requestAccess(for: .video) else {
                call.reject("Нет доступа к камере — разреши его в Настройках", "NO_CAMERA")
                return
            }
            guard DataScannerViewController.isAvailable else {
                call.reject("Камера сейчас недоступна — попробуй фото или ручной ввод", "UNAVAILABLE")
                return
            }
            self.presentScanner(call)
        }
    }

    @available(iOS 16.0, *)
    @MainActor
    private func presentScanner(_ call: CAPPluginCall) {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce, .code128, .itf14])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isHighlightingEnabled: true
        )
        let nav = UINavigationController(rootViewController: scanner)
        nav.modalPresentationStyle = .fullScreen
        nav.overrideUserInterfaceStyle = .dark

        var finished = false
        let finish: @MainActor (String?) -> Void = { [weak self, weak nav] code in
            guard !finished else { return }
            finished = true
            scanner.stopScanning()
            nav?.dismiss(animated: true)
            self?.scannerDelegate = nil
            if let code {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                call.resolve(["code": code])
            } else {
                call.reject("Отменено", "CANCELLED")
            }
        }

        let delegate = ScannerDelegate(onCode: { finish($0) })
        scanner.delegate = delegate
        scannerDelegate = delegate
        scanner.navigationItem.title = "Наведи камеру на штрихкод"
        scanner.navigationItem.leftBarButtonItem = UIBarButtonItem(
            systemItem: .cancel,
            primaryAction: UIAction { _ in finish(nil) }
        )

        bridge?.viewController?.present(nav, animated: true) {
            do {
                try scanner.startScanning()
            } catch {
                finish(nil)
            }
        }
    }
}

@available(iOS 16.0, *)
@MainActor
private final class ScannerDelegate: NSObject, DataScannerViewControllerDelegate {
    let onCode: @MainActor (String) -> Void
    init(onCode: @escaping @MainActor (String) -> Void) { self.onCode = onCode }

    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        for item in addedItems {
            if case let .barcode(barcode) = item, let value = barcode.payloadStringValue, !value.isEmpty {
                onCode(value)
                return
            }
        }
    }
}
