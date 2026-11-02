#!/bin/sh
# Runs once when the container is created. The first time (no package.json) it generates the Angular app.
set -eu
cd "$(dirname "$0")/.."

if [ -f package.json ]; then
  pnpm install
  exit 0
fi

echo "Generating the Angular application…"
tmp="$(mktemp -d)"
# --directory always resolves relative to the current directory (an absolute path ends up inside the
# project), so it generates from within $tmp.
(cd "$tmp" && pnpm dlx @angular/cli@latest new tapas-route --directory app --style=scss --ssr=false \
  --package-manager=pnpm --skip-git --skip-install --interactive=false --defaults)

# Recursive copy that doesn't overwrite what already exists (README.md, data/, scripts/, the code in src/…).
node -e 'require("fs").cpSync(process.argv[1], ".", { recursive: true, force: false })' "$tmp/app"
rm -rf "$tmp"

node -e '
  const fs = require("fs");
  const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
  const write = (file, json) => fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");

  // Serves data/ (venues.json and photos) as static assets in /data, and MapLibre's worker and styles
  // apart from the app (see map.ts).
  const ng = read("angular.json");
  const build = Object.values(ng.projects)[0].architect.build.options;
  (build.assets ??= []).push(
    { glob: "**/*", input: "data", output: "data", ignore: ["geocode-*.json"] },
    { glob: "maplibre-gl-worker.mjs", input: "node_modules/maplibre-gl/dist", output: "." },
  );
  build.styles = [
    { input: "node_modules/maplibre-gl/dist/maplibre-gl.css", bundleName: "maplibre-gl", inject: false },
    ...(build.styles ?? []),
  ];
  write("angular.json", ng);

  // Listen on 0.0.0.0 so the port is reachable from outside the container.
  const pkg = read("package.json");
  pkg.scripts.start = "ng serve --host 0.0.0.0";
  write("package.json", pkg);
'

# pnpm 11 fails if a dependency brings unapproved install scripts; these are the ones in Angular's build.
[ -f pnpm-workspace.yaml ] || cat > pnpm-workspace.yaml <<'EOF'
allowBuilds:
  '@parcel/watcher': true
  esbuild: true
  lmdb: true
  msgpackr-extract: true
EOF

pnpm add maplibre-gl@6
