/**
 * Схемы ответов и запросов бэкенда: `Schemas["OrderCardDto"]`. Только типы (ноль рантайма), генерируются из
 * backend/src/test/resources/openapi/openapi.json командой `npm run gen:api` (docs/ARCHITECTURE-FRONT.md, 2.6).
 */
import type { components } from "./generated";

export type Schemas = components["schemas"];
