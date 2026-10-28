#!/bin/sh
# Se ejecuta una vez al crear el contenedor. La primera vez (sin package.json) genera la app Angular.
set -eu
cd "$(dirname "$0")/.."

if [ -f package.json ]; then
  pnpm install
  exit 0
fi

echo "Generando la aplicación Angular…"
tmp="$(mktemp -d)"
# --directory se resuelve siempre relativo al directorio actual (una ruta absoluta acaba dentro del
# proyecto), así que se genera desde dentro de $tmp.
(cd "$tmp" && pnpm dlx @angular/cli@latest new ruta-tapas --directory app --style=scss --ssr=false \
  --package-manager=pnpm --skip-git --skip-install --interactive=false --defaults)

# Copia recursiva sin sobrescribir lo que ya existe (README.md, data/, scripts/, el código de src/…).
node -e 'require("fs").cpSync(process.argv[1], ".", { recursive: true, force: false })' "$tmp/app"
rm -rf "$tmp"

node -e '
  const fs = require("fs");
  const leer = (fichero) => JSON.parse(fs.readFileSync(fichero, "utf8"));
  const escribir = (fichero, json) => fs.writeFileSync(fichero, JSON.stringify(json, null, 2) + "\n");

  // Sirve data/ (locales.json y fotos) como recursos estáticos en /data y añade los estilos de Leaflet.
  const ng = leer("angular.json");
  const build = Object.values(ng.projects)[0].architect.build.options;
  (build.assets ??= []).push({ glob: "**/*", input: "data", output: "data", ignore: ["geocode-*.json"] });
  build.styles = ["node_modules/leaflet/dist/leaflet.css", ...(build.styles ?? [])];
  // Leaflet 1.x no es ESM: evita el aviso de dependencia CommonJS al compilar.
  (build.allowedCommonJsDependencies ??= []).push("leaflet");
  escribir("angular.json", ng);

  // Escuchar en 0.0.0.0 para que el puerto sea accesible desde fuera del contenedor.
  const pkg = leer("package.json");
  pkg.scripts.start = "ng serve --host 0.0.0.0";
  escribir("package.json", pkg);
'

# pnpm 11 falla si alguna dependencia trae scripts de instalación sin aprobar; estas son las del build de Angular.
[ -f pnpm-workspace.yaml ] || cat > pnpm-workspace.yaml <<'EOF'
allowBuilds:
  '@parcel/watcher': true
  esbuild: true
  lmdb: true
  msgpackr-extract: true
EOF

# Leaflet 1.x, la versión que describe @types/leaflet.
pnpm add leaflet@1
pnpm add --save-dev @types/leaflet@1
