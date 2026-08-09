/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 nanda070
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByCode, findByProps, findStore } from "@webpack";
import { FluxDispatcher } from "@webpack/common";

declare const DiscordNative: any;

export type ModsState = {
    QuestStore: any;
    RunStore: any;
    StreamStore: any;
    ChanStore: any;
    GuildChanStore: any;
    Dispatcher: any;
    API: any;
    Router: { transitionTo: (path: string) => void } | null;
    IS_DESKTOP: boolean;
};

export const Mods: ModsState = {
    QuestStore: null,
    RunStore: null,
    StreamStore: null,
    ChanStore: null,
    GuildChanStore: null,
    Dispatcher: null,
    API: null,
    Router: null,
    IS_DESKTOP: false,
};

function wrapRouter(mod: any): ModsState["Router"] {
    if (!mod) return null;

    if (typeof mod.transitionTo === "function") {
        return { transitionTo: mod.transitionTo.bind(mod) };
    }

    for (const prop of [mod, mod.default, ...Object.values(mod ?? {})]) {
        if (
            typeof prop === "function" &&
            prop.toString().includes("transitionTo -")
        ) {
            return { transitionTo: prop };
        }
    }

    return null;
}

function pickAPI(): any {
    const tryFind = (...props: string[]) => {
        try {
            return findByProps(...props);
        } catch {
            return null;
        }
    };

    const candidates = [
        tryFind("getAPIBaseURL", "get"),
        tryFind("get", "post", "put", "del"),
        tryFind("get", "post", "del"),
    ];

    for (const api of candidates) {
        if (
            api &&
            typeof api.get === "function" &&
            typeof api.post === "function" &&
            typeof api.del === "function"
        ) {
            return api;
        }
    }
    return null;
}

function isUsableStore(store: any): boolean {
    return !!store && typeof store === "object";
}

/** Resolve Discord modules into the mutable Mods object. Call after webpack is ready. */
export function loadModules(): boolean {
    try {
        let questStore: any = null;
        try {
            questStore = findStore("QuestStore");
        } catch {
            /* missing */
        }
        if (!questStore) {
            try {
                questStore = findStore("QuestsStore");
            } catch {
                /* missing */
            }
        }

        Mods.QuestStore = questStore;
        Mods.RunStore = safeFindStore("RunningGameStore");
        Mods.StreamStore = safeFindStore("ApplicationStreamingStore");
        Mods.ChanStore = safeFindStore("ChannelStore");
        Mods.GuildChanStore = safeFindStore("GuildChannelStore");
        Mods.Dispatcher = FluxDispatcher;
        Mods.API = pickAPI();
        Mods.Router = wrapRouter(safeFindByCode("transitionTo -"));
        Mods.IS_DESKTOP = typeof DiscordNative !== "undefined";

        const required: (keyof ModsState)[] = [
            "QuestStore",
            "API",
            "Dispatcher",
            "RunStore",
        ];
        const missing = required.filter(k => {
            if (k === "API") return !Mods.API;
            if (k === "Dispatcher") return !Mods.Dispatcher;
            return !isUsableStore(Mods[k]);
        });

        if (missing.length > 0) {
            console.warn(
                `[QuestMaster] Missing core modules: ${missing.join(", ")}`
            );
            return false;
        }

        return true;
    } catch (e) {
        console.error("[QuestMaster] loadModules failed:", e);
        return false;
    }
}

function safeFindStore(name: string) {
    try {
        return findStore(name);
    } catch {
        return null;
    }
}

function safeFindByCode(code: string) {
    try {
        return findByCode(code);
    } catch {
        return null;
    }
}
