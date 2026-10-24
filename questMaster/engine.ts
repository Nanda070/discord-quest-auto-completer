/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Nandak070
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginNative } from "@utils/types";
import { showToast } from "@webpack/common";
import {
    BLACKLISTED_QUEST_ID,
    EVT,
    ICONS,
    PLUGIN_NAME,
    PLUGIN_VERSION,
    SYS,
} from "./constants";
import { Mods, loadModules } from "./mods";
import { settings } from "./settings";

declare const DiscordNative: any;
declare const VencordNative: any;

function getNative() {
    try {
        return VencordNative?.pluginHelpers?.QuestMaster as
            | PluginNative<typeof import("./native")>
            | undefined;
    } catch {
        return undefined;
    }
}

let fileLogPathLogged = false;
const fileLogQueue: string[] = [];
let fileLogFlushing = false;

async function flushFileLogs() {
    if (fileLogFlushing || !settings.store.fileLogging) return;
    const Native = getNative();
    if (!Native?.appendLog) return;

    fileLogFlushing = true;
    try {
        while (fileLogQueue.length) {
            const line = fileLogQueue.shift()!;
            const res = await Native.appendLog(line);
            if (!fileLogPathLogged && res?.path) {
                fileLogPathLogged = true;
                console.log(`[QuestMaster] File log: ${res.path}`);
            }
            if (res && res.ok === false && res.error) {
                console.debug("[QuestMaster] File log error:", res.error);
            }
        }
    } catch (e) {
        console.debug("[QuestMaster] File log flush failed:", e);
    } finally {
        fileLogFlushing = false;
        if (fileLogQueue.length) void flushFileLogs();
    }
}

function writeFileLog(type: string, msg: string) {
    if (!settings.store.fileLogging) return;
    const ts = new Date().toISOString();
    // Never dump multi-KB HTML 404 pages into the log file
    const safe = sanitizeErrText(msg, 500) || msg.slice(0, 500);
    fileLogQueue.push(`[${ts}] [${type.toUpperCase()}] ${safe}`);
    // Cap queue so a native outage cannot grow forever
    while (fileLogQueue.length > 500) fileLogQueue.shift();
    void flushFileLogs();
}

async function announceLogPath() {
    if (!settings.store.fileLogging) return;
    try {
        const Native = getNative();
        const path = (await Native?.getLogPath?.()) ?? null;
        if (path) {
            Logger.log(`[System] Logging to file: ${path}`, "info");
            writeFileLog("info", `=== QuestMaster ${CONFIG.VERSION} session start ===`);
        } else {
            Logger.log(
                "[System] File logging unavailable (native helpers missing — desktop Vencord required).",
                "warn"
            );
        }
    } catch (_) {}
}

const CONFIG = {
    NAME: PLUGIN_NAME,
    VERSION: PLUGIN_VERSION,
    THEME: "#5865F2",
    SUCCESS: "#3BA55C",
    WARN: "#faa61a",
    ERR: "#f04747",
    MAX_LOG_ITEMS: 60,
} as const;

const RUNTIME = {
    running: false,
    cleanups: new Set<() => void>(),
    autoEnroll: true,
    autoClaim: false,
    playSound: false,
    randomDelay: false,
};

/** Bumps on each start/stop so stale Traffic loops / UI promises exit cleanly */
let sessionId = 0;

let engineActive = false;
let mainPromise: Promise<void> | null = null;

/** Resolves a hanging quest-picker promise when STOP/shutdown runs */
let cancelPicker: ((data: PickerResult) => void) | null = null;
/** Resolves a hanging OAuth consent promise when STOP/shutdown runs */
let cancelConsent: ((granted: boolean) => void) | null = null;

type PickerResult = {
    selectedQuests: Set<string>;
    autoEnroll: boolean;
    autoClaim: boolean;
    playSound: boolean;
    randomDelay: boolean;
};

function emptyPickerResult(): PickerResult {
    return {
        selectedQuests: new Set(),
        autoEnroll: false,
        autoClaim: false,
        playSound: false,
        randomDelay: false,
    };
}

function syncRuntimeFromSettings() {
    RUNTIME.autoEnroll = settings.store.autoEnroll;
    RUNTIME.autoClaim = settings.store.autoClaim;
    RUNTIME.playSound = settings.store.playSound;
    RUNTIME.randomDelay = settings.store.randomDelay;
}

