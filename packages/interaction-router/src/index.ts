import {
    APIApplicationCommandAutocompleteInteraction,
    APIApplicationCommandAutocompleteResponse,
    APIApplicationCommandInteraction,
    APIInteraction,
    APIInteractionResponse,
    APIInteractionResponseChannelMessageWithSource,
    APIMessageComponentInteraction,
    APIModalSubmitInteraction,
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
type CommandFn<Context> = GenericFn<
    Context,
    APIApplicationCommandInteraction,
    APIInteractionResponse
>;
type ComponentFn<Context> = GenericFn<Context, APIMessageComponentInteraction, void>;
type AutocompleteFn<Context> = GenericFn<
    Context,
    APIApplicationCommandAutocompleteInteraction,
    APIApplicationCommandAutocompleteResponse
>;
type ModalSubmitFn<Context> = GenericFn<Context, APIModalSubmitInteraction, void>;

const HelpCommandDesc: RESTPostAPIChatInputApplicationCommandsJSONBody = {
    name: "help",
    description: "Show all supported bot commands.",
};

interface CmdInfo {
    discDescription: RESTPostAPIApplicationCommandsJSONBody;
}

export class InteractionRouter<Context> {
    ctx: Context;
    cmdInfo: CmdInfo[];
    commands: ApplicationCommandSubrouter<Context>;
    components: ComponentInteractionSubrouter<Context>;
    completions: AutocompleteInteractionRouter<Context>;
    modalSubmissions: ModalSubmitInteractionRouter<Context>;

    constructor(ctx: Context) {
        this.ctx = ctx;
        this.cmdInfo = [];
        this.components = new Subrouter(ctx);
        this.commands = new Subrouter(ctx);
        this.completions = new Subrouter(ctx);
        this.modalSubmissions = new Subrouter(ctx);
    }

    public registerCommand(
        name: string,
        h: CommandFn<Context>,
        desc: RESTPostAPIApplicationCommandsJSONBody,
    ) {
        this.commands.register(name, h);
        this.cmdInfo.push({ discDescription: desc });
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

    public getCommandSpec(): RESTPostAPIApplicationCommandsJSONBody[] {
        return [HelpCommandDesc, ...this.cmdInfo.map((i) => i.discDescription)];
    }

    public extractIdIdentifier(id: string): string {
        return id.split("_", 1)[0];
    }

    public async handle(interaction: APIInteraction): Promise<APIInteractionResponse | null> {
        if (interaction.type === InteractionType.Ping) {
            return { type: InteractionResponseType.Pong };
        }

        switch (interaction.type) {
            case InteractionType.ApplicationCommand: {
                const { name } = interaction.data;
                if (name === "help") return this.handleHelp();

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

    private handleHelp(): APIInteractionResponseChannelMessageWithSource {
        return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
                flags: MessageFlags.Ephemeral,
                content: formatCommandSet(this.getCommandSpec()),
            },
        };
    }
}

export class Subrouter<Context, In extends APIInteraction, Out> {
    ctx: Context;
    handlers: Record<string, GenericFn<Context, In, Out>>;

    constructor(ctx: Context) {
        this.ctx = ctx;
        this.handlers = {};
    }

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

type ApplicationCommandSubrouter<Context> = Subrouter<
    Context,
    APIApplicationCommandInteraction,
    APIInteractionResponse
>;

type AutocompleteInteractionRouter<Context> = Subrouter<
    Context,
    APIApplicationCommandAutocompleteInteraction,
    APIApplicationCommandAutocompleteResponse
>;

type ModalSubmitInteractionRouter<Context> = Subrouter<Context, APIModalSubmitInteraction, void>;

type ComponentInteractionSubrouter<Context> = Subrouter<
    Context,
    APIMessageComponentInteraction,
    void
>;
