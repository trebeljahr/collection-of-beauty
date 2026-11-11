import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A suspension inside the museum's <Canvas> with no boundary of its own
// leaves the canvas through R3F and hides the whole museum behind
// next/dynamic's fallback (scene-text.tsx). These drei exports and R3F's
// useLoader suspend while they load. A scene file takes text through
// SceneText, and anything else on this list needs a <Suspense> of its
// own before it joins the list of allowed files below.
const SUSPENDING_DREI = new Set([
  "Text",
  "Text3D",
  "useFont",
  "useTexture",
  "Image",
  "useGLTF",
  "Gltf",
  "useFBX",
  "useKTX2",
  "useVideoTexture",
  "useCubeTexture",
  "useMatcapTexture",
  "useNormalTexture",
  "Environment",
  "useEnvironment",
  "Svg",
  "Splat",
]);
const SUSPENDING_FIBER = new Set(["useLoader"]);

/** Files that wrap a suspending import in a boundary of their own. */
const ALLOWED = new Set(["scene-text.tsx"]);

function namedImports(source: string, from: string): string[] {
  const names: string[] = [];
  const pattern = new RegExp(
    `import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s+from\\s+["']${from.replace(/[/@-]/g, "\\$&")}["']`,
    "g",
  );
  for (const match of source.matchAll(pattern)) {
    for (const part of match[1].split(",")) {
      const name = part
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0];
      if (name) names.push(name);
    }
  }
  return names;
}

describe("scene files", () => {
  it("import nothing that suspends outside a boundary of its own", () => {
    const dir = path.resolve(__dirname);
    const offenders: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file) || ALLOWED.has(file)) continue;
      const source = readFileSync(path.join(dir, file), "utf8");
      for (const name of namedImports(source, "@react-three/drei")) {
        if (SUSPENDING_DREI.has(name)) offenders.push(`${file}: ${name} from @react-three/drei`);
      }
      for (const name of namedImports(source, "@react-three/fiber")) {
        if (SUSPENDING_FIBER.has(name)) offenders.push(`${file}: ${name} from @react-three/fiber`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("finds a suspending import when one is there", () => {
    const source = 'import { MapControls, Text as Label } from "@react-three/drei";';
    expect(namedImports(source, "@react-three/drei")).toEqual(["MapControls", "Text"]);
  });
});