export function isRunning(): boolean {
    return engineActive;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const rnd = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

const esc = (s: any) =>
    String(s ?? "").replace(
        /[&<>"']/g,
        c =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[c] as string
    );

const notExpired = (q: any) => {
    const e = new Date(q.config?.expiresAt ?? 0).getTime();
    return Number.isNaN(e) || e > Date.now();
};

const isDesktop = () =>
    Mods.IS_DESKTOP || typeof DiscordNative !== "undefined";

/* ── audio cue ───────────────────────────────────────────────── */

const Sound = {
    _ctx: null as AudioContext | null,
    play(type: string) {
        if (!RUNTIME.playSound) return;
        try {
            const Ctx =
                window.AudioContext || (window as any).webkitAudioContext;
            if (!Ctx) return;
            if (!this._ctx || this._ctx.state === "closed") this._ctx = new Ctx();
            const ctx = this._ctx;
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.type = "sine";
            const t0 = ctx.currentTime;
            if (type === "done") {
                o.frequency.setValueAtTime(523.25, t0);
                o.frequency.setValueAtTime(659.25, t0 + 0.12);
                o.frequency.setValueAtTime(783.99, t0 + 0.24);
                g.gain.setValueAtTime(0.55, t0);
                g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
                o.start(t0);
                o.stop(t0 + 0.6);
            } else {
                o.frequency.value = 880;
                g.gain.setValueAtTime(0.45, t0);
                g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
                o.start(t0);
                o.stop(t0 + 0.2);
            }
        } catch (_) {}
    },
};

/* ── OAuth consent gate ────────────────────────────────────── */

const Consent = {
    _granted: new Set<string>(),
    TIMEOUT: 60000,
    SCOPES: [
        "identify",
        "applications.commands",
        "applications.entitlements",
    ] as const,
    ask(appId: string, appName: string | null): Promise<boolean> {
        if (this._granted.has(appId)) return Promise.resolve(true);
        return new Promise(resolve => {
            // Replace any prior consent wait (e.g. rapid re-open)
            cancelConsent?.(false);
            cancelConsent = resolve;

            const ov = document.createElement("div");
            ov.id = "orion-consent";
            ov.style.cssText =
                "position:fixed;inset:0;z-index:1002;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font-family:var(--font-primary);";
            ov.innerHTML = `<div style="width:420px;max-width:92vw;background:var(--background-base-low);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);box-shadow:var(--shadow-button-overlay);color:var(--text-default);overflow:hidden;">
                    <div style="padding:14px 16px;background:var(--background-mod-muted);border-bottom:1px solid var(--border-subtle);font-weight:700;color:var(--text-strong);">Authorize application?</div>
                    <div style="padding:16px;font-size:13px;line-height:1.5;">
                        <div>To complete this achievement quest, QuestMaster needs to OAuth-authorize this app on your Discord account:</div>
                        <div id="oc-app" style="font-weight:700;color:var(--text-strong);margin:6px 0;"></div>
                        <div style="color:var(--text-muted);">Scopes requested:</div>
                        <ul id="oc-scopes" style="margin:4px 0 10px;padding-left:18px;color:var(--text-muted);"></ul>
                        <div style="color:var(--text-feedback-warning);">The app's backend receives a real authorization code. QuestMaster revokes the grant immediately after the quest is marked complete. Discord enforcement against quest automation can affect the whole account.</div>
                        <label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:12px;color:var(--text-muted);">
                            <input type="checkbox" id="oc-remember" class="native-cb"> Don't ask again for this app this session</label>
                    </div>
                    <div style="display:flex;gap:10px;padding:12px 16px;border-top:1px solid var(--border-subtle);">
                        <button id="oc-no" class="quest-pick-btn deselect" style="flex:1;">Cancel</button>
                        <button id="oc-yes" class="quest-pick-btn start" style="flex:1;">Authorize</button>
                    </div></div>`;
            document.body.appendChild(ov);
            const appEl = ov.querySelector("#oc-app");
            if (appEl)
                appEl.textContent = appName
                    ? `${appName} (${appId})`
                    : `App ${appId}`;
            const ul = ov.querySelector("#oc-scopes");
            this.SCOPES.forEach(s => {
                const li = document.createElement("li");
                li.textContent = s;
                ul?.appendChild(li);
            });
            let done = false;
            const finish = (v: boolean) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                document.removeEventListener("keydown", onKey);
                if (cancelConsent === resolve) cancelConsent = null;
                if (v && (ov.querySelector("#oc-remember") as HTMLInputElement)?.checked)
                    this._granted.add(appId);
                ov.remove();
                resolve(v);
            };
            const onKey = (e: KeyboardEvent) => {
                if (e.key === "Escape") finish(false);
            };
            ov.querySelector("#oc-yes")?.addEventListener("click", () =>
                finish(true)
            );
            ov.querySelector("#oc-no")?.addEventListener("click", () =>
                finish(false)
            );
            ov.addEventListener("mousedown", e => {
                if (e.target === ov) finish(false);
            });
            document.addEventListener("keydown", onKey);
            const timer = setTimeout(() => finish(false), this.TIMEOUT);
        });
    },
};

/* ── error classification ─────────────────────────────────── */

function sanitizeErrText(raw: unknown, max = 180): string {
    if (raw == null) return "";
    let s = typeof raw === "string" ? raw : String(raw);
    if (/^\s*<!DOCTYPE html/i.test(s) || /^\s*<html/i.test(s)) {
        return "[HTML error page]";
    }
    s = s.replace(/\s+/g, " ").trim();
    return s.length > max ? `${s.slice(0, max)}…` : s;
}

const ErrorHandler = {
    RETRYABLE: new Set([429, 500, 502, 503, 504, 408]),
    CLIENT_ERRORS: new Set([400, 403, 404, 409, 410]),

    classify(error: any) {
        const status = error?.status ?? error?.statusCode;
        const rawMsg =
            error?.body?.message ??
            error?.message ??
            (typeof error?.body === "string" ? error.body : null) ??
            `HTTP ${status ?? "UNKNOWN"}`;
        return {
            isRetryable: this.RETRYABLE.has(status),
            isClientError: this.CLIENT_ERRORS.has(status),
            status,
            message: sanitizeErrText(rawMsg) || `HTTP ${status ?? "UNKNOWN"}`,
        };
    },

    isSkippableQuest(error: any) {
        const status = error?.status;
        return status === 404 || status === 403 || status === 410;
    },
};

/* ── UI + logger ──────────────────────────────────────────── */

type TaskData = {
    name?: string;
    type?: string;
    cur?: number;
    max?: number;
    status?: string;
    done?: boolean;
    pending?: boolean;
    failed?: boolean;
    removing?: boolean;
    claimable?: boolean;
    claimState?: string | null;
    actionRequired?: string | null;
    questId?: string;
    [key: string]: any;
};

const Logger = {
    root: null as HTMLElement | null,
    tasks: new Map<string, TaskData>(),
    tickerId: null as ReturnType<typeof setInterval> | null,
    _keydownHandler: null as ((e: KeyboardEvent) => void) | null,
    _bodyClickHandler: null as ((e: MouseEvent) => void) | null,

    init() {
        const oldUI = document.getElementById("orion-ui");
        if (oldUI) oldUI.remove();

        this.root = document.createElement("div");
        this.root.id = "orion-ui";
        this.root.innerHTML = `
                <div id="orion-head">
                    <span id="orion-title">${ICONS.BOLT} ${CONFIG.NAME}
                        <span style="opacity:0.6; font-size:10px; margin-left:4px; padding-top: 3px; font-weight:500;">${CONFIG.VERSION}</span>
                    </span>
                    <div id="orion-controls">
                        <span class="ctrl-btn ctrl-stop" id="orion-stop" title="Stop script">${ICONS.STOP} STOP</span>
                        <span class="ctrl-btn ctrl-hide" id="orion-close" title="Shift + .">HIDE</span>
                        <span class="ctrl-btn ctrl-opts" id="orion-opts" title="Options">${ICONS.OPT}</span>
                    </div>
                </div>
                <div id="orion-body"><div style="text-align:center; padding:30px; color:var(--text-muted); font-size:12px; font-weight:500;">Initializing System...</div></div>
                <div id="orion-logs"></div>
            `;
        document.body.appendChild(this.root);

        const head = document.getElementById("orion-head")!;

        let collapsed = false;
        head.addEventListener("dblclick", (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest(".ctrl-btn")) return;
            collapsed = !collapsed;
            if (this.root) this.root.style.height = collapsed ? "50px" : "";
        });

        head.addEventListener("mousedown", (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest(".ctrl-btn")) return;
            if (!this.root) return;

            head.classList.add("dragging");

            const startX = e.clientX,
                startY = e.clientY;
            const rect = this.root.getBoundingClientRect();
            const initialLeft = rect.left,
                initialTop = rect.top;

            this.root.style.left = `${initialLeft}px`;
            this.root.style.top = `${initialTop}px`;
            this.root.style.right = "auto";
            e.preventDefault();

            const onMouseMove = (ev: MouseEvent) => {
                if (!this.root) return;
                this.root.style.left = `${Math.max(0, Math.min(initialLeft + (ev.clientX - startX), window.innerWidth - this.root.offsetWidth))}px`;
                this.root.style.top = `${Math.max(0, Math.min(initialTop + (ev.clientY - startY), window.innerHeight - 50))}px`;
            };

            const onMouseUp = () => {
                head.classList.remove("dragging");
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });

        this._bodyClickHandler = async (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains("goto-btn")) {
                if (Mods.Router) Mods.Router.transitionTo("/quest-home");
                return;
            }

            if (target.classList.contains("retry-btn")) {
                const button = target as HTMLButtonElement;
                button.disabled = true;
                button.textContent = "RELOADING...";
                restartQuestMaster();
                return;
            }

            if (target.classList.contains("claim-btn")) {
                const btn = target as HTMLButtonElement;
                if (btn.disabled) return;

                const questId = btn.getAttribute("data-id");
                if (!questId) return;
                const taskData = this.tasks.get(questId);
                if (!taskData) return;

                btn.innerText = "WAITING...";
                btn.disabled = true;
                btn.style.opacity = "0.5";

                this.updateTask(questId, { ...taskData, claimState: "WAITING" });

                try {
                    const claimRes = await Tasks.claimReward(questId);
                    const claimed =
                        claimRes?.body?.claimed_at ??
                        claimRes?.body?.claimedAt ??
                        claimRes?.ok === true;

                    if (claimed) {
                        btn.innerText = "CLAIMED!";
                        this.log(
                            `[Claim] Reward for "${taskData.name}" claimed successfully!`,
                            "success"
                        );

                        this.updateTask(questId, {
                            ...taskData,
                            status: "CLAIMED",
                            claimable: false,
                            claimState: null,
                        });
                        setTimeout(() => this.removeTask(questId), 2000);
                    } else {
                        this.log(
                            `[Claim] Unexpected response for "${taskData.name}". Try Discord Gift Inventory.`,
                            "warn"
                        );
                        this.updateTask(questId, {
                            ...taskData,
                            claimState: "FAILED",
                        });
                    }
                } catch (err) {
                    this.log(
                        `[Claim] Action required for "${taskData.name}". Check Discord UI for captcha.`,
                        "warn"
                    );
                    this.updateTask(questId, {
                        ...taskData,
                        claimState: "FAILED",
                    });
                }
            }
        };
        document
            .getElementById("orion-body")
            ?.addEventListener("click", this._bodyClickHandler as any);

        document.getElementById("orion-close")!.onclick = () => this.toggle();
        document.getElementById("orion-stop")!.onclick = () =>
            stopQuestMaster();

        this._keydownHandler = (e: KeyboardEvent) => {
            if (e.key === ">" || (e.shiftKey && e.key === ".")) this.toggle();
        };
        document.addEventListener("keydown", this._keydownHandler);
        RUNTIME.cleanups.add(() => {
            if (this._keydownHandler)
                document.removeEventListener("keydown", this._keydownHandler);
        });

        document.getElementById("orion-opts")?.addEventListener("click", () => {
            const panel = document.getElementById("orion-options-panel");
            if (!panel) return;
            const open = panel.style.display === "none";
            panel.style.display = open ? "" : "none";
            const list = document.getElementById("orion-quest-list");
            if (list) list.style.display = open ? "none" : "";
            const actions = document.querySelector(
                "#orion-picker-form .picker-actions"
            ) as HTMLElement | null;
            if (actions) actions.style.display = open ? "none" : "";
        });

        this.startTicker();
    },

    toggle() {
        if (!this.root) return;
        this.root.style.display =
            this.root.style.display === "none" ? "flex" : "none";
    },

    shutdown() {
        if (!engineActive && !this.root) return;

        RUNTIME.running = false;
        this.log("[System] Stopping script & cleaning up...", "warn");

        // Unblock any pending picker / consent awaits
        const pickerCb = cancelPicker;
        cancelPicker = null;
        pickerCb?.(emptyPickerResult());

        const consentCb = cancelConsent;
        cancelConsent = null;
        consentCb?.(false);

        if (this.tickerId) {
            clearInterval(this.tickerId);
            this.tickerId = null;
        }

        for (const cleanupFn of RUNTIME.cleanups) {
            try {
                cleanupFn();
            } catch (e: any) {
                this.log(`[Cleanup] ${e.message}`, "debug");
            }
        }
        RUNTIME.cleanups.clear();

        Patcher.clean();

        document.getElementById("orion-consent")?.remove();

        const rootToRemove = this.root;
        this.root = null;

        setTimeout(() => {
            rootToRemove?.parentElement && rootToRemove.remove();
            this.tasks.clear();
            engineActive = false;
            mainPromise = null;
        }, 1000);
    },

    _getPct(t: TaskData) {
        if (t.done) return 100;
        if (t.pending || t.failed || !t.max) return 0;
        return Math.min(100, ((t.cur ?? 0) / t.max) * 100);
    },

    startTicker() {
        if (this.tickerId) clearInterval(this.tickerId);
        this.tickerId = setInterval(() => {
            if (!RUNTIME.running) {
                if (this.tickerId) clearInterval(this.tickerId);
                return;
            }
            for (const [id, task] of this.tasks.entries()) {
                // Only cosmetic for VIDEO — game/stream/activity progress must come from Discord API
                if (task.status === "RUNNING" && task.type === "VIDEO") {
                    const cur = Math.min((task.cur ?? 0) + 1, task.max ?? 0);
                    this.updateTask(id, { cur });
                }
            }
        }, 1000);
    },

    updateTask(id: string, data: Partial<TaskData>) {
        const oldData = this.tasks.get(id);
        const status = data.status ?? oldData?.status;
        const isPending = status === "PENDING" || status === "QUEUE";
        const isDone = status === "COMPLETED" || status === "CLAIMED";
        const isFailed = status === "FAILED";

        const newData: TaskData = {
            ...oldData,
            ...data,
            done: isDone,
            pending: isPending,
            failed: isFailed,
        };
        this.tasks.set(id, newData);

        if (
            oldData &&
            oldData.status === newData.status &&
            oldData.removing === newData.removing &&
            oldData.claimable === newData.claimable &&
            oldData.claimState === newData.claimState &&
            oldData.actionRequired === newData.actionRequired
        ) {
            const card = document.getElementById(`orion-task-${id}`);
            if (card) {
                const pct = this._getPct(newData);

                const iconContainer = card.querySelector(
                    ".task-icon"
                ) as HTMLElement | null;
                if (iconContainer)
                    iconContainer.style.setProperty("--p", `${pct}%`);

                const overlay = card.querySelector(".task-icon-overlay");
                if (overlay) overlay.textContent = `${Math.floor(pct)}%`;

                const progressText = card.querySelector(".progress-text");
                if (progressText) {
                    const unit = newData.type === "ACHIEVEMENT" ? "" : "s";
                    progressText.textContent = `${Math.min(Math.floor(newData.cur ?? 0), newData.max ?? 0)} / ${newData.max}${unit}`;
                }
                return;
            }
        }
        this.render();
    },

    removeTask(id: string) {
        if (this.tasks.has(id)) {
            const t = this.tasks.get(id)!;
            t.removing = true;
            this.render();
            setTimeout(() => {
                this.tasks.delete(id);
                this.render();
            }, 500);
        }
    },

    log(msg: string, type: string = "info") {
        const colors: Record<string, string> = {
            info: "#5865F2",
            success: "#3BA55C",
            warn: "#faa61a",
            err: "#f04747",
            debug: "#999",
        };
        console.log(
            `%c[${CONFIG.NAME}] %c${msg}`,
            `color: ${CONFIG.THEME}; font-weight: bold;`,
            `color: ${colors[type] || colors.info}`
        );
        writeFileLog(type, msg);
        try {
            const box = document.getElementById("orion-logs");
            if (box && type !== "debug") {
                const el = document.createElement("div");
                el.className = `log-item c-${type}`;
                el.innerHTML = `<span class="log-ts">${new Date().toLocaleTimeString().split(" ")[0]}</span> <span>${esc(msg)}</span>`;
                box.appendChild(el);
                box.scrollTop = box.scrollHeight;
                while (box.children.length > CONFIG.MAX_LOG_ITEMS)
                    box.firstChild?.remove();
            }
        } catch (e: any) {
            console.debug("[Logger] DOM error:", e.message);
        }
    },

    render() {
        if (document.getElementById("orion-picker-form")) return;
        const body = document.getElementById("orion-body");
        if (!body) return;
        if (!this.tasks.size) {
            body.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px;">Waiting for tasks...</div>`;
            return;
        }

        const sorted = [...this.tasks.entries()].sort((a, b) => {
            const ta = a[1],
                tb = b[1];
            if (ta.done !== tb.done) return ta.done ? 1 : -1;
            if (ta.failed !== tb.failed) return ta.failed ? 1 : -1;
            if (ta.pending !== tb.pending) return ta.pending ? 1 : -1;
            if (!ta.done && !ta.pending && !tb.done && !tb.pending) {
                const pctA = ta.max ? (ta.cur ?? 0) / ta.max : 0;
                const pctB = tb.max ? (tb.cur ?? 0) / tb.max : 0;
                return pctB - pctA;
            }
            return 0;
        });

        body.innerHTML = sorted
            .map(([id, t]) => {
                const pct =
                    t.pending || t.failed
                        ? 0
                        : Math.min(
                              100,
                              ((t.cur ?? 0) / (t.max || 1)) * 100
                          ).toFixed(1);
                const icon = t.done
                    ? ICONS.CHECK
                    : t.failed
                      ? ICONS.STOP
                      : t.pending
                        ? ICONS.CLOCK
                        : t.type === "VIDEO"
                          ? ICONS.VIDEO
                          : t.type === "ACHIEVEMENT"
                            ? ICONS.ACTIVITY
                            : t.type?.includes("GAME")
                              ? ICONS.GAME
                              : t.type?.includes("STREAM")
                                ? ICONS.STREAM
                                : ICONS.BOLT;

                let statusText =
                    t.status === "CLAIMED"
                        ? "CLAIMED"
                        : t.done
                          ? "COMPLETED"
                          : t.status;
                let progressLabel = t.pending
                    ? "In Queue"
                    : t.failed
                      ? "Aborted"
                      : "Progress";
                const unit = t.type === "ACHIEVEMENT" ? "" : "s";

                let actionBtn = "";

                if (t.claimable) {
                    if (t.claimState === "WAITING")
                        actionBtn = `<button class="claim-btn" disabled>WAITING...</button>`;
                    else if (t.claimState === "FAILED")
                        actionBtn = `<button class="claim-btn failed" disabled>ACTION REQUIRED</button>`;
                    else
                        actionBtn = `<button class="claim-btn" data-id="${id}">CLAIM REWARD</button>`;
                } else if (t.actionRequired === "ENROLL") {
                    statusText = "ACTION REQUIRED";
                    progressLabel = "Accept quest in Discord";
                    actionBtn = `<button class="goto-btn">GO TO QUESTS</button>`;
                } else if (t.type === "ACHIEVEMENT" && t.status === "RUNNING") {
                    statusText = "ACTION REQUIRED";
                    progressLabel = "Please, complete manually";
                    actionBtn = `<button class="goto-btn">GO TO QUESTS</button>`;
                }

                const stateClass = t.done
                    ? "done"
                    : t.failed
                      ? "failed"
                      : t.pending
                        ? "pending"
                        : "running";
                const removingClass = t.removing ? "removing" : "";

                let taskMetaHtml = "";
                if (!t.done) {
                    taskMetaHtml = `
                    <div class="task-meta">
                        <span>${progressLabel}</span>
                        ${actionBtn ? "" : `<span class="progress-text">${Math.min(Math.floor(t.cur ?? 0), t.max ?? 0)} / ${t.max}${unit}</span>`}
                    </div>`;
                }

                return `
                <div id="orion-task-${id}" class="task-card ${stateClass} ${removingClass}">
                    <div class="task-icon" style="--p: ${pct}%">
                        <div class="task-icon-inner">${icon}</div>
                        ${stateClass === "running" ? `<div class="task-icon-overlay">${Math.floor(Number(pct))}%</div>` : ""}
                    </div>
                    <div class="task-info">
                        <div class="task-status">${statusText}</div>
                        <div class="task-name" title="${esc(t.name)}">${esc(t.name)}</div>
                        ${taskMetaHtml}
                    </div>
                    ${actionBtn ? `<div class="task-actions">${actionBtn}</div>` : ""}
                </div>`;
            })
            .join("");
    },

    showEmptyState(message?: string) {
        const body = document.getElementById("orion-body");
        if (!body) return;

        const detail =
            message ??
            "All available quests are completed or claimed. Check Discord Quests for new quests, then retry.";

        body.innerHTML = `
            <div style="text-align:center; padding:30px 20px; color:var(--text-muted); font-size:13px;">
                <div style="font-size:16px; font-weight:700; color:var(--text-strong); margin-bottom:8px;">QuestMaster</div>
                <div style="margin-bottom:16px;">${esc(detail)}</div>
                <div style="display:flex; justify-content:center; gap:8px;">
                    <button class="quest-pick-btn goto-btn">GO TO QUESTS</button>
                    <button class="quest-pick-btn start retry-btn">RETRY</button>
                </div>
            </div>`;
    },

    showQuestPicker(quests: any[]): Promise<PickerResult> {
        return new Promise(resolve => {
            const body = document.getElementById("orion-body");
            const logs = document.getElementById("orion-logs");

            cancelPicker?.(emptyPickerResult());

            const closePicker = (data: PickerResult) => {
                if (cancelPicker === wrappedResolve) cancelPicker = null;
                if (logs) logs.style.display = "block";
                if (body) {
                    body.classList.remove("picker-mode");
                    body.innerHTML = "";
                }
                resolve(data);
            };

            const wrappedResolve = closePicker;
            cancelPicker = closePicker;

            if (!body) return closePicker(emptyPickerResult());
            if (logs) logs.style.display = "none";

            const items: {
                id: string;
                name: string;
                type: string;
                rewardType: number;
                rewardText: string;
                color: string;
            }[] = [];
            const rewardTypes = new Map<
                number,
                { label: string; count: number; type: number; color: string }
            >();
            const questTypes = new Set<string>();

            const REWARD_META: Record<
                number,
                { label: string; color: string }
            > = {
                1: { label: "IN-GAME", color: "#e67e22" },
                3: { label: "AVATAR DECORATION", color: "#a358f2" },
                4: { label: "ORBS", color: "#5865F2" },
            };
            const REWARD_FALLBACK = { label: "OTHER", color: "#949ba4" };

            quests.forEach(q => {
                const cfg = q.config?.taskConfig ?? q.config?.taskConfigV2;
                if (!cfg?.tasks) return;

                const typeData = Tasks.detectType(
                    cfg,
                    q.config?.application?.id
                );
                if (!typeData) return;
                if (
                    !isDesktop() &&
                    (typeData.type === "GAME" || typeData.type === "STREAM")
                )
                    return;

                const rw = q.config?.rewardsConfig?.rewards?.[0];
                const rewardType = rw?.type ?? 0;
                const rewardText = rw?.messages?.name ?? "Unknown Reward";

                const meta = REWARD_META[rewardType] ?? REWARD_FALLBACK;

                const displayType =
                    typeData.type === "WATCH_VIDEO" ? "VIDEO" : typeData.type;
                questTypes.add(displayType);

                if (!rewardTypes.has(rewardType)) {
                    rewardTypes.set(rewardType, {
                        label: meta.label,
                        count: 0,
                        type: rewardType,
                        color: meta.color,
                    });
                }
                rewardTypes.get(rewardType)!.count++;

                items.push({
                    id: q.id,
                    name: q.config?.messages?.questName ?? "Unknown Quest",
                    type: displayType,
                    rewardType,
                    rewardText,
                    color: meta.color,
                });
            });

            if (!items.length) return closePicker(emptyPickerResult());

            const buildCard = (q: (typeof items)[0]) => `
                    <label class="quest-pick" data-rt="${q.rewardType}" data-qt="${q.type}" style="border-left-color: ${q.color};">
                        <input type="checkbox" name="quests" value="${q.id}" class="native-cb" checked>
                        <div class="task-info">
                            <div class="task-name" title="${esc(q.name)}">${esc(q.name)}</div>
                            <div class="task-meta" style="justify-content: flex-start; gap: 8px;">
                                <span style="text-transform: uppercase; color: var(--text-subtle);">${esc(q.type)}</span>
                                <span style="color: ${q.color};">${esc(q.rewardText)}</span>
                            </div>
                        </div>
                    </label>`;

            const buildToggle = (
                name: string,
                label: string,
                isChecked: boolean
            ) => `
                    <div class="orion-option">
                        <span class="orion-option-label">${label}</span>
                        <input type="checkbox" name="${name}" class="native-toggle" ${isChecked ? "checked" : ""}>
                    </div>`;

            body.innerHTML = `
                    <form id="orion-picker-form">
                        <div id="orion-options-panel" style="display:none;">
                            ${
                                rewardTypes.size > 1
                                    ? `
                                <div class="picker-section-title">Filter By Reward</div>
                                <div class="reward-filters">
                                    ${[...rewardTypes.values()].map(rt => `<button type="button" class="reward-filter" data-rt="${rt.type}" style="color: ${rt.color}; border-color: ${rt.color};">${rt.label} (${rt.count})</button>`).join("")}
                                </div>
                            `
                                    : ""
                            }
                            ${
                                questTypes.size > 1
                                    ? `
                                <div class="picker-section-title">Filter By Type</div>
                                <div class="reward-filters">
                                    ${[...questTypes].map(t => `<button type="button" class="type-filter" data-qt="${t}">${t}</button>`).join("")}
                                </div>
                            `
                                    : ""
                            }
                            <div class="picker-section-title">Options</div>
                            <div class="picker-options">
                                ${buildToggle("autoEnroll", "Auto-enroll in quests", RUNTIME.autoEnroll)}
                                ${buildToggle("autoClaim", "Auto-claim rewards", RUNTIME.autoClaim)}
                                ${buildToggle("playSound", "Sound on completion", RUNTIME.playSound)}
                                ${buildToggle("randomDelay", "Random 1-30min delay between cycles", RUNTIME.randomDelay)}
                            </div>
                        </div>

                        <div id="orion-quest-list" class="picker-quest-list">${items.map(buildCard).join("")}
                            <div id="orion-no-quests" style="display: none; margin: auto; text-align: center; color: var(--text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                                No quests available
                            </div>
                        </div>

                        <div class="picker-actions">
                            <button type="button" class="quest-pick-btn deselect" id="select-all-btn">DESELECT ALL</button>
                            <button type="submit" class="quest-pick-btn start" id="start-btn">${ICONS.BOLT} <span id="start-btn-text">START (${items.length})</span></button>
                        </div>
                    </form>`;

            const form = document.getElementById(
                "orion-picker-form"
            ) as HTMLFormElement;
            const selectAllBtn = document.getElementById(
                "select-all-btn"
            ) as HTMLButtonElement;
            const startBtn = document.getElementById(
                "start-btn"
            ) as HTMLButtonElement;

            const getVisibleCheckboxes = () =>
                Array.from(
                    form.querySelectorAll(
                        '.quest-pick input[type="checkbox"]'
                    )
                ).filter(
                    cb =>
                        !(cb as HTMLElement)
                            .closest(".quest-pick")
                            ?.classList.contains("hidden")
                ) as HTMLInputElement[];

            const syncUI = () => {
                const visibleCbs = getVisibleCheckboxes();
                const totalChecked = visibleCbs.filter(cb => cb.checked).length;

                const startBtnText = document.getElementById("start-btn-text");
                if (startBtnText)
                    startBtnText.textContent = `START (${totalChecked})`;
                startBtn.disabled = totalChecked === 0;

                if (visibleCbs.length === 0) {
                    selectAllBtn.disabled = true;
                    selectAllBtn.textContent = "SELECT ALL";
                } else {
                    selectAllBtn.disabled = false;
                    selectAllBtn.textContent = visibleCbs.every(cb => cb.checked)
                        ? "DESELECT ALL"
                        : "SELECT ALL";
                }

                const noQuestsMsg = document.getElementById("orion-no-quests");
                if (noQuestsMsg) {
                    noQuestsMsg.style.display =
                        visibleCbs.length === 0 ? "block" : "none";
                }
            };

            form.addEventListener("change", e => {
                if ((e.target as HTMLInputElement).name === "quests") syncUI();
            });

            const activeRewards = new Set(
                [...rewardTypes.keys()].map(String)
            );
            const activeTypes = new Set([...questTypes]);

            const applyFilters = () => {
                form.querySelectorAll(".quest-pick").forEach(el => {
                    const rt = el.getAttribute("data-rt");
                    const qt = el.getAttribute("data-qt");
                    el.classList.toggle(
                        "hidden",
                        !(
                            activeRewards.has(rt!) &&
                            activeTypes.has(qt!)
                        )
                    );
                });
                syncUI();
            };

            const FILTER_KINDS = [
                {
                    cls: "reward-filter",
                    attr: "data-rt",
                    set: activeRewards,
                },
                { cls: "type-filter", attr: "data-qt", set: activeTypes },
            ];

            form.addEventListener("click", e => {
                const target = e.target as HTMLElement;
                const kind = FILTER_KINDS.find(k =>
                    target.classList.contains(k.cls)
                );
                if (kind) {
                    e.preventDefault();
                    const value = target.getAttribute(kind.attr)!;
                    target.classList.toggle("off");
                    if (target.classList.contains("off")) kind.set.delete(value);
                    else kind.set.add(value);
                    applyFilters();
                    return;
                }

                if (target.id === "select-all-btn") {
                    e.preventDefault();
                    const visibleCbs = getVisibleCheckboxes();
                    if (visibleCbs.length === 0) return;

                    const shouldCheck = !visibleCbs.every(cb => cb.checked);
                    visibleCbs.forEach(cb => {
                        cb.checked = shouldCheck;
                    });
                    syncUI();
                }
            });

            form.addEventListener("submit", e => {
                e.preventDefault();

                const selected = getVisibleCheckboxes().filter(cb => cb.checked);
                if (selected.length === 0) return;

                const data = new FormData(form);

                closePicker({
                    selectedQuests: new Set(selected.map(cb => cb.value)),
                    autoEnroll: data.has("autoEnroll"),
                    autoClaim: data.has("autoClaim"),
                    playSound: data.has("playSound"),
                    randomDelay: data.has("randomDelay"),
                });
            });

            body.classList.add("picker-mode");
            syncUI();
        });
    },
};

