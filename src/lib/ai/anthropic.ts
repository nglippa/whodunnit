import "server-only";

/** The web app's entry point to the Anthropic provider: server-only, so it can never reach a client bundle. */
export { AnthropicProvider } from "./anthropic-provider";
