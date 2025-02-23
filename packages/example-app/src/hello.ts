import {
    ApplicationCommandOptionType,
    ApplicationCommandType,
    InteractionResponseType,
    MessageFlags,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { isChatInputApplicationCommandInteraction } from "discord-api-types/utils/v10";
import { AppContext } from "./context";
import { CommandFn } from "interaction-router";

export const helloCommand: RESTPostAPIChatInputApplicationCommandsJSONBody = {
    name: "hello",
    description: "Sends the user a greeting from this application.",
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "name",
            type: ApplicationCommandOptionType.User,
            description: "If provided, greets this user specifically",
            required: false,
        },
    ],
};

export const handleHello: CommandFn<AppContext> = async (ctx, interaction) => {
    if (!isChatInputApplicationCommandInteraction(interaction)) {
        return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
                content: "Unexpected command type",
                flags: MessageFlags.Urgent & MessageFlags.Ephemeral,
            },
        };
    }

    const { options } = interaction.data;
    const nameOption = options && options.find((o) => o.name === "name");

    let content;
    if (nameOption) {
        if (nameOption.type !== ApplicationCommandOptionType.User) {
            return {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                    content: "Unexpected command option type",
                    flags: MessageFlags.Urgent & MessageFlags.Ephemeral,
                },
            };
        }

        content = `Hello from ${ctx.appName}, <@${nameOption.value}>!`;
    } else {
        content = `Hello from ${ctx.appName}!`;
    }

    return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content },
    };
};