/* ── request queue ──────────────────────────────────────────── */

const Traffic = {
    queue: [] as {
        url: string;
        body: any;
        resolve: (v: any) => void;
        reject: (e: any) => void;
        attempts: number;
    }[],
    processing: false,
    /** Session that owns the current process() loop */
    ownerSession: 0,

    async enqueue(url: string, body: any): Promise<any> {
        if (!RUNTIME.running) return Promise.reject(new Error("Stopped"));
        return new Promise((resolve, reject) => {
            this.queue.push({ url, body, resolve, reject, attempts: 0 });
            this.process();
        });
    },

    reset() {
        const pending = this.queue.splice(0);
        pending.forEach(req => req.reject(new Error("Shutdown")));
        // Do not force processing=false while an old loop may still be mid-await;
        // bumping sessionId makes that loop exit after its current request.
        this.ownerSession = sessionId;
    },

    async process() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;
        const mySession = sessionId;
        this.ownerSession = mySession;

        while (this.queue.length > 0) {
            if (!RUNTIME.running || mySession !== sessionId) {
                this.queue.forEach(req => req.reject(new Error("Shutdown")));
                this.queue = [];
                this.processing = false;
                return;
            }

            const req = this.queue.shift()!;
            try {
                const res = await Mods.API.post({
                    url: req.url,
                    body: req.body,
                });
                if (mySession !== sessionId) {
                    req.reject(new Error("Shutdown"));
                    continue;
                }
                req.resolve(res);
            } catch (e: any) {
                if (mySession !== sessionId) {
                    req.reject(new Error("Shutdown"));
                    continue;
                }
                const err = ErrorHandler.classify(e);

                if (err.isRetryable && req.attempts < SYS.MAX_RETRIES) {
                    req.attempts++;
                    const delay =
                        (e.body?.retry_after ?? Math.pow(2, req.attempts)) *
                        1000;
                    const isGlobal = e.body?.global === true;

                    Logger.log(
                        `[Network] Retry ${req.attempts}/${SYS.MAX_RETRIES} in ${(delay / 1000).toFixed(1)}s (HTTP ${err.status})`,
                        "warn"
                    );

                    const retryJitter = rnd(200, 800);

                    if (isGlobal) {
                        this.queue.unshift(req);
                        await sleep(delay + retryJitter);
                    } else {
                        setTimeout(() => {
                            if (RUNTIME.running && mySession === sessionId) {
                                this.queue.push(req);
                                this.process();
                            } else {
                                req.reject(new Error("Shutdown"));
                            }
                        }, delay + retryJitter);
                    }
                } else if (err.isClientError) {
                    Logger.log(
                        `[Network] HTTP ${err.status}: ${req.url}`,
                        "debug"
                    );
                    req.reject(e);
                } else {
                    Logger.log(
                        `[Network] Request to ${req.url} failed: ${err.message}`,
                        "err"
                    );
                    req.reject(e);
                }
            }

            if (mySession !== sessionId) {
                this.processing = false;
                return;
            }
            await sleep(rnd(1200, 1800));
        }
        this.processing = false;
    },
};

