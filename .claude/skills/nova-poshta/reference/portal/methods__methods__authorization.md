> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/authorization.md).

# Authorization

## Generate a temporary JWT-token

> Issues a temporary JWT-token for making authorized API requests. \
> A valid apiKey must be provided as a query parameter.\
> \
> How to obtain an apiKey:\
> \- In Sandbox, use POST \`/test-api-keys\` with a registered phone number from the Client Portal (EBC): <https://my.novapost.com/\\>
> \- In PROD, use your personal apiKey provided by your manager\
> \
> Usage:\
> \- Call GET \`/clients/authorization?apiKey={apiKey}\`\
> \- On success, copy the jwt from the response\
> \- Open the \*\*\[Authorize]\(<https://api.novapost.com/developers/index.html#auth)\\*\\>\* dialog in this documentation, select the \`JWT\` scheme, and paste the jwt\
> \- All Try-it-out requests will then automatically include \`Authorization: {jwt}\`\
> &#x20;\
> Notes:\
> \- The jwt is valid for \~1 hour; request a new one after expiry\
> \- Do not store jwt beyond its TTL\
> \- The \`/test-api-keys\` route is not available in PROD<br>

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Authorization"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"paths":{"/clients/authorization":{"get":{"tags":["Authorization"],"summary":"Generate a temporary JWT-token","description":"Issues a temporary JWT-token for making authorized API requests. \nA valid apiKey must be provided as a query parameter.\n\nHow to obtain an apiKey:\n- In Sandbox, use POST `/test-api-keys` with a registered phone number from the Client Portal (EBC): https://my.novapost.com/\n- In PROD, use your personal apiKey provided by your manager\n\nUsage:\n- Call GET `/clients/authorization?apiKey={apiKey}`\n- On success, copy the jwt from the response\n- Open the **[Authorize](https://api.novapost.com/developers/index.html#auth)** dialog in this documentation, select the `JWT` scheme, and paste the jwt\n- All Try-it-out requests will then automatically include `Authorization: {jwt}`\n \nNotes:\n- The jwt is valid for ~1 hour; request a new one after expiry\n- Do not store jwt beyond its TTL\n- The `/test-api-keys` route is not available in PROD\n","parameters":[{"in":"query","required":true,"name":"apiKey","schema":{"type":"string"},"description":"To utilize this method, a personal API key is required."}],"responses":{"200":{"description":"JWT-token","content":{"application/json":{"schema":{"type":"object","properties":{"jwt":{"type":"string","description":"Personal JWT-token, expires after one hour to prevent any fraud, requiring a new request to generate a fresh token.","format":"json"}}}}}},"401":{"$ref":"#/components/responses/Unauthorized"},"422":{"$ref":"#/components/responses/Validation"},"503":{"$ref":"#/components/responses/Time-out"}}}}},"components":{"responses":{"Unauthorized":{"description":"Unauthorized","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Validation":{"description":"Validation error","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Time-out":{"description":"Connection time-out","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}}},"schemas":{"Error":{"type":"object","properties":{"errors":{"type":"object","properties":{"":{"type":"string"}}}}}}}}
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/authorization.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
