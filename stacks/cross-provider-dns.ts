import * as Alchemy from "alchemy";
import * as AWS from "alchemy/AWS";
import * as Cloudflare from "alchemy/Cloudflare";
import * as DNS from "alchemy/DNS";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { fileURLToPath } from "node:url";

export default Alchemy.Stack(
  "CrossProviderDns",
  {
    providers: Layer.mergeAll(
      AWS.providers(),
      Cloudflare.providers(),
      DNS.adapterLayer(Cloudflare.DNS.cloudflareDnsAdapter),
    ),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const domain = yield* Config.String("DOMAIN");
    const routerDomain = `alchemy-router.${domain}`;

    const router = yield* AWS.Website.Router("Router", {
      domain: { name: routerDomain, dns: Cloudflare.DNS.dns() },
    });
    const site = yield* AWS.Website.StaticSite("Site", {
      path: fileURLToPath(new URL("./cross-provider-dns-assets", import.meta.url)),
      domain: { router },
    });

    return {
      routerUrl: router.url,
      siteUrl: site.url,
    };
  }),
);