/* ── store patching ─────────────────────────────────────────── */

const Patcher = {
    games: [] as any[],
    realGames: null as ((...args: any[]) => any) | null,
    realPID: null as ((...args: any[]) => any) | null,
    active: false,
    /** Real games snapshot at last exclusive spoof (restored on clean) */
    displaced: [] as any[],

    init(Store: any) {
        if (!Store) return;
        // Always capture the pristine originals once
        if (!this.realGames) this.realGames = Store.getRunningGames.bind(Store);
        if (!this.realPID) this.realPID = Store.getGameForPID.bind(Store);
    },

    /** aamiaa-style: Discord must see ONLY the spoofed game(s), not a merge */
    applyExclusive() {
        if (!Mods.RunStore || !this.realGames || !this.realPID) return;
        try {
            this.displaced = [...(this.realGames() || [])];
        } catch {
            this.displaced = [];
        }
        Mods.RunStore.getRunningGames = () => [...this.games];
        Mods.RunStore.getGameForPID = (pid: number) =>
            this.games.find(g => g.pid === pid) || null;
        this.active = true;
        Mods.Dispatcher?.dispatch({
            type: EVT.GAME,
            removed: this.displaced,
            added: [...this.games],
            games: [...this.games],
        });
        if (this.games[0]) this.rpc(this.games[0]);
    },

    restore() {
        if (!Mods.RunStore || !this.realGames || !this.realPID) return;
        const spoofed = [...this.games];
        Mods.RunStore.getRunningGames = this.realGames;
        Mods.RunStore.getGameForPID = this.realPID;
        this.active = false;
        let restored: any[] = [];
        try {
            restored = [...(this.realGames() || [])];
        } catch {
            restored = [];
        }
        Mods.Dispatcher?.dispatch({
            type: EVT.GAME,
            removed: spoofed,
            added: restored,
            games: restored,
        });
        this.rpc(null);
        this.displaced = [];
    },

    add(g: any) {
        if (this.games.some(x => x.pid === g.pid)) return;
        this.games.push(g);
        this.applyExclusive();
    },

    remove(g: any) {
        const before = this.games.length;
        this.games = this.games.filter(x => x.pid !== g.pid);
        if (this.games.length === before) return;

        if (!this.games.length) {
            this.restore();
        } else {
            this.applyExclusive();
        }
    },

    rpc(g: any) {
        if (settings.store.hideActivity && g) return;
        try {
            Mods.Dispatcher?.dispatch({
                type: EVT.RPC,
                socketId: null,
                pid: g ? g.pid : 9999,
                activity: g
                    ? {
                          application_id: g.id,
                          name: g.name,
                          type: 0,
                          details: null,
                          state: null,
                          timestamps: { start: g.start },
                          icon: g.icon,
                          assets: null,
                      }
                    : null,
            });
        } catch (e: any) {
            Logger.log(`[RPC Cleanup] ${e.message}`, "debug");
        }
    },

    clean() {
        this.games = [];
        if (this.active) this.restore();
        else this.rpc(null);
    },
};

/* ── task handlers ──────────────────────────────────────────── */

type TaskInfo = {
    id: string;
    appId: any;
    name: string;
    target: number;
    type: string;
    keyName: string;
};

