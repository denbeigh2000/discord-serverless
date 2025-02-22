import {
    APIApplicationCommandAutocompleteInteraction,
    APIApplicationCommandAutocompleteResponse,
    APIApplicationCommandInteraction,
    APIInteraction,
    APIInteractionResponse,
    APIInteractionResponseChannelMessageWithSource,
    APIMessageComponentInteraction,
    APIModalSubmitInteraction, ApplicationCommandType, InteractionResponseType,
    InteractionType,
    MessageFlags,
    RESTPostAPIApplicationCommandsJSONBody,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord-api-types/v10";

import { formatCommandSet } from "./help";

type GenericFn<Context, Interaction, ReturnType> = (
    ctx: Context,
    interaction: Interaction,
) => Promise<ReturnType>;
export type CommandFn<Context> = GenericFn<
    Context,
    APIApplicationCommandInteraction,
    APIInteractionResponse
>;
export type ComponentFn<Context> = GenericFn<Context, APIMessageComponentInteraction, void>;
export type AutocompleteFn<Context> = GenericFn<
    Context,
    APIApplicationCommandAutocompleteInteraction,
    APIApplicationCommandAutocompleteResponse
>;
export type ModalSubmitFn<Context> = GenericFn<Context, APIModalSubmitInteraction, void>;

const HelpCommandDesc: RESTPostAPIChatInputApplicationCommandsJSONBody = {
    type: ApplicationCommandType.ChatInput,
    name: "help",
    description: "Show all supported bot commands.",
};

type CmdInfo = RESTPostAPIApplicationCommandsJSONBody;

export class InteractionRouter<Context> {
    ctx: Context;
    commands: ApplicationCommandSubrouter<Context>;
    components: ComponentInteractionSubrouter<Context>;
    completions: AutocompleteInteractionRouter<Context>;
    modalSubmissions: ModalSubmitInteractionRouter<Context>;

    constructor(ctx: Context) {
        this.ctx = ctx;
        this.commands = new ApplicationCommandSubrouter(ctx);
        this.components = new GenericSubrouter(ctx);
        this.completions = new GenericSubrouter(ctx);
        this.modalSubmissions = new GenericSubrouter(ctx);
    }

    // NOTE: we omit a key for this, because the registration API requires us
    // to provide a command name, which we will be able to route by in the
    // response.
    public registerCommand(
        h: CommandFn<Context>,
        desc: RESTPostAPIApplicationCommandsJSONBody,
    ) {
        this.commands.register(h, desc);
    }

    public registerComponent(action: string, h: ComponentFn<Context>) {
        this.components.register(action, h);
    }

    public registerAutocomplete(key: string, h: AutocompleteFn<Context>) {
        this.completions.register(key, h);
    }

    public registerModalSubmit(key: string, h: ModalSubmitFn<Context>) {
        this.modalSubmissions.register(key, h);
    }

    public extractIdIdentifier(id: string): string {
        return id.split("_", 1)[0];
    }

    public getAllGuildCommands(): Record<string, RESTPostAPIApplicationCommandsJSONBody[]> {
        return this.commands.getAllGuildCommands();
    }

    public getCommandsForGuild(guildId: string): RESTPostAPIApplicationCommandsJSONBody[] {
        return this.commands.getCommandsForGuild(guildId)
    }

    public getGlobalCommands(): RESTPostAPIApplicationCommandsJSONBody[] {
        return this.commands.getGlobalCommands();
    }

    public async handle(interaction: APIInteraction): Promise<APIInteractionResponse | null> {
        if (interaction.type === InteractionType.Ping) {
            return { type: InteractionResponseType.Pong };
        }

        switch (interaction.type) {
            case InteractionType.ApplicationCommand: {
                const { name } = interaction.data;
                const cmdResp = await this.commands.handle(name, interaction);
                if (cmdResp === "missing") throw `TODO: missing command handler for ${name}`;

                return cmdResp;
            }

            case InteractionType.MessageComponent: {
                const id = interaction.data.custom_id;
                const name = this.extractIdIdentifier(id);
                if ((await this.components.handle(name, interaction)) === "missing")
                    throw `TODO: missing component handler for ${id}`;

                return null;
            }

            case InteractionType.ApplicationCommandAutocomplete: {
                const { name } = interaction.data;
                const resp = await this.completions.handle(name, interaction);
                if (resp === "missing") throw `TODO: missing autocomplete handler for ${name}`;

                return resp;
            }

            case InteractionType.ModalSubmit: {
                const id = interaction.data.custom_id;
                const name = this.extractIdIdentifier(id);
                if ((await this.modalSubmissions.handle(name, interaction)) === "missing")
                    throw `TODO: missing modal submit handler for ${id}`;

                return null;
            }
        }
    }

}

export abstract class BaseSubrouter<Context, In extends APIInteraction, Out> {
    ctx: Context;
    handlers: Record<string, GenericFn<Context, In, Out>>;

    constructor(ctx: Context) {
        this.ctx = ctx;
        this.handlers = {};
    }

    abstract handle(key: string, interaction: In): Promise<Out | "missing">;
}

export class GenericSubrouter<Context, In extends APIInteraction, Out> extends BaseSubrouter<Context, In, Out> {
    public register(key: string, h: GenericFn<Context, In, Out>) {
        if (this.handlers[key]) {
            throw `${key} already registered`;
        }

        this.handlers[key] = h;
    }

    public async handle(key: string, interaction: In): Promise<Out | "missing"> {
        const handler = this.handlers[key];
        if (!handler) {
            return "missing";
        }

        return await handler(this.ctx, interaction);
    }
}

class ApplicationCommandSubrouter<Context> extends BaseSubrouter<Context, APIApplicationCommandInteraction, APIInteractionResponse> {
    globalCmds: CmdInfo[];
    guildCmds: Record<string, CmdInfo[]>;
    // (guild -> key -> callback)
    guildHandlers: Record<string, Record<string, GenericFn<Context, APIApplicationCommandInteraction, APIInteractionResponse>>>;

    constructor(ctx: Context) {
        super(ctx);

        this.guildCmds = {};
        this.globalCmds = [HelpCommandDesc];
        this.guildHandlers = {};
        this.handlers = {
            [HelpCommandDesc.name]: (async (_c: Context, i: APIApplicationCommandInteraction) => this.handleHelp(i)),
        };
    }

    public register(
        h: GenericFn<Context, APIApplicationCommandInteraction, APIInteractionResponse>,
        desc: RESTPostAPIApplicationCommandsJSONBody,
        guilds: string[] | undefined = undefined,
    ) {
        const key = desc.name;
        if (this.handlers[key])
            throw `global command for ${key} already exists`;

        const guildsToCheck = guilds || Object.keys(this.guildHandlers);
        for (const guild of guildsToCheck)
            if (this.guildHandlers[guild][key])
                throw `${key} command already registered for ${guild}`;

        if (guilds) {
            for (const guild of guilds) {
                this.guildHandlers[guild][key] = h;
                const guildCmds = this.guildCmds[guild] || [];
                guildCmds.push(desc);
                this.guildCmds[guild] = guildCmds;
            }
        } else {
            this.handlers[key] = h;
            this.globalCmds.push(desc);
        }
    }

    public async handle(key: string, interaction: APIApplicationCommandInteraction): Promise<APIInteractionResponse | "missing"> {
        const guildId = interaction.guild?.id;
        const guildHandlers = guildId && this.guildHandlers[guildId];

        const handler = guildHandlers && guildHandlers[key]
            ? guildHandlers[key]
            : this.handlers[key];

        if (!handler)
            return "missing";

        return await handler(this.ctx, interaction);
    }

    public getAllGuildCommands(): Record<string, RESTPostAPIApplicationCommandsJSONBody[]> {
        return this.guildCmds;
    }

    public getCommandsForGuild(guildId: string): RESTPostAPIApplicationCommandsJSONBody[] {
        return this.guildCmds[guildId] || [];
    }

    public getGlobalCommands(): RESTPostAPIApplicationCommandsJSONBody[] {
        return this.globalCmds;
    }

    private handleHelp(interaction: APIApplicationCommandInteraction): APIInteractionResponseChannelMessageWithSource {
        const guildCmds = interaction.guild && this.guildCmds[interaction.guild.id] || [];
        const cmds = [...this.globalCmds, ...guildCmds];
        console.log(cmds);
        return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
                flags: MessageFlags.Ephemeral,
                // TODO: may want to update this so global and local commands
                // are formatted differently
                content: formatCommandSet(cmds),
            },
        };
    }
}

type AutocompleteInteractionRouter<Context> = GenericSubrouter<
    Context,
    APIApplicationCommandAutocompleteInteraction,
    APIApplicationCommandAutocompleteResponse
>;

type ModalSubmitInteractionRouter<Context> = GenericSubrouter<Context, APIModalSubmitInteraction, void>;

type ComponentInteractionSubrouter<Context> = GenericSubrouter<
    Context,
    APIMessageComponentInteraction,
    void
>;
