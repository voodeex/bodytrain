// Рисует иконку приложения и сплэш (тёмный фон + гантель в акцентном цвете).
// Запуск: swift scripts/make-icons.swift
import AppKit

let accent = NSColor(srgbRed: 0.83, green: 1.0, blue: 0.23, alpha: 1)
let bg = NSColor(srgbRed: 0.043, green: 0.043, blue: 0.047, alpha: 1)

func render(size: Int, symbolScale: CGFloat, glow: Bool, to path: String) {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                               bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let s = CGFloat(size)
    bg.setFill()
    NSRect(x: 0, y: 0, width: s, height: s).fill()
    if glow {
        let g = NSGradient(colors: [accent.withAlphaComponent(0.22), accent.withAlphaComponent(0)])!
        g.draw(fromCenter: NSPoint(x: s * 0.5, y: s * 0.42), radius: 0, toCenter: NSPoint(x: s * 0.5, y: s * 0.42), radius: s * 0.62, options: [])
    }
    let config = NSImage.SymbolConfiguration(pointSize: s * symbolScale, weight: .bold)
        .applying(.init(paletteColors: [accent]))
    if let sym = NSImage(systemSymbolName: "dumbbell.fill", accessibilityDescription: nil)?.withSymbolConfiguration(config) {
        let r = sym.size
        let rot = NSAffineTransform()
        rot.translateX(by: s / 2, yBy: s / 2)
        rot.rotate(byDegrees: -35)
        rot.concat()
        sym.draw(in: NSRect(x: -r.width / 2, y: -r.height / 2, width: r.width, height: r.height))
    }
    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

let base = "ios/App/App/Assets.xcassets"
render(size: 1024, symbolScale: 0.40, glow: true, to: "\(base)/AppIcon.appiconset/AppIcon-512@2x.png")
for name in ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"] {
    render(size: 2732, symbolScale: 0.09, glow: false, to: "\(base)/Splash.imageset/\(name)")
}
render(size: 512, symbolScale: 0.40, glow: true, to: "public/icon-512.png")
print("icons ok")