const Tasks = {
    skipped: new Set<string>(),

    sanitize(name: string) {
        return name
            .replace(/[^a-zA-Z0-9 ]/g, "")
            .trim()
            .replace(/\s+/g, " ");
    },

    detectType(cfg: any, applicationId: any) {
        const taskKeys = Object.keys(cfg.tasks);
        // Exact keys first, then fuzzy — never let "PLAY" steal PLAY_ACTIVITY
        const typeMap = [
            { key: "ACHIEVEMENT_IN_ACTIVITY", type: "ACHIEVEMENT" },
            { key: "WATCH_VIDEO_ON_MOBILE", type: "WATCH_VIDEO" },
            { key: "WATCH_VIDEO", type: "WATCH_VIDEO" },
            { key: "PLAY_ON_DESKTOP_V2", type: "GAME" },
            { key: "STREAM_ON_DESKTOP", type: "STREAM" },
            { key: "PLAY_ON_DESKTOP", type: "GAME" },
            { key: "PLAY_ACTIVITY", type: "ACTIVITY" },
            { key: "STREAM", type: "STREAM" },
            { key: "VIDEO", type: "WATCH_VIDEO" },
            { key: "ACTIVITY", type: "ACTIVITY" },
            { key: "PLAY", type: "GAME" },
        ];

        for (const { key, type } of typeMap) {
            if (taskKeys.includes(key)) {
                return {
                    type,
                    keyName: key,
                    target: cfg.tasks[key]?.target ?? 0,
                };
            }
        }

        for (const { key, type } of typeMap) {
            // Skip short ambiguous tokens in fuzzy pass
            if (key === "PLAY" || key === "STREAM" || key === "VIDEO" || key === "ACTIVITY")
                continue;
            const keyName = taskKeys.find(k => k.includes(key));
            if (keyName)
                return {
                    type,
                    keyName,
                    target: cfg.tasks[keyName]?.target ?? 0,
                };
        }

        if (applicationId) {
            return {
                type: "GAME",
                keyName: taskKeys[0] ?? "PLAY_ON_DESKTOP",
                target: cfg.tasks[taskKeys[0]]?.target ?? 0,
            };
        }

        return null;
    },

    async fetchGameData(appId: any, appName: string) {
        try {
            const res = await Mods.API.get({
                url: `/applications/public?application_ids=${appId}`,
            });
            const appData = res?.body?.[0];
            const exeEntry = appData?.executables?.find(
                (x: any) => x.os === "win32"
            );
            const rawExe = exeEntry
                ? exeEntry.name.replace(">", "")
                : `${this.sanitize(appName)}.exe`;
            const cleanName = this.sanitize(appData?.name || appName);

            return {
                name: appData?.name || appName,
                icon: appData?.icon,
                exeName: rawExe,
                cmdLine: `C:\\Program Files\\${cleanName}\\${rawExe}`,
                exePath: `c:/program files/${cleanName.toLowerCase()}/${rawExe}`,
                id: appId,
            };
        } catch (e: any) {
            const err = ErrorHandler.classify(e);
            Logger.log(
                `[FetchGame] Fallback for ${appName}: HTTP ${err.status ?? "?"} ${err.message}`,
                "debug"
            );
            const cleanName = this.sanitize(appName);
            const safeExe = `${cleanName.replace(/\s+/g, "")}.exe`;
            return {
                name: appName,
                exeName: safeExe,
                cmdLine: `C:\\Program Files\\${cleanName}\\${safeExe}`,
                exePath: `c:/program files/${cleanName.toLowerCase()}/${safeExe}`,
                id: appId,
            };
        }
    },

    async claimReward(questId: string) {
        return await Mods.API.post({
            url: `/quests/${questId}/claim-reward`,
            body: {
                platform: 0,
                location: 11,
                is_targeted: false,
                metadata_raw: null,
                metadata_sealed: null,
                traffic_metadata_raw: null,
                traffic_metadata_sealed: null,
            },
        });
    },

    failTask(q: any, t: TaskInfo, reason: string) {
        const currentProgress = Logger.tasks.get(q.id)?.cur ?? 0;
        Logger.updateTask(q.id, {
            name: t.name,
            type: t.type,
            cur: currentProgress,
            max: t.target,
            status: "FAILED",
        });
        Logger.log(`[Task] Aborted "${t.name}": ${reason}`, "err");
        Tasks.skipped.add(q.id);
        setTimeout(() => Logger.removeTask(q.id), 2000);
    },

    async ensureEnrolled(q: any): Promise<any> {
        let quest =
            Mods.QuestStore?.getQuest?.(q.id) ??
            (Mods.QuestStore?.quests instanceof Map
                ? Mods.QuestStore.quests.get(q.id)
                : null) ??
            q;

        if (quest?.userStatus?.enrolledAt) return quest;

        Logger.log(`[Enroll] Accepting quest ${q.id}…`, "info");
        await Traffic.enqueue(`/quests/${q.id}/enroll`, {
            location: 11,
            is_targeted: false,
        });
        await sleep(rnd(800, 1500));

        quest =
            Mods.QuestStore?.getQuest?.(q.id) ??
            (Mods.QuestStore?.quests instanceof Map
                ? Mods.QuestStore.quests.get(q.id)
                : null) ??
            quest;

        if (!quest?.userStatus?.enrolledAt) {
            // Store may lag — synthesize enrolledAt for rate limiting
            quest = {
                ...quest,
                userStatus: {
                    ...(quest?.userStatus || {}),
                    enrolledAt: new Date().toISOString(),
                },
            };
        }
        return quest;
    },

    async VIDEO(q: any, t: TaskInfo, s: any) {
        // Match working completers: integer timestamps, never ahead of wall-clock since enroll
        const SPEED = 7;
        const MAX_FUTURE = 10;
        const TICK_MS = 1000;

        let quest = q;
        try {
            quest = await this.ensureEnrolled(q);
        } catch (e: any) {
            const err = ErrorHandler.classify(e);
            Logger.log(
                `[Video] Enroll failed (HTTP ${err.status ?? "?"}): ${err.message}`,
                "warn"
            );
            // Still try progress — user may already be enrolled in UI
        }

        const enrolledAt = new Date(
            quest?.userStatus?.enrolledAt ?? Date.now()
        ).getTime();

        let cur = Math.floor(
            s?.progress?.[t.keyName]?.value ??
                quest?.userStatus?.progress?.[t.keyName]?.value ??
                s?.progress?.WATCH_VIDEO?.value ??
                s?.progress?.WATCH_VIDEO_ON_MOBILE?.value ??
                0
        );
        let failCount = 0;
        let completed = false;

        Logger.updateTask(q.id, {
            name: t.name,
            type: "VIDEO",
            cur,
            max: t.target,
            status: "RUNNING",
        });
        Logger.log(
            `[Task] VIDEO "${t.name}" ${cur}/${t.target}s (enrolled rate-limit on)`,
            "info"
        );

        const startTime = Date.now();
        const readVideoProgress = (body: any) =>
            body?.progress?.[t.keyName]?.value ??
            body?.progress?.WATCH_VIDEO?.value ??
            body?.progress?.WATCH_VIDEO_ON_MOBILE?.value;

        while (cur < t.target && RUNTIME.running) {
            if (Date.now() - startTime > SYS.MAX_TIME) {
                return Tasks.failTask(q, t, "Timeout exceeded");
            }

            const maxAllowed =
                Math.floor((Date.now() - enrolledAt) / 1000) + MAX_FUTURE;
            const room = maxAllowed - cur;

            if (room < 1) {
                // Would run ahead of real time — wait
                await sleep(TICK_MS);
                continue;
            }

            const step = Math.min(SPEED, room, t.target - cur);
            const timestamp = Math.min(
                t.target,
                Math.floor(cur + step + Math.random())
            );

            try {
                const r = await Traffic.enqueue(
                    `/quests/${q.id}/video-progress`,
                    { timestamp }
                );
                completed = r?.body?.completed_at != null;
                const serverVal = readVideoProgress(r?.body);
                if (typeof serverVal === "number")
                    cur = Math.max(cur, Math.floor(serverVal));
                else cur = Math.max(cur, timestamp);

                failCount = 0;
                Logger.updateTask(q.id, {
                    name: t.name,
                    type: "VIDEO",
                    cur,
                    max: t.target,
                    status: "RUNNING",
                });
                Logger.log(
                    `[Task] VIDEO "${t.name}": ${cur}/${t.target}s`,
                    "info"
                );

                if (completed || cur >= t.target) break;
            } catch (e: any) {
                failCount++;
                const err = ErrorHandler.classify(e);
                Logger.log(
                    `[Video] progress HTTP ${err.status ?? "?"}: ${err.message}`,
                    "warn"
                );

                // 404 often = not enrolled yet / store lag — re-enroll and keep trying
                if (err.status === 404 || err.status === 403) {
                    try {
                        quest = await this.ensureEnrolled(q);
                        Logger.log(
                            `[Video] Re-enrolled, retrying…`,
                            "info"
                        );
                    } catch (_) {}
                    await sleep(rnd(2000, 4000));
                } else if (err.isClientError && err.status !== 429) {
                    // Other hard client errors after several tries
                    if (failCount >= SYS.MAX_TASK_FAILURES) {
                        return Tasks.failTask(
                            q,
                            t,
                            `Client Error ${err.status}`
                        );
                    }
                } else if (failCount >= SYS.MAX_TASK_FAILURES) {
                    return Tasks.failTask(q, t, "Too many network failures");
                } else {
                    await sleep(rnd(1500, 3000));
                }
                continue;
            }

            await sleep(TICK_MS);
        }

        if (RUNTIME.running && (completed || cur >= t.target)) {
            if (!completed) {
                try {
                    await Traffic.enqueue(`/quests/${q.id}/video-progress`, {
                        timestamp: Math.floor(t.target),
                    });
                } catch (_) {}
            }
            Tasks.finish(q, { ...t, type: "VIDEO" });
        }
    },

    GAME(q: any, t: TaskInfo, s: any) {
        return Tasks.generic(
            q,
            t,
            "GAME",
            t.keyName || "PLAY_ON_DESKTOP",
            s
        );
    },
    STREAM(q: any, t: TaskInfo, s: any) {
        return Tasks.generic(
            q,
            t,
            "STREAM",
            t.keyName || "STREAM_ON_DESKTOP",
            s
        );
    },

    /** Read live progress from QuestStore / heartbeat payload */
    readQuestProgress(questId: string, key: string, fallback = 0): number {
        try {
            const live =
                Mods.QuestStore?.getQuest?.(questId) ??
                (Mods.QuestStore?.quests instanceof Map
                    ? Mods.QuestStore.quests.get(questId)
                    : Mods.QuestStore?.quests?.[questId]);
            const p = live?.userStatus?.progress;
            const v =
                p?.[key]?.value ??
                p?.PLAY_ON_DESKTOP?.value ??
                p?.PLAY_ON_DESKTOP_V2?.value ??
                p?.STREAM_ON_DESKTOP?.value ??
                live?.userStatus?.streamProgressSeconds;
            if (typeof v === "number") return v;
        } catch (_) {}
        return fallback;
    },

    async generic(q: any, t: TaskInfo, type: string, key: string, s: any) {
        if (!RUNTIME.running) return;
        const gameData = await this.fetchGameData(t.appId, t.name);

        // aamiaa-style pid (not * 4)
        const pid = Math.floor(Math.random() * 30000) + 1000;
        const game = {
            cmdLine: gameData.cmdLine,
            exeName: gameData.exeName,
            exePath: gameData.exePath,
            hidden: false,
            isLauncher: false,
            id: gameData.id,
            name: gameData.name,
            pid,
            pidPath: [pid],
            processName: gameData.name,
            start: Date.now(),
            icon: gameData.icon,
        };

        let cleanupHook: () => void = () => {};
        let cleaned = false;
        let cur =
            s?.progress?.[key]?.value ??
            s?.progress?.PLAY_ON_DESKTOP?.value ??
            s?.progress?.PLAY_ON_DESKTOP_V2?.value ??
            s?.progress?.STREAM_ON_DESKTOP?.value ??
            0;

        if (type === "STREAM") {
            const real = Mods.StreamStore?.getStreamerActiveStreamMetadata;
            if (Mods.StreamStore) {
                Mods.StreamStore.getStreamerActiveStreamMetadata = () => ({
                    id: gameData.id,
                    pid,
                    sourceName: null,
                });
            }
            cleanupHook = () => {
                if (Mods.StreamStore && real)
                    Mods.StreamStore.getStreamerActiveStreamMetadata = real;
            };
            Logger.log(
                `[Task] Spoofed STREAM for ${gameData.name}. Join a VC with ≥1 person and stream any window.`,
                "warn"
            );
        } else {
            Patcher.add(game);
            cleanupHook = () => Patcher.remove(game);
            Logger.log(
                `[Task] Spoofed GAME ${gameData.name}. Waiting for Discord heartbeats…`,
                "info"
            );
        }

        Logger.updateTask(q.id, {
            name: t.name,
            type,
            cur,
            max: t.target,
            status: "RUNNING",
        });

        const check = (d: any) => {
            if (!RUNTIME.running || d?.questId !== q.id) return;
            const prog =
                (typeof d?.userStatus?.progress?.[key]?.value === "number"
                    ? Math.floor(d.userStatus.progress[key].value)
                    : null) ??
                (typeof d?.userStatus?.progress?.PLAY_ON_DESKTOP?.value ===
                "number"
                    ? Math.floor(d.userStatus.progress.PLAY_ON_DESKTOP.value)
                    : null) ??
                (typeof d?.userStatus?.progress?.PLAY_ON_DESKTOP_V2?.value ===
                "number"
                    ? Math.floor(d.userStatus.progress.PLAY_ON_DESKTOP_V2.value)
                    : null) ??
                (typeof d?.userStatus?.progress?.STREAM_ON_DESKTOP?.value ===
                "number"
                    ? Math.floor(d.userStatus.progress.STREAM_ON_DESKTOP.value)
                    : null) ??
                d?.userStatus?.streamProgressSeconds ??
                0;
            if (prog > cur) {
                cur = prog;
                Logger.updateTask(q.id, {
                    name: t.name,
                    type,
                    cur,
                    max: t.target,
                    status: "RUNNING",
                });
                Logger.log(
                    `[Task] ${t.name}: ${Math.floor(cur)}/${t.target}s`,
                    "info"
                );
            }
        };

        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            try {
                cleanupHook();
            } catch (e: any) {
                Logger.log(`[Task] Cleanup: ${e.message}`, "debug");
            }
            try {
                Mods.Dispatcher?.unsubscribe(EVT.HEARTBEAT, check);
            } catch (_) {}
            RUNTIME.cleanups.delete(cleanup);
        };

        Mods.Dispatcher?.subscribe(EVT.HEARTBEAT, check);
        RUNTIME.cleanups.add(cleanup);

        // Soft heartbeats — never abort the quest on 4xx (Discord may reject some keys)
        const appId = String(gameData.id ?? t.appId ?? "");
        const softKeys = [
            `call:${q.id}:1`,
            appId ? `game:${appId}` : null,
        ].filter(Boolean) as string[];
        let keyIdx = 0;

        const startTime = Date.now();
        try {
            while (cur < t.target && RUNTIME.running) {
                // Prefer live QuestStore progress (what Discord UI shows)
                const storeProg = Tasks.readQuestProgress(q.id, key, cur);
                if (storeProg > cur) {
                    cur = storeProg;
                    Logger.updateTask(q.id, {
                        name: t.name,
                        type,
                        cur,
                        max: t.target,
                        status: "RUNNING",
                    });
                }

                if (cur >= t.target) break;

                // Soft API nudge (non-fatal)
                const sk = softKeys[keyIdx % softKeys.length];
                try {
                    const r = await Traffic.enqueue(`/quests/${q.id}/heartbeat`, {
                        stream_key: sk,
                        terminal: false,
                    });
                    const body = r?.body;
                    const v =
                        body?.progress?.[key]?.value ??
                        body?.progress?.PLAY_ON_DESKTOP?.value ??
                        body?.progress?.PLAY_ON_DESKTOP_V2?.value ??
                        body?.progress?.STREAM_ON_DESKTOP?.value ??
                        body?.streamProgressSeconds;
                    if (typeof v === "number" && v > cur) {
                        cur = v;
                        Logger.updateTask(q.id, {
                            name: t.name,
                            type,
                            cur,
                            max: t.target,
                            status: "RUNNING",
                        });
                        Logger.log(
                            `[Task] ${t.name}: ${Math.floor(cur)}/${t.target}s (api)`,
                            "info"
                        );
                    }
                } catch (e: any) {
                    const status = e?.status ?? e?.statusCode;
                    // Rotate stream_key on rejection; never failTask from soft heartbeat
                    if (status === 400 || status === 404) keyIdx++;
                    Logger.log(
                        `[Task] Soft heartbeat ${sk} → HTTP ${status ?? "err"} (ignored)`,
                        "debug"
                    );
                }

                if (Date.now() - startTime > SYS.MAX_TIME) {
                    return Tasks.failTask(q, t, "Timeout exceeded (25m)");
                }
                await sleep(rnd(15000, 20000));
            }

            if (RUNTIME.running && cur >= t.target) {
                try {
                    await Traffic.enqueue(`/quests/${q.id}/heartbeat`, {
                        stream_key: softKeys[0],
                        terminal: true,
                    });
                } catch (_) {}
                Tasks.finish(q, t);
            }
        } finally {
            cleanup();
        }
    },

    _relayUrl: "http://127.0.0.1:43210",
    _relayProbe: null as Promise<boolean> | null,

    _probeRelay() {
        return (this._relayProbe ??= (async () => {
            try {
                const r = await Promise.race([
                    fetch(`${this._relayUrl}/health`, {
                        method: "GET",
                        redirect: "error",
                    }),
                    new Promise<never>((_, reject) =>
                        setTimeout(
                            () => reject(new Error("probe timeout")),
                            800
                        )
                    ),
                ]);
                if (r.ok)
                    Logger.log(
                        "[Bypass] QuestMaster Relay detected on 127.0.0.1:43210.",
                        "info"
                    );
                return r.ok;
            } catch (_) {
                return false;
            }
        })());
    },

    async _bypassPost(
        url: string,
        headers: Record<string, string>,
        jsonBody: string
    ) {
        // Prefer Vencord native helpers (CSP-free) before local relay / fetch
        try {
            const Native = getNative();
            if (Native) {
                const u = new URL(url);
                const appId = u.hostname.split(".")[0];
                const questId = headers["X-Discord-Quest-ID"];
                const referrer = headers["Referer"];
                if (u.pathname.endsWith("/acf/authorize")) {
                    const { code } = JSON.parse(jsonBody);
                    const r = await Native.discordsaysAuthorize({
                        appId,
                        questId,
                        authCode: code,
                        referrer,
                    });
                    if (!r.ok) throw { status: r.status, body: r.body };
                    return { ok: true, status: r.status, body: r.body };
                }
                if (u.pathname.endsWith("/acf/quest/progress")) {
                    const { progress } = JSON.parse(jsonBody);
                    const token = headers["X-Auth-Token"];
                    const r = await Native.discordsaysProgress({
                        appId,
                        questId,
                        token,
                        target: progress,
                        referrer,
                    });
                    if (!r.ok) throw { status: r.status, body: r.body };
                    return { ok: true, status: r.status, body: r.body };
                }
                const r = await Native.proxyFetch(url, headers, jsonBody);
                if (!r.ok) throw { status: r.status, body: r.body };
                return { ok: true, status: r.status, body: r.body };
            }
        } catch (e: any) {
            if (e?.status) throw e;
            Logger.log(
                `[Bypass] VencordNative path errored: ${e?.message ?? e}`,
                "debug"
            );
        }

        if (await this._probeRelay()) {
            const r = await fetch(`${this._relayUrl}/proxy`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url, headers, body: jsonBody }),
                redirect: "error",
            });
            if (!r.ok) throw { status: r.status, body: await r.text() };
            const result = await r.json();
            if (!result.ok) throw { status: result.status, body: result.body };
            return result;
        }

        const dn = typeof DiscordNative !== "undefined" ? DiscordNative : null;
        if (dn) {
            const probes = [
                () => dn.http?.makeRequest,
                () => dn.fileManager?.fetchURL,
                () => dn.processUtils?.fetch,
                () => dn.app?.makeRequest,
            ];
            for (const probe of probes) {
                try {
                    const fn = probe();
                    if (typeof fn === "function") {
                        const r = await fn.call(dn, {
                            method: "POST",
                            url,
                            headers,
                            body: jsonBody,
                        });
                        if (r && (r.status || r.statusCode)) {
                            const status = r.status ?? r.statusCode;
                            return {
                                ok: status >= 200 && status < 300,
                                status,
                                body: r.body ?? r.responseText ?? "",
                            };
                        }
                    }
                } catch (_) {}
            }
        }

        const res = await fetch(url, {
            method: "POST",
            headers,
            body: jsonBody,
            redirect: "error",
        });
        const body = await res.text();
        if (!res.ok) throw { status: res.status, body };
        return { ok: true, status: res.status, body };
    },

    async bypassAchievement(q: any, t: TaskInfo) {
        const appId = q.config?.application?.id;
        if (!appId) return false;
        if (!/^\d+$/.test(String(appId))) {
            Logger.log(
                `[Bypass] Refusing non-numeric appId "${appId}".`,
                "warn"
            );
            return false;
        }

        let preGrantIds: Set<string> | undefined;
        try {
            const before = await Mods.API.get({ url: "/oauth2/tokens" });
            preGrantIds = new Set(
                (before?.body || [])
                    .filter((tk: any) => tk.application?.id === appId)
                    .map((tk: any) => tk.id)
            );
        } catch (e: any) {
            Logger.log(
                `[Bypass] Couldn't snapshot existing grants; aborting: ${e?.message}`,
                "warn"
            );
            return false;
        }

        try {
            let appName: string | null = null;
            try {
                const a = await Mods.API.get({
                    url: `/applications/public?application_ids=${appId}`,
                });
                appName = a?.body?.[0]?.name ?? null;
            } catch (_) {}
            if (!(await Consent.ask(String(appId), appName))) {
                Logger.log(
                    `[Bypass] Consent declined for "${t.name}". Not authorizing the app.`,
                    "warn"
                );
                return false;
            }

            Logger.log(
                `[Bypass] Trying Discord Says auth flow for "${t.name}"...`,
                "info"
            );

            const authRes = await Mods.API.post({
                url: "/oauth2/authorize",
                query: {
                    response_type: "code",
                    client_id: appId,
                    scope: "identify applications.commands applications.entitlements",
                },
                body: {
                    permissions: "0",
                    authorize: true,
                    integration_type: 1,
                    location_context: {
                        guild_id: "10000",
                        channel_id: "10000",
                        channel_type: 10000,
                    },
                },
            });
            const location = authRes?.body?.location;
            if (!location)
                throw new Error("no location in /oauth2/authorize response");
            const authCode = new URL(location).searchParams.get("code");
            if (!authCode) throw new Error("no code in authorize location");

            const ticketRes = await Mods.API.post({
                url: `/applications/${appId}/proxy-tickets`,
                body: {},
            });
            const proxyTicket = ticketRes?.body?.ticket;
            if (!proxyTicket) throw new Error("no proxy ticket");

            const referrer = `https://${appId}.discordsays.com/?instance_id=example-cl-instance&platform=desktop&discord_proxy_ticket=${encodeURIComponent(proxyTicket)}`;

            const dsAuthRes = await Tasks._bypassPost(
                `https://${appId}.discordsays.com/.proxy/acf/authorize`,
                {
                    "Content-Type": "application/json",
                    "X-Auth-Token": "",
                    "X-Discord-Quest-ID": q.id,
                    Referer: referrer,
                },
                JSON.stringify({ code: authCode })
            );
            let dsToken: string | undefined;
            try {
                dsToken = JSON.parse(dsAuthRes.body)?.token;
            } catch {
                throw new Error(
                    "discordsays returned non-JSON: " +
                        String(dsAuthRes.body).slice(0, 120)
                );
            }
            if (!dsToken) throw new Error("no discordsays token");

            await Tasks._bypassPost(
                `https://${appId}.discordsays.com/.proxy/acf/quest/progress`,
                {
                    "Content-Type": "application/json",
                    "X-Auth-Token": dsToken,
                    "X-Discord-Quest-ID": q.id,
                    Referer: referrer,
                },
                JSON.stringify({ progress: t.target })
            );

            Logger.log(
                `[Bypass] Success — "${t.name}" completed via Discord Says.`,
                "success"
            );
            return true;
        } catch (e: any) {
            if (
                e instanceof TypeError &&
                /failed to fetch|networkerror/i.test(e.message)
            ) {
                Logger.log(
                    `[Bypass] Discord's CSP blocks reaching discordsays.com. Native helpers should handle this — check QuestMaster plugin native. Skipping "${t.name}".`,
                    "warn"
                );
                return false;
            }
            const code = e?.body?.code;
            if (code === 50165) {
                Logger.log(
                    `[Bypass] "${t.name}" can't be launched (age-gated or delisted). Discord blocks the proxy ticket.`,
                    "warn"
                );
                return false;
            }
            const parts: string[] = [];
            if (e?.status) parts.push(`HTTP ${e.status}`);
            if (code) parts.push(`code ${code}`);
            if (e?.body?.message) parts.push(e.body.message);
            else if (e?.message) parts.push(e.message);
            else if (typeof e === "string") parts.push(e);
            else if (e) {
                try {
                    parts.push(JSON.stringify(e).slice(0, 200));
                } catch {
                    parts.push(String(e));
                }
            }
            Logger.log(
                `[Bypass] Failed: ${parts.join(" — ") || "unknown"}`,
                "warn"
            );
            return false;
        } finally {
            if (preGrantIds) {
                try {
                    const after = await Mods.API.get({ url: "/oauth2/tokens" });
                    const ours = (after?.body || []).filter(
                        (tk: any) =>
                            tk.application?.id === appId &&
                            !preGrantIds!.has(tk.id)
                    );
                    for (const g of ours)
                        await Mods.API.del({
                            url: `/oauth2/tokens/${g.id}`,
                        });
                } catch (e: any) {
                    Logger.log(
                        `[Bypass] Deauthorize cleanup non-fatal: ${e?.message}`,
                        "debug"
                    );
                }
            }
        }
    },

    async ACHIEVEMENT(q: any, t: TaskInfo) {
        Logger.updateTask(q.id, {
            name: t.name,
            type: "ACHIEVEMENT",
            cur: 0,
            max: t.target,
            status: "RUNNING",
        });

        let chan: string | null = null;
        try {
            chan =
                Mods.ChanStore?.getSortedPrivateChannels()?.[0]?.id ??
                (
                    Object.values(
                        Mods.GuildChanStore?.getAllGuilds() ?? {}
                    ) as any[]
                ).find((g: any) => g?.VOCAL?.length)?.VOCAL?.[0]?.channel
                    ?.id ??
                null;
        } catch (e: any) {
            Logger.log(`[Achievement] Channel lookup: ${e.message}`, "debug");
        }

        if (chan) {
            Logger.log(
                `[Task] Attempting heartbeat spoofing for "${t.name}"...`,
                "info"
            );
            const key = `call:${chan}:${rnd(1000, 9999)}`;
            let cur = 0;
            let failCount = 0;

            while (cur < t.target && RUNTIME.running) {
                try {
                    const r = await Traffic.enqueue(
                        `/quests/${q.id}/heartbeat`,
                        {
                            stream_key: key,
                            terminal: false,
                        }
                    );
                    cur =
                        r?.body?.progress?.[t.keyName]?.value ??
                        r?.body?.progress?.ACHIEVEMENT_IN_ACTIVITY?.value ??
                        cur;
                    Logger.updateTask(q.id, {
                        name: t.name,
                        type: "ACHIEVEMENT",
                        cur,
                        max: t.target,
                        status: "RUNNING",
                    });
                    failCount = 0;

                    if (cur >= t.target) {
                        try {
                            await Traffic.enqueue(
                                `/quests/${q.id}/heartbeat`,
                                {
                                    stream_key: key,
                                    terminal: true,
                                }
                            );
                        } catch (_) {}
                        break;
                    }
                } catch (e: any) {
                    failCount++;
                    const err = ErrorHandler.classify(e);
                    if (err.isClientError) {
                        Logger.log(
                            `[Achievement] Heartbeat rejected (HTTP ${err.status}). Falling back to passive mode.`,
                            "warn"
                        );
                        break;
                    }
                    if (failCount >= SYS.MAX_TASK_FAILURES) {
                        Logger.log(
                            `[Achievement] Too many failures. Falling back to passive mode.`,
                            "warn"
                        );
                        break;
                    }
                }
                await sleep(rnd(19000, 22000));
            }

            if (cur >= t.target && RUNTIME.running) return Tasks.finish(q, t);
        }

        if (!RUNTIME.running) return;
        const bypassed = await Tasks.bypassAchievement(q, t);
        if (bypassed) return Tasks.finish(q, t);

        if (!RUNTIME.running) return;
        Logger.log(
            `[Task] Skipping "${t.name}" — no auto-completion path worked.`,
            "warn"
        );
        return Tasks.failTask(q, t, "Cannot auto-complete");
    },

    async ACTIVITY(q: any, t: TaskInfo) {
        let chan: string | null = null;
        try {
            chan =
                Mods.ChanStore?.getSortedPrivateChannels()?.[0]?.id ??
                (
                    Object.values(
                        Mods.GuildChanStore?.getAllGuilds() ?? {}
                    ) as any[]
                ).find((g: any) => g?.VOCAL?.length)?.VOCAL?.[0]?.channel
                    ?.id ??
                null;
        } catch (e: any) {
            Logger.log(
                `[Task] ACTIVITY channel lookup error: ${e.message}`,
                "debug"
            );
        }

        if (!chan) {
            return Tasks.failTask(q, t, "No voice channel found");
        }

        const key = `call:${chan}:${rnd(1000, 9999)}`;
        let cur = 0;
        let failCount = 0;
        Logger.updateTask(q.id, {
            name: t.name,
            type: "ACTIVITY",
            cur,
            max: t.target,
            status: "RUNNING",
        });

        const startTime = Date.now();

        while (cur < t.target && RUNTIME.running) {
            try {
                const r = await Traffic.enqueue(`/quests/${q.id}/heartbeat`, {
                    stream_key: key,
                    terminal: false,
                });
                cur =
                    r?.body?.progress?.[t.keyName]?.value ??
                    r?.body?.progress?.PLAY_ACTIVITY?.value ??
                    cur + 20;
                Logger.updateTask(q.id, {
                    name: t.name,
                    type: "ACTIVITY",
                    cur,
                    max: t.target,
                    status: "RUNNING",
                });
                failCount = 0;
                if (cur >= t.target) {
                    try {
                        await Traffic.enqueue(`/quests/${q.id}/heartbeat`, {
                            stream_key: key,
                            terminal: true,
                        });
                    } catch (e: any) {
                        Logger.log(
                            `[ACTIVITY] Final heartbeat failed: ${e?.message}`,
                            "debug"
                        );
                    }
                    break;
                }
            } catch (e: any) {
                failCount++;
                const err = ErrorHandler.classify(e);
                if (err.isClientError) {
                    Logger.log(
                        `[Task] Activity quest unavailable (HTTP ${err.status}). Skipping.`,
                        "warn"
                    );
                    return Tasks.failTask(q, t, `Client Error ${err.status}`);
                }
                if (failCount >= SYS.MAX_TASK_FAILURES) {
                    return Tasks.failTask(q, t, "Too many network failures");
                }
                Logger.log(
                    `[Task] ACTIVITY heartbeat failed (${failCount}/${SYS.MAX_TASK_FAILURES}): ${err.message}`,
                    "debug"
                );
            }

            if (Date.now() - startTime > SYS.MAX_TIME) {
                return Tasks.failTask(q, t, "Timeout exceeded");
            }
            await sleep(rnd(19000, 22000));
        }
        if (RUNTIME.running && cur >= t.target) Tasks.finish(q, t);
    },

    async finish(q: any, t: TaskInfo) {
        Logger.updateTask(q.id, {
            name: t.name,
            type: t.type,
            cur: t.target,
            max: t.target,
            status: "COMPLETED",
        });
        Logger.log(`[Task] Completed "${t.name}"!`, "success");
        Sound.play("tick");

        try {
            if (typeof Notification !== "undefined") {
                if (Notification.permission === "default") {
                    try {
                        await Notification.requestPermission();
                    } catch (_) {}
                }
                if (Notification.permission === "granted") {
                    new Notification(`${CONFIG.NAME}: Quest Completed`, {
                        body: t.name,
                        icon: "https://cdn.discordapp.com/emojis/1120042457007792168.webp",
                        tag: `orion-${q.id}`,
                    });
                }
            }
        } catch (e: any) {
            Logger.log(`[Notification] ${e.message}`, "debug");
        }

        if (RUNTIME.autoClaim) {
            try {
                await sleep(rnd(2500, 6000));
                if (!RUNTIME.running) return;
                const claimRes = await this.claimReward(q.id);

                if (claimRes?.body?.claimed_at) {
                    Logger.log(
                        `[Claim] Reward for "${t.name}" claimed automatically!`,
                        "success"
                    );
                    Logger.updateTask(q.id, {
                        name: t.name,
                        type: t.type,
                        cur: t.target,
                        max: t.target,
                        status: "CLAIMED",
                    });
                    setTimeout(() => Logger.removeTask(q.id), 2000);
                    return;
                }
            } catch (e: any) {
                const needsCaptcha =
                    e?.body?.captcha_key || e?.body?.captcha_sitekey;
                if (needsCaptcha) {
                    Logger.log(
                        `[Claim] Captcha required for "${t.name}". Use UI button.`,
                        "warn"
                    );
                } else {
                    Logger.log(
                        `[Claim] Auto-claim failed for "${t.name}": ${e?.body?.message ?? e?.message}`,
                        "err"
                    );
                }
            }
        }

        Logger.updateTask(q.id, {
            name: t.name,
            type: t.type,
            cur: t.target,
            max: t.target,
            status: "COMPLETED",
            claimable: true,
            questId: q.id,
        });
    },
};

