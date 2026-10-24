/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Nandak070
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { Button, showToast } from "@webpack/common";
import { settings } from "./settings";
import { startQuestMaster, stopQuestMaster } from "./engine";
import "./styles.css";

function openQuestMaster() {
    void startQuestMaster().catch(error => {
        console.error("[QuestMaster] Failed to start:", error);
        showToast({ text: `QuestMaster could not start: ${error?.message ?? "unknown error"}`, variant: "critical" });
    });
}

export default definePlugin({
    name: "QuestMaster",
    description:
        "Auto-complete Discord Quests with an in-app dashboard (video, game, stream, activity, achievements).",
    authors: [
        {
            name: "Nandak070",
            id: 1219803151180370021n,
        },
    ],
    settings,
    settingsAboutComponent: () => (
        <Button onClick={openQuestMaster}>
            Open QuestMaster
        </Button>
    ),
    toolboxActions: {
        "Open QuestMaster"() {
            openQuestMaster();
        },
    },
    start() {
        if (settings.store.autoStart) openQuestMaster();
    },
    stop() {
        stopQuestMaster();
    },
});
