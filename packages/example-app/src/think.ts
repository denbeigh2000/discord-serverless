import {
    APIChatInputApplicationCommandInteraction,
    ApplicationCommandType,
    InteractionResponseType,
    MessageFlags,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord-api-types/v10";

import { RESTPatchAPIInteractionFollowupJSONBody } from "discord-api-types/rest/v10/interactions";
import { CommandFn } from "../../interaction-router/src";
import { AppContext } from "./context";
import { isChatInputApplicationCommandInteraction } from "discord-api-types/utils/v10";

export const thinkCommand: RESTPostAPIChatInputApplicationCommandsJSONBody = {
    name: "think",
    type: ApplicationCommandType.ChatInput,
    description: "Bot will think before returning an answer.",
};

async function think(durationMs: number, ctx: AppContext, interaction: APIChatInputApplicationCommandInteraction) {
    return new Promise(resolve => {
        setTimeout(async () => {
            const { token } = interaction;
            const url = `https://discord.com/api/v10/webhooks/${ctx.appId}/${token}/messages/@original`;

            const data: RESTPatchAPIInteractionFollowupJSONBody = {
                content: "The answer is 42",
            };

            await fetch(url, {
                method: "PATCH",
                body: JSON.stringify(data),
                headers: {
                    Authorization: `Bot ${ctx.discordToken}`,
                    "Content-Type": "application/json",
                },
            });
            resolve(null);
        }, durationMs);
    });
}

export const thinkHandler: CommandFn<AppContext> = async (ctx, interaction) => {
    if (!isChatInputApplicationCommandInteraction(interaction)) {
        return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
                content: "Bad command type",
                flags: MessageFlags.Ephemeral & MessageFlags.Urgent,
            },
        };
    }

    ctx.exec.waitUntil(think(5000, ctx, interaction));
    return {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral },
    };
}
