// Extrae los locales de la guía PDF a data/locales.json + data/fotos/*.jpg
// Uso (macOS, sin dependencias): swift scripts/extract.swift "GUÍA OFICIAL 2026 DIGITAL.pdf" data
import AppKit
import PDFKit

let args = CommandLine.arguments
guard args.count >= 3, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  FileHandle.standardError.write("uso: swift extract.swift <guia.pdf> <dir-salida>\n".data(using: .utf8)!)
  exit(1)
}
let outDir = URL(fileURLWithPath: args[2])
let photoDir = outDir.appendingPathComponent("fotos")
try FileManager.default.createDirectory(at: photoDir, withIntermediateDirectories: true)

// Geometría de la plantilla (puntos PDF, origen arriba-izquierda). Hay 2 locales por página.
let blockOffset: CGFloat = 218.2
let blockSplit: CGFloat = 233
let columnSplit: CGFloat = 153
let photoRects = [CGRect(x: 34.4, y: 82.2, width: 115.0, height: 73.2),
                  CGRect(x: 157.9, y: 82.2, width: 115.0, height: 73.2)]
// Iconos junto a la etiqueta "TAPA n": sin gluten a la derecha, sello "Castelló Ruta de Sabor" a la izquierda.
let glutenRects = [CGRect(x: 102, y: 158.5, width: 48, height: 15),
                   CGRect(x: 226, y: 158.5, width: 48, height: 15)]
let sealRects = [CGRect(x: 35, y: 158.5, width: 46, height: 15),
                 CGRect(x: 158, y: 158.5, width: 46, height: 15)]
let days = ["LUNES": "monday", "MARTES": "tuesday", "MIÉRCOLES": "wednesday", "JUEVES": "thursday",
            "VIERNES": "friday", "SÁBADO": "saturday", "DOMINGO": "sunday"]
let dayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

enum Tone { case normal, hidden, grey, accent }

struct Fragment {
  var text = ""
  var rect = CGRect.null  // origen arriba-izquierda
  var size: CGFloat = 0
  var tone = Tone.normal
  // Algunos glifos traen cajas desproporcionadas: la posición de línea es la mediana de sus caracteres.
  var tops: [CGFloat] = []
  var mids: [CGFloat] = []
  var y: CGFloat { median(tops) }
  var midY: CGFloat { median(mids) }
  var cx: CGFloat { rect.midX }
}

func median(_ v: [CGFloat]) -> CGFloat { v.isEmpty ? 0 : v.sorted()[v.count / 2] }

func tone(of color: NSColor?) -> Tone {
  guard let c = color?.usingColorSpace(.sRGB) else { return .normal }
  let (r, g, b) = (c.redComponent, c.greenComponent, c.blueComponent)
  if r > 0.95 && g > 0.95 && b > 0.95 { return .hidden }
  if r > 0.3 && abs(r - g) < 0.06 && abs(g - b) < 0.06 { return .grey }
  if r > 0.6 && r - g > 0.3 && b < 0.4 { return .accent }
  return .normal
}

// Agrupa caracteres consecutivos en fragmentos (misma línea, mismo tamaño y tono, sin huecos grandes).
func fragments(of page: PDFPage) -> [Fragment] {
  guard let attr = page.attributedString else { return [] }
  let str = attr.string as NSString
  let H = page.bounds(for: .mediaBox).height
  var out: [Fragment] = []
  var cur = Fragment()
  func flush() {
    cur.text = cur.text.trimmingCharacters(in: .whitespaces)
    if !cur.text.isEmpty && (cur.tone != .hidden || cur.size >= 13) { out.append(cur) }
    cur = Fragment()
  }
  for i in 0..<str.length {
    let ch = str.substring(with: NSRange(location: i, length: 1))
    if ch == "\n" || ch == "\r" || ch == "\u{FFFC}" { flush(); continue }
    let b = page.selection(for: NSRange(location: i, length: 1))?.bounds(for: page) ?? .zero
    let at = attr.attributes(at: i, effectiveRange: nil)
    let size = (at[.font] as? NSFont)?.pointSize ?? 0
    let t = tone(of: at[.foregroundColor] as? NSColor)
    if ch == " " || b.width == 0 {
      if t != .hidden || cur.tone == .hidden { cur.text += ch }
      continue
    }
    let r = CGRect(x: b.minX, y: H - b.maxY, width: b.width, height: b.height)
    if !cur.text.isEmpty {
      let breakLine = abs(r.midY - cur.midY) > 2 || r.minX - cur.rect.maxX > 4 || r.minX < cur.rect.minX
      if breakLine || abs(size - cur.size) > 0.5 || t != cur.tone { flush() }
    }
    cur.text += ch
    cur.rect = cur.rect.union(r)
    cur.tops.append(r.minY)
    cur.mids.append(r.midY)
    cur.size = size
    cur.tone = t
  }
  flush()
  return out
}

