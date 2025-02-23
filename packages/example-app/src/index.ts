import verify from "webhook-verifier";
import { InteractionRouter } from "interaction-router";

import { AppContext } from "./context";
import { handleHello as helloHandler, helloCommand } from "./hello";
import { thinkCommand, thinkHandler } from "./think";

function router(exec: ExecutionContext, env: Env): InteractionRouter<AppContext> {
    const appName = "Example Bot";
    const discordToken = env.DISCORD_BOT_TOKEN;
    const appId = env.DISCORD_CLIENT_ID;

    const ctx: AppContext = { appName, exec, appId, discordToken };
    const router = new InteractionRouter(ctx);

    router.registerCommand(helloHandler, helloCommand);
    router.registerCommand(thinkHandler, thinkCommand);

    return router;
}

async function register(router: InteractionRouter<AppContext>, token: string, appId: string, guildId: string): Promise<Response> {
    const headers = {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
    }

    const guildSubmit = async () => {
        const spec = router.getCommandsForGuild(guildId);
        const url = `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`;
        const resp = await fetch(url, { method: "PUT", body: JSON.stringify(spec), headers });
        console.log(resp.status, await resp.text());
    }

    const globalSubmit = async () => {
        const spec = router.getGlobalCommands();
        const url = `https://discord.com/api/v10/applications/${appId}/commands`;
        const resp = await fetch(url, { method: "PUT", body: JSON.stringify(spec), headers });
        console.log(resp.status, await resp.text());
    }

    await Promise.all([globalSubmit(), guildSubmit()]);

    return new Response("");
}

export default {
    async fetch(request, env, ctx): Promise<Response> {
        const r = router(ctx, env);

        const url = new URL(request.url);
        if (url.pathname === "/register")
            return await register(r, env.DISCORD_BOT_TOKEN, env.DISCORD_CLIENT_ID, "615745951184715806");

        const body = await request.text();
        if (!(await verify(env.DISCORD_PUBLIC_KEY, request.headers, body)))
            return new Response("", { status: 401 });

        const interaction = JSON.parse(body);
        const resp = await r.handle(interaction);
        console.log(resp);

        return new Response(JSON.stringify(resp), {
            headers: {
                "Content-Type": "application/json",
            },
        });
    },
} satisfies ExportedHandler<Env>;