/* ── main loop ─────────────────────────────────────────────── */

async function runConcurrent(
    tasks: (() => Promise<any>)[],
    limit: number
) {
    const executing = new Set<Promise<any>>();

    for (const task of tasks) {
        if (!RUNTIME.running) break;

        const p = task().finally(() => executing.delete(p));
        executing.add(p);

        await sleep(rnd(1500, 4000));

        if (executing.size >= limit) {
            await Promise.race(executing);
        }
    }

    return Promise.allSettled(executing);
}

async function main() {
    Logger.init();
    void announceLogPath();
    if (!loadModules()) {
        Logger.log(
            "[System] Failed to load Discord modules. Aborting.",
            "err"
        );
        showToast({ text: "QuestMaster could not start: required Discord modules are unavailable. Restart Discord and try again.", variant: "critical" });
        stopQuestMaster();
        return;
    }

    Patcher.init(Mods.RunStore);

    const optional = [
        "StreamStore",
        "ChanStore",
        "GuildChanStore",
        "Router",
    ] as const;
    optional.forEach(k => {
        if (!Mods[k])
            Logger.log(
                `[System] Optional module '${k}' not found. Features may be limited.`,
                "warn"
            );
    });

    const getQuests = () => {
        const q = Mods.QuestStore.quests;
        return q instanceof Map ? [...q.values()] : Object.values(q);
    };

    let quests = getQuests().filter(
        (q: any) =>
            !q.userStatus?.completedAt &&
            notExpired(q) &&
            q.id !== BLACKLISTED_QUEST_ID &&
            !Tasks.skipped.has(q.id)
    );

    if (!quests.length) {
        Logger.log("[System] All available quests are completed!", "success");
        Logger.showEmptyState();
        showToast({ text: "QuestMaster found no incomplete quests.", variant: "default" });
        return;
    }

    const pickerResult = await Logger.showQuestPicker(quests);
    if (!RUNTIME.running) return;

    // Session-only — do not overwrite persistent Vencord plugin settings
    RUNTIME.autoEnroll = pickerResult.autoEnroll;
    RUNTIME.autoClaim = pickerResult.autoClaim;
    RUNTIME.playSound = pickerResult.playSound;
    RUNTIME.randomDelay = pickerResult.randomDelay;

    if (pickerResult.selectedQuests.size === 0) {
        Logger.log("[System] No quests selected. Shutting down.", "info");
        stopQuestMaster();
        return;
    }

    let loopCount = 1;

    while (RUNTIME.running) {
        try {
            Logger.log(`[Cycle] Starting loop #${loopCount}...`, "info");
            quests = getQuests();

            const active = quests.filter(
                (q: any) =>
                    pickerResult.selectedQuests.has(q.id) &&
                    !q.userStatus?.completedAt &&
                    notExpired(q) &&
                    q.id !== BLACKLISTED_QUEST_ID &&
                    !Tasks.skipped.has(q.id)
            );

            if (!active.length) {
                const selectedStillExist = quests.some(
                    (q: any) =>
                        pickerResult.selectedQuests.has(q.id) &&
                        !q.userStatus?.completedAt &&
                        notExpired(q) &&
                        q.id !== BLACKLISTED_QUEST_ID
                );
                if (selectedStillExist && Tasks.skipped.size > 0) {
                    Logger.log(
                        "[System] Selected quests failed or were skipped. Dashboard stays open — hit Retry.",
                        "warn"
                    );
                    Logger.showEmptyState(
                        "Quests failed or unavailable. Check the log, then click Retry."
                    );
                    showToast({ text: "QuestMaster: quests failed/skipped. Check logs and retry.", variant: "critical" });
                    return;
                }
                Logger.log(
                    "[System] All available quests are completed!",
                    "success"
                );
                Sound.play("done");
                break;
            }

            const queues: {
                video: (() => Promise<any>)[];
                game: (() => Promise<any>)[];
            } = { video: [], game: [] };

            active.forEach((q: any) => {
                try {
                    const cfg = q.config?.taskConfig ?? q.config?.taskConfigV2;
                    if (!cfg?.tasks || typeof cfg.tasks !== "object") {
                        Logger.log(
                            `[Quest] ${q.id} has invalid task config. Skipping.`,
                            "warn"
                        );
                        return;
                    }

                    const typeData = Tasks.detectType(
                        cfg,
                        q.config?.application?.id
                    );
                    if (!typeData) {
                        Logger.log(
                            `[Quest] Unknown task type: ${q.config?.messages?.questName ?? q.id}`,
                            "warn"
                        );
                        return;
                    }

                    if (
                        !isDesktop() &&
                        (typeData.type === "GAME" ||
                            typeData.type === "STREAM")
                    ) {
                        Logger.log(
                            `[Quest] "${q.config?.messages?.questName}" requires desktop app. Skipping.`,
                            "warn"
                        );
                        return;
                    }

                    const { type, keyName, target } = typeData;
                    if (target <= 0) {
                        Logger.log(
                            `[Quest] Invalid target (${target}) for ${q.id}. Skipping.`,
                            "warn"
                        );
                        return;
                    }

                    const tInfo: TaskInfo = {
                        id: q.id,
                        appId: q.config?.application?.id ?? 0,
                        name:
                            q.config?.messages?.questName ?? "Unknown Quest",
                        target,
                        type,
                        keyName,
                    };

                    if (
                        !q.userStatus?.enrolledAt &&
                        !RUNTIME.autoEnroll
                    ) {
                        Logger.updateTask(tInfo.id, {
                            name: tInfo.name,
                            type: tInfo.type,
                            cur: 0,
                            max: tInfo.target,
                            status: "PENDING",
                            actionRequired: "ENROLL",
                        });
                        return;
                    }

                    if (
                        Logger.tasks.has(q.id) &&
                        Logger.tasks.get(q.id)!.status === "RUNNING"
                    )
                        return;

                    Logger.updateTask(tInfo.id, {
                        name: tInfo.name,
                        type: tInfo.type,
                        cur: 0,
                        max: tInfo.target,
                        status: "QUEUE",
                        actionRequired: null,
                    });

                    const taskFunc = async () => {
                        let questRef = q;
                        if (!questRef.userStatus?.enrolledAt) {
                            Logger.log(
                                `[Enroll] Accepting quest: ${tInfo.name}`,
                                "info"
                            );
                            try {
                                await Traffic.enqueue(
                                    `/quests/${questRef.id}/enroll`,
                                    {
                                        location: 11,
                                        is_targeted: false,
                                    }
                                );
                                await sleep(rnd(800, 1500));
                                questRef =
                                    Mods.QuestStore?.getQuest?.(questRef.id) ??
                                    (Mods.QuestStore?.quests instanceof Map
                                        ? Mods.QuestStore.quests.get(
                                              questRef.id
                                          )
                                        : null) ??
                                    questRef;
                            } catch (e: any) {
                                const err = ErrorHandler.classify(e);
                                if (ErrorHandler.isSkippableQuest(e)) {
                                    Tasks.skipped.add(questRef.id);
                                    Logger.log(
                                        `[Enroll] ${tInfo.name} unavailable (${err.status}). Skipping.`,
                                        "warn"
                                    );
                                } else {
                                    Logger.log(
                                        `[Enroll] Failed for ${tInfo.name}: ${err.message}`,
                                        "err"
                                    );
                                }
                                return Tasks.failTask(
                                    questRef,
                                    tInfo,
                                    `Enrollment failed`
                                );
                            }
                        }

                        const status = questRef.userStatus;
                        if (type === "WATCH_VIDEO")
                            return Tasks.VIDEO(questRef, tInfo, status);
                        if (type === "ACHIEVEMENT")
                            return Tasks.ACHIEVEMENT(questRef, tInfo);
                        const runner =
                            type === "STREAM"
                                ? Tasks.STREAM
                                : type === "ACTIVITY"
                                  ? Tasks.ACTIVITY
                                  : Tasks.GAME;
                        return runner(questRef, tInfo, status);
                    };

                    if (type === "WATCH_VIDEO") queues.video.push(taskFunc);
                    else queues.game.push(taskFunc);
                } catch (e: any) {
                    Logger.log(
                        `[Quest] Error processing ${q.id}: ${e.message}`,
                        "err"
                    );
                }
            });

            const totalTasks = queues.video.length + queues.game.length;

            if (totalTasks > 0) {
                const gameLimit = Math.max(1, Number(settings.store.concurrentGames) || 1);
                const videoLimit = Math.max(1, Number(settings.store.concurrentVideos) || 3);
                Logger.log(
                    `[Cycle] Processing: ${queues.video.length} videos (×${videoLimit}), ${queues.game.length} games (×${gameLimit}).`,
                    "info"
                );
                const pGames = runConcurrent(queues.game, gameLimit);
                const pVideos = runConcurrent(queues.video, videoLimit);
                await Promise.all([pGames, pVideos]);
            } else {
                if (active.length === 0) {
                    Logger.log(
                        "[System] All available quests are completed!",
                        "success"
                    );
                    break;
                } else await sleep(rnd(4000, 6000));
            }

            if (!RUNTIME.running) break;

            if (RUNTIME.randomDelay) {
                const delayMs = rnd(60000, 1800000);
                Logger.log(
                    `[Cycle] Loop #${loopCount} complete. Random delay: ${Math.round(delayMs / 60000)}m before rescan.`,
                    "info"
                );
                await sleep(delayMs);
            } else {
                Logger.log(
                    `[Cycle] Loop #${loopCount} complete. Waiting before rescan...`,
                    "info"
                );
                await sleep(rnd(2500, 4500));
            }
            loopCount++;
        } catch (cycleError: any) {
            Logger.log(
                `[Cycle] Error in loop #${loopCount}: ${cycleError?.message ?? cycleError}`,
                "err"
            );
            console.error(cycleError);
            await sleep(3000);
            loopCount++;
        }
    }

    const hasUnclaimed = [...Logger.tasks.values()].some(
        t => t.claimable && !t.removing
    );
    if (hasUnclaimed) {
        Logger.log(
            "[System] Quest cycle finished. Claim your rewards above, then click STOP.",
            "info"
        );
        return;
    }

    // Keep UI open so the user can Retry instead of vanishing
    Logger.showEmptyState(
        "Cycle finished. If progress stuck at 0% in Discord, wait or click Retry."
    );
}

