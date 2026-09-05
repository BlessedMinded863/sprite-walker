/*
 * Fatal Instinct Sprite Walker — browser WASM motion-correction engine.
 *
 * The compiled C++ module used to be inlined as an ~15KB base64 string
 * directly in this file (window.FI_WASM_BASE64 = "AGFzbQ..."). It's now a
 * real binary asset at assets/motion-core.wasm, fetched at boot() time.
 * That keeps this file readable and lets git diff it sanely, and it's the
 * same module, byte for byte (decoded and verified against the original
 * inline blob when this project was split out).
 */
/* Fatal Instinct Sprite Walker V27.5
 * Typed browser runtime for C++ WebAssembly motion analysis/correction.
 */
const FI_JOINTS = [
    "pelvis", "neck",
    "left_shoulder", "left_elbow", "left_wrist",
    "right_shoulder", "right_elbow", "right_wrist",
    "left_hip", "left_knee", "left_ankle", "left_toe",
    "right_hip", "right_knee", "right_ankle", "right_toe",
    "tail_base", "tail_tip"
];
function fiMotionTypeCode(type) {
    switch (type) {
        case "walk": return 1;
        case "punch": return 2;
        case "kick": return 3;
        case "slash": return 4;
        default: return 0;
    }
}
function fiInferMotionType(motion) {
    const n = String(motion.name || "").toLowerCase();
    if (n.includes("walk"))
        return "walk";
    if (n.includes("punch") || n.includes("jab") || n.includes("cross") || n.includes("hook"))
        return "punch";
    if (n.includes("kick"))
        return "kick";
    if (n.includes("slash") || n.includes("claw"))
        return "slash";
    return "generic";
}
function fiDecodeBase64(base64) {
    const raw = atob(base64.replace(/\s+/g, ""));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++)
        bytes[i] = raw.charCodeAt(i);
    return bytes;
}
class FIWasmMotionEngine {
    constructor(wasm) {
        this.wasm = wasm;
    }
    static async fromURL(url) {
        const res = await fetch(url);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const result = await WebAssembly.instantiate(bytes, {});
        const exports = result.instance.exports;
        if (!exports.memory || typeof exports.fi_process !== "function") {
            throw new Error("Fatal Instinct WASM exports are incomplete.");
        }
        if (exports.fi_joint_count() !== FI_JOINTS.length) {
            throw new Error(`WASM joint count mismatch: ${exports.fi_joint_count()} != ${FI_JOINTS.length}`);
        }
        return new FIWasmMotionEngine(exports);
    }
    get version() { return this.wasm.fi_version(); }
    get maxFrames() { return this.wasm.fi_max_frames(); }
    correct(source, requestedType = "auto", targetQuality = 88) {
        if (!source || source.format !== "fatal-instinct-motion") {
            throw new Error("This is not a Fatal Instinct native motion package.");
        }
        if (!Array.isArray(source.samples) || source.samples.length < 2) {
            throw new Error("Motion needs at least two frames.");
        }
        if (source.samples.length > this.maxFrames) {
            throw new Error(`Browser C++ engine supports up to ${this.maxFrames} frames per pass.`);
        }
        const type = requestedType === "auto" ? fiInferMotionType(source) : requestedType;
        const frameCount = source.samples.length;
        const floatsRequired = frameCount * FI_JOINTS.length * 2;
        if (floatsRequired > this.wasm.fi_buffer_capacity()) {
            throw new Error("Motion exceeds C++ WebAssembly buffer capacity.");
        }
        const ptr = this.wasm.fi_buffer_ptr();
        const view = new Float32Array(this.wasm.memory.buffer, ptr, floatsRequired);
        let k = 0;
        for (let f = 0; f < frameCount; f++) {
            const sample = source.samples[f];
            for (const joint of FI_JOINTS) {
                const p = sample[joint];
                if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
                    throw new Error(`Frame ${f + 1} is missing valid ${joint} coordinates.`);
                }
                view[k++] = p[0];
                view[k++] = p[1];
            }
        }
        const rc = this.wasm.fi_process(frameCount, fiMotionTypeCode(type), targetQuality);
        if (rc < 0)
            throw new Error(`C++ WebAssembly engine rejected motion (${rc}).`);
        const samples = source.samples.map((original, frame) => {
            const next = { ...original };
            for (let j = 0; j < FI_JOINTS.length; j++) {
                const base = frame * FI_JOINTS.length * 2 + j * 2;
                next[FI_JOINTS[j]] = [view[base], view[base + 1]];
            }
            return next;
        });
        const before = this.wasm.fi_quality_before();
        const after = this.wasm.fi_quality_after();
        const report = {
            backend: "browser-wasm",
            engine_version: this.version,
            motion_type: type,
            quality_before: before,
            quality_after: after,
            grounding_after: this.wasm.fi_grounding(),
            foot_lock_after: this.wasm.fi_foot_lock(),
            limb_after: this.wasm.fi_limb_integrity(),
            continuity_after: this.wasm.fi_continuity(),
            opposition_after: this.wasm.fi_opposition(),
            joint_edits: this.wasm.fi_joint_edits(),
            iterations: this.wasm.fi_iterations(),
            improved: !!this.wasm.fi_improved(),
            pass: after >= targetQuality
        };
        const oldName = String(source.name || "Fatal Instinct Motion").replace(/ \[C\+\+ WASM Corrected\]$/i, "");
        const motion = {
            ...source,
            name: `${oldName} [C++ WASM Corrected]`,
            frames: frameCount,
            samples,
            cpp_motion_core: report,
            contacts_recompute_required: true
        };
        delete motion.contacts;
        return { motion, report };
    }
}
class FISpriteWalkerRuntime {
    constructor() {
        this.state = {
            engine: null,
            backend: "loading",
            lastError: null
        };
    }
    async boot(url = new URL('../assets/motion-core.wasm', import.meta.url)) {
        try {
            this.state.engine = await FIWasmMotionEngine.fromURL(url);
            this.state.backend = "browser-wasm";
            this.state.lastError = null;
            return true;
        }
        catch (error) {
            this.state.engine = null;
            this.state.backend = "offline";
            this.state.lastError = error instanceof Error ? error.message : String(error);
            return false;
        }
    }
    correct(motion, type, target = 88) {
        if (!this.state.engine)
            throw new Error("Browser C++ WebAssembly engine is not loaded.");
        return this.state.engine.correct(motion, type, target);
    }
}
export { FI_JOINTS, FIWasmMotionEngine, FISpriteWalkerRuntime, fiInferMotionType };
