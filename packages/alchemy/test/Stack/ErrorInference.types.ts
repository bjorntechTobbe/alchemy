import * as AWS from "@/AWS";
import * as Alchemy from "@/index";
import * as Cloudflare from "@/Cloudflare";
import * as DNS from "@/DNS";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { fileURLToPath } from "node:url";

const stack = Alchemy.Stack(
  "StackErrorInference",
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
    const router = yield* AWS.Website.Router("Router", {
      domain: {
        name: `alchemy-router.${domain}`,
        dns: Cloudflare.DNS.dns(),
      },
    });
    const site = yield* AWS.Website.StaticSite("Site", {
      path: fileURLToPath(
        new URL(
          "../../../../stacks/cross-provider-dns-assets",
          import.meta.url,
        ),
      ),
      domain: { router },
    });
    return { routerUrl: router.url, siteUrl: site.url };
  }),
);

void stack;