func render(_ page: PDFPage, _ rect: CGRect, scale: CGFloat) -> CGImage? {
  let H = page.bounds(for: .mediaBox).height
  let w = Int(rect.width * scale), h = Int(rect.height * scale)
  guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
  ctx.setFillColor(.white)
  ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.interpolationQuality = .high
  ctx.scaleBy(x: scale, y: scale)
  ctx.translateBy(x: -rect.minX, y: -(H - rect.maxY))
  page.draw(with: .mediaBox, to: ctx)
  return ctx.makeImage()
}

func saveJPEG(_ img: CGImage, _ url: URL) {
  let rep = NSBitmapImageRep(cgImage: img)
  try? rep.representation(using: .jpeg, properties: [.compressionFactor: 0.85])?.write(to: url)
}

func countPixels(_ page: PDFPage, _ rect: CGRect, _ match: (Int, Int, Int) -> Bool) -> Int {
  guard let img = render(page, rect, scale: 4), let data = img.dataProvider?.data,
        let p = CFDataGetBytePtr(data) else { return 0 }
  var hits = 0
  for y in 0..<img.height {
    for x in 0..<img.width {
      let o = y * img.bytesPerRow + x * 4
      if match(Int(p[o]), Int(p[o + 1]), Int(p[o + 2])) { hits += 1 }
    }
  }
  return hits
}

// PDFKit a veces devuelve cajas que abarcan varias filas; la fila real es el extremo (arriba o abajo)
// que no ocupa ya otro fragmento y, si eso no decide, el que tiene tinta.
func fixTallBoxes(_ frs: [Fragment], _ page: PDFPage) -> [Fragment] {
  let isTall = { (f: Fragment) in f.rect.height > f.size * 1.4 * 1.5 }
  let normal = frs.filter { !isTall($0) }
  return frs.map { f in
    let lineH = f.size * 1.4
    guard isTall(f) else { return f }
    let band = { (y: CGFloat) in CGRect(x: f.rect.minX, y: y, width: f.rect.width, height: lineH) }
    let occupied = { (r: CGRect) in
      normal.contains { $0.rect.intersection(r).height > lineH * 0.3 && $0.rect.minX < r.maxX && $0.rect.maxX > r.minX }
    }
    let ink = { (r: CGRect) in countPixels(page, r.insetBy(dx: 0, dy: lineH * 0.25)) { r, g, b in r + g + b < 600 } }
    let top = band(f.rect.minY), bottom = band(f.rect.maxY - lineH)
    var g = f
    switch (occupied(top), occupied(bottom)) {
    case (true, false): g.rect = bottom
    case (false, true): g.rect = top
    default: g.rect = ink(top) >= ink(bottom) ? top : bottom
    }
    g.tops = [g.rect.minY]
    g.mids = [g.rect.midY]
    return g
  }
}

// El icono "sin gluten" es naranja: basta con contar píxeles de ese tono en su zona.
func hasGlutenIcon(_ page: PDFPage, _ rect: CGRect) -> Bool {
  countPixels(page, rect) { r, g, b in r > 190 && g > 70 && g < 150 && b < 110 } > 40
}

// El sello "Castelló Ruta de Sabor" es muy saturado; la línea separadora que cruza la zona no lo es.
func hasSealIcon(_ page: PDFPage, _ rect: CGRect) -> Bool {
  countPixels(page, rect) { r, g, b in max(r, g, b) - min(r, g, b) > 120 && b > 120 && r < 80 } > 40
}

