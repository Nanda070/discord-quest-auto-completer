/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Nandak070
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { IpcMainInvokeEvent } from "electron";
import { appendFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export type ProxyResult = {
    ok: boolean;
    status: number;
    body: string;
};

function logDir() {
    return join(homedir(), "Documents", "QuestMaster");
}

function logFilePath() {
    return join(logDir(), "questmaster.log");
}

/** Absolute path to the log file */
export async function getLogPath(_: IpcMainInvokeEvent): Promise<string> {
    return logFilePath();
}

/** Append one line to Documents/QuestMaster/questmaster.log */
export async function appendLog(
    _: IpcMainInvokeEvent,
    line: string
): Promise<{ ok: boolean; path: string; error?: string }> {
    try {
        mkdirSync(logDir(), { recursive: true });
        const path = logFilePath();
        appendFileSync(path, line.endsWith("\n") ? line : `${line}\n`, "utf8");
        return { ok: true, path };
    } catch (e: any) {
        return {
            ok: false,
            path: logFilePath(),
            error: e?.message ?? String(e),
        };
    }
}

async function postJson(
    url: string,
    headers: Record<string, string>,
    body: string
): Promise<ProxyResult> {
    const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        redirect: "manual",
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text };
}

/** Generic CSP-free POST used by achievement bypass */
export async function proxyFetch(
    _: IpcMainInvokeEvent,
    url: string,
    headers: Record<string, string>,
    body: string
): Promise<ProxyResult> {
    if (!/^https:\/\/\d+\.discordsays\.com\//.test(url)) {
        return { ok: false, status: 400, body: "URL not allowed" };
    }
    return postJson(url, headers, body);
}

export async function discordsaysAuthorize(
    _: IpcMainInvokeEvent,
    opts: { appId: string; questId: string; authCode: string; referrer: string }
): Promise<ProxyResult> {
    if (!/^\d+$/.test(opts.appId)) {
        return { ok: false, status: 400, body: "Invalid appId" };
    }
    return postJson(
        `https://${opts.appId}.discordsays.com/.proxy/acf/authorize`,
        {
            "Content-Type": "application/json",
            "X-Auth-Token": "",
            "X-Discord-Quest-ID": opts.questId,
            Referer: opts.referrer,
        },
        JSON.stringify({ code: opts.authCode })
    );
}

export async function discordsaysProgress(
    _: IpcMainInvokeEvent,
    opts: {
        appId: string;
        questId: string;
        token: string;
        target: number;
        referrer: string;
    }
): Promise<ProxyResult> {
    if (!/^\d+$/.test(opts.appId)) {
        return { ok: false, status: 400, body: "Invalid appId" };
    }
    return postJson(
        `https://${opts.appId}.discordsays.com/.proxy/acf/quest/progress`,
        {
            "Content-Type": "application/json",
            "X-Auth-Token": opts.token,
            "X-Discord-Quest-ID": opts.questId,
            Referer: opts.referrer,
        },
        JSON.stringify({ progress: opts.target })
    );
}
