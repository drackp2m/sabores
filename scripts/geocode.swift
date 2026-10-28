// Añade "location" a cada local de data/locales.json.
// Uso (macOS, sin dependencias): swift scripts/geocode.swift data
// - Primero CartoCiudad (IGN, precisión de portal); si no encuentra el portal, Nominatim (OpenStreetMap).
// - data/geocode-cache.json guarda las respuestas: volver a ejecutarlo no repite peticiones.
// - data/geocode-overrides.json ({"33": {"lat": .., "lng": ..}}) corrige a mano lo que haga falta.
import Foundation

let dir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "data")
let localesURL = dir.appendingPathComponent("locales.json")
let cacheURL = dir.appendingPathComponent("geocode-cache.json")
let overridesURL = dir.appendingPathComponent("geocode-overrides.json")

func readJSON(_ url: URL) -> Any? { (try? Data(contentsOf: url)).flatMap { try? JSONSerialization.jsonObject(with: $0) } }
func writeJSON(_ obj: Any, _ url: URL) {
  let data = try! JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
  try! data.write(to: url)
}

var root = readJSON(localesURL) as! [String: Any]
var cache = readJSON(cacheURL) as? [String: Any] ?? [:]
let overrides = readJSON(overridesURL) as? [String: [String: Double]] ?? [:]

let city = "Castelló de la Plana"
let muniCode = "12040"  // INE de Castelló de la Plana (incluye el Grau)
let viewbox = "-0.12,40.03,0.07,39.93"

func normalize(_ address: String) -> String {
  var s = address.uppercased()
  s = s.replacingOccurrences(of: #"\(.*?\)"#, with: "", options: .regularExpression)
  let prefixes = [("C/", "Calle "), ("AV/", "Avenida "), ("AV.", "Avenida "), ("PZA.", "Plaza "), ("PLA.", "Plaza "),
                  ("CRTA.", "Carretera "), ("Mª", "María")]
  for (from, to) in prefixes { s = s.replacingOccurrences(of: from, with: to) }
  return s.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    .trimmingCharacters(in: .whitespaces).capitalized
}

func fetch(_ url: URL, delay: Double) -> Data? {
  var req = URLRequest(url: url)
  req.setValue("ruta-tapas-castellon/1.0 (uso personal)", forHTTPHeaderField: "User-Agent")
  let sem = DispatchSemaphore(value: 0)
  var out: Data?
  URLSession.shared.dataTask(with: req) { data, _, _ in out = data; sem.signal() }.resume()
  sem.wait()
  Thread.sleep(forTimeInterval: delay)
  return out
}

func cached(_ key: String, _ load: () -> Any) -> Any {
  if let hit = cache[key] { return hit }
  let value = load()
  cache[key] = value
  writeJSON(cache, cacheURL)
  return value
}

func cartociudad(_ q: String) -> [String: Any]? {
  let r = cached("cartociudad:\(q)") {
    var c = URLComponents(string: "https://www.cartociudad.es/geocoder/api/geocoder/findJsonp")!
    c.queryItems = [URLQueryItem(name: "q", value: q)]
    guard let data = fetch(c.url!, delay: 0.3), var s = String(data: data, encoding: .utf8) else { return [:] }
    // Respuesta JSONP: callback({...})
    s = s.replacingOccurrences(of: #"^\s*callback\("#, with: "", options: .regularExpression)
      .replacingOccurrences(of: #"\)\s*$"#, with: "", options: .regularExpression)
    return (try? JSONSerialization.jsonObject(with: Data(s.utf8))) ?? [:]
  } as? [String: Any]
  guard let r, r["muniCode"] as? String == muniCode, r["lat"] is Double else { return nil }
  return r
}

func nominatim(_ q: String) -> [String: Any]? {
  let r = cached("nominatim:\(q)") {
    var c = URLComponents(string: "https://nominatim.openstreetmap.org/search")!
    c.queryItems = ["q": q, "format": "jsonv2", "limit": "1", "countrycodes": "es", "viewbox": viewbox, "bounded": "1"]
      .map { URLQueryItem(name: $0.key, value: $0.value) }
    // Política de uso de Nominatim: máx. 1 petición/segundo.
    return fetch(c.url!, delay: 1.1).flatMap { try? JSONSerialization.jsonObject(with: $0) } ?? []
  } as? [[String: Any]]
  return r?.first
}

var locales = root["locales"] as! [[String: Any]]
for i in locales.indices {
  let id = String(format: "%02d", locales[i]["number"] as! Int)
  let raw = locales[i]["address"] as! String
  if let o = overrides[id] {
    locales[i]["location"] = ["lat": o["lat"]!, "lng": o["lng"]!, "source": "manual", "precision": "manual"]
    continue
  }
  let addr = normalize(raw)
  let hasNumber = addr.range(of: #",\s*\d+"#, options: .regularExpression) != nil
  if hasNumber, let r = cartociudad("\(addr), \(city)"), r["type"] as? String == "portal" {
    locales[i]["location"] = [
      "lat": r["lat"]!, "lng": r["lng"]!, "source": "cartociudad", "precision": "portal",
      "match": "\(r["tip_via"] ?? "") \(r["address"] ?? "") \(r["portalNumber"] ?? "")",
    ]
  } else if let r = nominatim("\(addr), \(city)"), let lat = Double(r["lat"] as? String ?? ""),
            let lng = Double(r["lon"] as? String ?? "") {
    let type = r["addresstype"] as? String ?? ""
    locales[i]["location"] = [
      "lat": lat, "lng": lng, "source": "nominatim", "precision": type == "road" ? "street" : "place",
      "match": r["display_name"] as? String ?? "",
    ]
  } else {
    locales[i]["location"] = NSNull()
    print("⚠️ \(id) sin coordenadas: \(raw) → \(addr)")
  }
}
root["locales"] = locales
writeJSON(root, localesURL)
for (p, n) in Dictionary(grouping: locales.compactMap { ($0["location"] as? [String: Any])?["precision"] as? String }, by: { $0 }) {
  print("\(p): \(n.count)")
}
