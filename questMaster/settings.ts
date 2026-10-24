/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Nandak070
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    fileLogging: {
        type: OptionType.BOOLEAN,
        description:
            "Write logs to Documents/QuestMaster/questmaster.log (desktop)",
        default: true,
    },
    concurrentGames: {
        type: OptionType.SLIDER,
        description: "How many game/stream/activity quests to run at once",
        markers: [1, 2, 3, 4, 5, 6],
        default: 1,
        stickToMarkers: true,
    },
    concurrentVideos: {
        type: OptionType.SLIDER,
        description: "How many video quests to run at once",
        markers: [1, 2, 3, 4],
        default: 3,
        stickToMarkers: true,
    },
    autoEnroll: { type: OptionType.BOOLEAN, description: "Auto-enroll in quests before completing", default: true },
    autoClaim: { type: OptionType.BOOLEAN, description: "Auto-claim rewards when quests complete", default: false },
    playSound: { type: OptionType.BOOLEAN, description: "Play sound on quest completion", default: false },
    randomDelay: { type: OptionType.BOOLEAN, description: "Random 1-30 min delay between cycles (anti-detection)", default: false },
    hideActivity: { type: OptionType.BOOLEAN, description: "Hide spoofed Rich Presence from friends list", default: false },
    autoStart: { type: OptionType.BOOLEAN, description: "Open QuestMaster dashboard when the plugin starts", default: true },
});
