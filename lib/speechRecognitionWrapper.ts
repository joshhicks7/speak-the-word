let available = false;
let mod: typeof import("expo-speech-recognition") | null = null;
try {
  mod = require("expo-speech-recognition");
  available = true;
} catch {
  mod = null;
}
export default { available, module: mod };
