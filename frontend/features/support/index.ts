// Entry points are split per route (chat.ts, list.ts): a route imports only its own screen.
export { SupportChatScreen } from "./chat";
export { SupportListScreen } from "./list";
export { supportApi, parseSupportDeepLink } from "./api";