export async function startQuestMaster(): Promise<void> {
    if (engineActive) {
        const existingUI = document.getElementById("orion-ui");
        if (existingUI) existingUI.style.display = "flex";
        else if (Logger.root) Logger.toggle();
        return;
    }

    sessionId++;
    engineActive = true;
    RUNTIME.running = true;
    syncRuntimeFromSettings();
    Tasks.skipped.clear();
    Traffic.reset();

    mainPromise = main().catch((e: any) => {
        const msg = e?.message ?? e?.toString?.() ?? "Unknown fatal error";
        console.error(`[${CONFIG.NAME} Fatal]`, e);
        try {
            Logger.log(`[System] FATAL: ${msg}`, "err");
        } catch (_) {}
        showToast({ text: `QuestMaster stopped: ${msg}`, variant: "critical" });
        stopQuestMaster();
    });

    await mainPromise;
}

function restartQuestMaster(): void {
    stopQuestMaster();
    setTimeout(() => void startQuestMaster(), 1100);
}

export function stopQuestMaster(): void {
    if (!RUNTIME.running && !engineActive && !Logger.root) return;

    sessionId++;
    const wasRunning = RUNTIME.running;
    RUNTIME.running = false;

    // Reject any queued network work from the dying session
    Traffic.reset();

    if (wasRunning || Logger.root) {
        Logger.shutdown();
    } else {
        engineActive = false;
        Patcher.clean();
        cancelPicker?.(emptyPickerResult());
        cancelPicker = null;
        cancelConsent?.(false);
        cancelConsent = null;
    }
}