// "close" es null cuando el tramo es "HH:MM - CIERRE" (hasta que cierre el local).
func parseSlots(_ s: String) -> [[String: Any]] {
  let re = try! NSRegularExpression(pattern: #"(\d{1,2}):(\d{2})\s*-\s*(?:(\d{1,2}):(\d{2})|CIERRE)"#)
  return re.matches(in: s, range: NSRange(s.startIndex..., in: s)).compactMap { m in
    let g = (1...4).map { m.range(at: $0).location == NSNotFound ? nil : Int((s as NSString).substring(with: m.range(at: $0))) }
    if g.allSatisfy({ $0 == 0 }) { return nil }
    let close: Any = g[2].map { String(format: "%02d:%02d", $0, g[3]!) } ?? NSNull()
    return ["open": String(format: "%02d:%02d", g[0]!, g[1]!), "close": close]
  }
}

func parseContact(_ parts: [String]) -> (address: String, phone: String?, instagram: String?) {
  let s = parts.joined(separator: "  ")
  let phoneRe = try! NSRegularExpression(pattern: #"\b\d{3} ?\d{2,3} ?\d{2,3}( ?\d{2})?\b"#)
  guard let m = phoneRe.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else {
    return (s, nil, nil)
  }
  let ns = s as NSString
  let address = ns.substring(to: m.range.location).trimmingCharacters(in: .whitespaces)
  let phone = ns.substring(with: m.range).replacingOccurrences(of: " ", with: "")
  let rest = ns.substring(from: m.range.location + m.range.length).trimmingCharacters(in: .whitespaces)
  var ig = rest.split(separator: " ").first.map(String.init)
  if let i = ig, !i.hasPrefix("@") { ig = "@" + i }
  return (address, phone, ig)
}

func join(_ frs: [Fragment]) -> String {
  frs.sorted { abs($0.y - $1.y) > 2 ? $0.y < $1.y : $0.rect.minX < $1.rect.minX }
    .map(\.text).joined(separator: " ")
    .replacingOccurrences(of: "  ", with: " ")
}

var locales: [[String: Any]] = []
var warnings: [String] = []

for pi in 0..<doc.pageCount {
  let page = doc.page(at: pi)!
  let frs = fixTallBoxes(fragments(of: page), page)
  guard frs.contains(where: { $0.text == "TAPA 1" }) else { continue }

  for block in 0..<2 {
    let dy = CGFloat(block) * blockOffset
    let mine = frs.filter { (block == 0) == ($0.y < blockSplit) && $0.text != "TAPA 1" && $0.text != "TAPA 2" }
      .map { f -> Fragment in
        var g = f
        g.rect = f.rect.offsetBy(dx: 0, dy: -dy)
        g.tops = f.tops.map { $0 - dy }
        g.mids = f.mids.map { $0 - dy }
        return g
      }

    var number: Int?
    var nameFr: [Fragment] = [], subFr: [Fragment] = []
    var dayLabels: [(key: String, y: CGFloat, closed: Bool)] = []
    var slotFr: [Fragment] = []
    var contact: [Fragment] = []
    var tapaName: [[Fragment]] = [[], []], tapaDesc: [[Fragment]] = [[], []]
    var drinks: [Fragment] = [], notes: [Fragment] = []
    var glutenOptional = [false, false]

    for f in mine {
      let col = f.cx < columnSplit ? 0 : 1
      if f.tone == .accent {
        // "OPCIONAL" junto al icono sin gluten: se puede pedir sin gluten.
        if (150..<176).contains(f.y) { glutenOptional[col] = true } else { notes.append(f) }
        continue
      }
      if f.size >= 13, let n = Int(f.text) { number = n; continue }
      if let d = days[f.text], f.rect.maxX < 190 {
        dayLabels.append((d, f.midY, f.tone == .grey)); continue
      }
      let hasTime = f.text.range(of: #"\d:\d\d"#, options: .regularExpression) != nil
      switch (f.y, f.size) {
      case (30..<70, 10.5...): nameFr.append(f)
      case (30..<70, 8..<10.5) where f.rect.minX < 150: subFr.append(f)
      case (15..<70, _) where f.rect.minX >= 185 && hasTime: slotFr.append(f)
      case (15..<70, _) where f.rect.minX >= 185: notes.append(f)
      case (68..<80, _): contact.append(f)
      case (165..<182, _): tapaName[col].append(f)
      case (182..<218, _): tapaDesc[col].append(f)
      case (218..<230, _): drinks.append(f)
      default: warnings.append("p\(pi + 1) bloque \(block): fragmento sin clasificar '\(f.text)' y=\(f.y)")
      }
    }

    // La plantilla deja "ACORDES / GASTROBAR" tapado bajo el nombre real del primer bloque (son los
    // primeros en el flujo de contenido); un "GASTROBAR" posterior sí forma parte del nombre.
    if block == 0, nameFr.count > 2 {
      for word in ["ACORDES", "GASTROBAR"] {
        if let i = nameFr.firstIndex(where: { $0.text == word }) { nameFr.remove(at: i) }
      }
    }

    guard let num = number else {
      if !mine.isEmpty { warnings.append("p\(pi + 1) bloque \(block): sin número de local") }
      continue
    }
    let id = String(format: "%02d", num)

    var schedule: [String: Any] = [:]
    for d in dayOrder {
      guard let label = dayLabels.first(where: { $0.key == d }) else {
        warnings.append("\(id): falta etiqueta \(d)"); schedule[d] = []; continue
      }
      let row = slotFr.filter { abs($0.midY - label.y) < 3 }.sorted { $0.rect.minX < $1.rect.minX }
      let slots = label.closed ? [] : parseSlots(row.map(\.text).joined(separator: " "))
      if !label.closed && slots.isEmpty { warnings.append("\(id): \(d) activo pero sin horario") }
      if zip(row, row.dropFirst()).contains(where: { $0.rect.maxX > $1.rect.minX }) {
        warnings.append("\(id): \(d) con fragmentos solapados \(row.map(\.text))")
      }
      schedule[d] = slots
    }

    let c = parseContact(contact.sorted { $0.rect.minX < $1.rect.minX }.map(\.text))
    var tapas: [[String: Any]] = []
    for t in 0..<2 {
      let file = "\(id)-\(t + 1).jpg"
      if let img = render(page, photoRects[t].offsetBy(dx: 0, dy: dy), scale: 6) {
        saveJPEG(img, photoDir.appendingPathComponent(file))
      }
      tapas.append([
        "number": t + 1,
        "name": join(tapaName[t]),
        "description": join(tapaDesc[t]),
        "photo": "fotos/\(file)",
        "glutenFree": !hasGlutenIcon(page, glutenRects[t].offsetBy(dx: 0, dy: dy)) ? "no"
          : glutenOptional[t] ? "optional" : "yes",
        "castelloRutaDeSabor": hasSealIcon(page, sealRects[t].offsetBy(dx: 0, dy: dy)),
      ])
    }

    var local: [String: Any] = [
      "number": num,
      "name": join(nameFr),
      "address": c.address,
      "drinks": join(drinks).components(separatedBy: "·").map { $0.trimmingCharacters(in: .whitespaces) }
        .filter { !$0.isEmpty },
      "schedule": schedule,
      "tapas": tapas,
      "page": pi + 1,
    ]
    local["subtitle"] = subFr.isEmpty ? NSNull() : join(subFr)
    local["phone"] = c.phone ?? NSNull()
    local["instagram"] = c.instagram ?? NSNull()
    local["notes"] = notes.map(\.text)
    locales.append(local)
  }
}

locales.sort { ($0["number"] as! Int) < ($1["number"] as! Int) }
let result: [String: Any] = [
  "event": [
    "name": "Ruta de Tapas Sabores Castellón",
    "edition": "Otoño 2026 (17ª edición)",
    "startDate": "2026-10-15",
    "endDate": "2026-11-07",
    "price": "Tapa + bebida 6,00 €",
    "city": "Castelló de la Plana",
  ],
  "locales": locales,
]
let json = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
try json.write(to: outDir.appendingPathComponent("locales.json"))
print("\(locales.count) locales extraídos")
warnings.forEach { print("⚠️ \($0)") }
