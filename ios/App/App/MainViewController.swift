import Capacitor
import UIKit

/// Подменяет стандартный CAPBridgeViewController (см. Main.storyboard),
/// чтобы зарегистрировать локальный плагин без отдельного npm-пакета.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(BodyVisionPlugin())
    }
}
