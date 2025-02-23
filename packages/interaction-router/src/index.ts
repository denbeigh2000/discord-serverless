import {
    APIApplicationCommandAutocompleteInteraction,
    APIApplicationCommandAutocompleteResponse,
    APIApplicationCommandInteraction,
    APIInteraction,
    APIInteractionResponse,
    APIInteractionResponseChannelMessageWithSource,
    APIMessageComponentInteraction,
    APIModalSubmitInteraction,
    ApplicationCommandType,
    InteractionResponseType,
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

/**
 * Callback signature for an application command
 */
export type CommandFn<Context> = GenericFn<
    Context,
    APIApplicationCommandInteraction,
    APIInteractionResponse
>;
/**
 * Callback signature for a component interaction
 */
export type ComponentFn<Context> = GenericFn<Context, APIMessageComponentInteraction, void>;
/**
 * Callback signature for an autocomplete request
 */
export type AutocompleteFn<Context> = GenericFn<
    Context,
    APIApplicationCommandAutocompleteInteraction,
    APIApplicationCommandAutocompleteResponse
>;
/**
 * Callback signature for a modal submission
 */
export type ModalSubmitFn<Context> = GenericFn<Context, APIModalSubmitInteraction, void>;

const HelpCommandDesc: RESTPostAPIChatInputApplicationCommandsJSONBody = {
    type: ApplicationCommandType.ChatInput,
    name: "help",
    description: "Show all supported bot commands.",
};

type CmdInfo = RESTPostAPIApplicationCommandsJSONBody;

/**
 * A router for discord webhook interactions.
 *
 * @remarks
 *
 * The Context object will be provided to every request. You may want to
 * include a Discord client, and whatever other keys or resources you might
 * need.
 *
 */
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
    /**
     * Register an Application command.
     *
     * @param h - Handler that will be invoked when a matching callback is
     * called
     * @param desc - Information block that describes the command, as
     * documented in the Discord REST API.
     *
     * @remarks
     *
     * This method will throw in case of a duplicate registration.
     *
     * The `/help` command is reserved for the auto-generated help message.
     *
     * The action/key parameter is absent from application command
     * registration, because it uses the `name` field from the information
     * block. This avoids accidentally giving a different name during routing
     * and command registration.
     */
    public registerCommand(h: CommandFn<Context>, desc: RESTPostAPIApplicationCommandsJSONBody) {
        this.commands.register(h, desc);
    }

    /**
     * Register a Component command callback.
     *
     * @param action - Routing key for this callback
     * @param h - Handler that will be invoked for a matching interaction
     *
     * @remarks
     *
     */
    public registerComponent(action: string, h: ComponentFn<Context>) {
        this.components.register(action, h);
    }

    /**
     * Register an autocomplete callback
     *
     * @param key - Routing key for this callback
     * @param h - Handler that will be invoked for a matching interaction
     */
    public registerAutocomplete(key: string, h: AutocompleteFn<Context>) {
        this.completions.register(key, h);
    }

    /**
     * Register a Modal submit callback.
     * @param key - Routing key for this callback
     * @param h - Handler that will be invoked for a matching interaction
     *
     * @remarks
     *
     * This routing
     */
    public registerModalSubmit(key: string, h: ModalSubmitFn<Context>) {
        this.modalSubmissions.register(key, h);
    }

    /**
     * Invoked on component-based callbacks to determine a routing key
     *
     * @param id - Custom ID of the component-based interaction
     *
     * @returns Key to be used to find a matching callback.
     *
     * @remarks
     *
     * Discord only gives a single custom ID for identifying the sources of
     * component or modal interactions, which this library uses to route these
     * kinds of interaction webhooks.
     *
     * I found it practical to prefix these with a common identifier for easier
     * handling, e.g.: `calendar_month:january_user:0123456`.
     *
     * As such, this function takes a routing key by slicing up to the first
     * underscore of the custom ID: for the example above it would be
     * `calendar`.
     *
     * If this behaviour doesn't work for you, you can subclass
     * InteractionRouter and override this function to provide your own routing
     * key.
     */
    public extractIdIdentifier(id: string): string {
        return id.split("_", 1)[0];
    }

    /**
     * Returns the set of all guild-specific commands for all guilds (does not
     * include global commands)
     *
     * @remarks
     * Useful for bulk registration purposes
     */
    public getAllGuildCommands(): Record<string, RESTPostAPIApplicationCommandsJSONBody[]> {
        return this.commands.getAllGuildCommands();
    }

    /**
     * Returns the set commands that are specific to this guild.
     *
     * @param guildId - Commands returned will be specific to guilds with this
     * ID.
     *
     * @remarks
     * Useful for registration purposes
     */
    public getCommandsForGuild(guildId: string): RESTPostAPIApplicationCommandsJSONBody[] {
        return this.commands.getCommandsForGuild(guildId);
    }

    /**
     * Returns the set of global commands.
     *
     * @remarks
     *
     * Useful for registration purposes
     */
    public getGlobalCommands(): RESTPostAPIApplicationCommandsJSONBody[] {
        return this.commands.getGlobalCommands();
    }

    /**
     * Handles an incoming interaction.
     *
     * @param interaction - JSON-decoded payload from the interaction webhook
     */
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

abstract class BaseSubrouter<Context, In extends APIInteraction, Out> {
    ctx: Context;
    handlers: Record<string, GenericFn<Context, In, Out>>;

    constructor(ctx: Context) {
        this.ctx = ctx;
        this.handlers = {};
    }

    abstract handle(key: string, interaction: In): Promise<Out | "missing">;
}

class GenericSubrouter<Context, In extends APIInteraction, Out> extends BaseSubrouter<
    Context,
    In,
    Out
> {
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

class ApplicationCommandSubrouter<Context> extends BaseSubrouter<
    Context,
    APIApplicationCommandInteraction,
    APIInteractionResponse
> {
    globalCmds: CmdInfo[];
    guildCmds: Record<string, CmdInfo[]>;
    // (guild -> key -> callback)
    guildHandlers: Record<
        string,
        Record<string, GenericFn<Context, APIApplicationCommandInteraction, APIInteractionResponse>>
    >;

    constructor(ctx: Context) {
        super(ctx);

        this.guildCmds = {};
        this.globalCmds = [HelpCommandDesc];
        this.guildHandlers = {};
        this.handlers = {
            [HelpCommandDesc.name]: async (_c: Context, i: APIApplicationCommandInteraction) =>
                this.handleHelp(i),
        };
    }

    public register(
        h: GenericFn<Context, APIApplicationCommandInteraction, APIInteractionResponse>,
        desc: RESTPostAPIApplicationCommandsJSONBody,
        guilds: string[] | undefined = undefined,
    ) {
        const key = desc.name;
        if (this.handlers[key]) throw `global command for ${key} already exists`;

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

    public async handle(
        key: string,
        interaction: APIApplicationCommandInteraction,
    ): Promise<APIInteractionResponse | "missing"> {
        const guildId = interaction.guild?.id;
        const guildHandlers = guildId && this.guildHandlers[guildId];

        const handler =
            guildHandlers && guildHandlers[key] ? guildHandlers[key] : this.handlers[key];

        if (!handler) return "missing";

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

    private handleHelp(
        interaction: APIApplicationCommandInteraction,
    ): APIInteractionResponseChannelMessageWithSource {
        const guildCmds = (interaction.guild && this.guildCmds[interaction.guild.id]) || [];
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

type ModalSubmitInteractionRouter<Context> = GenericSubrouter<
    Context,
    APIModalSubmitInteraction,
    void
>;

type ComponentInteractionSubrouter<Context> = GenericSubrouter<
    Context,
    APIMessageComponentInteraction,
    void
>;
