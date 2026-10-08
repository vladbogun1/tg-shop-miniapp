> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/webhooks/subscription-list.md).

# Subscription list

## Retrieve all subscriptions

> Retrieve a list of all subscriptions associated with the client.<br>

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Webhooks"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"security":[{"JWT":[]}],"components":{"securitySchemes":{"JWT":{"type":"apiKey","in":"header","name":"Authorization","description":"Authorization JWT-token with a lifetime of 1 hour in header"}},"responses":{"Unauthorized":{"description":"Unauthorized","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"NotFound":{"description":"The specified resource was not found","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Validation":{"description":"Validation error","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Time-out":{"description":"Connection time-out","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}}},"schemas":{"Error":{"type":"object","properties":{"errors":{"type":"object","properties":{"":{"type":"string"}}}}}}},"paths":{"/tracking-push/subscribers":{"get":{"tags":["Webhooks"],"description":"Retrieve a list of all subscriptions associated with the client.\n","operationId":"getSubscribers","parameters":[{"in":"query","name":"page","required":false,"description":"The page number to return.","schema":{"type":"integer"}},{"in":"query","name":"limit","required":false,"description":"The maximum number of items to return per page.","schema":{"type":"integer"}}],"responses":{"200":{"description":"Successful response containing a list of subscriptions.","content":{"application/json":{"schema":{"type":"object","properties":{"current_page":{"type":"integer","description":"The current page of the paginated result set."},"last_page":{"type":"integer","description":"The last page of the paginated result set."},"per_page":{"type":"integer","description":"The number of items per page."},"total":{"type":"integer","description":"The total number of subscription items available."},"items":{"type":"array","description":"The array of subscription items.","items":{"type":"object","properties":{"id":{"type":"string","description":"The public identifier of the subscription."},"type":{"type":"string","description":"The type of subscription. Can be `individual`, `numbers`, `legal`, `recipientLegal` or `creator`."},"url":{"type":"string","format":"uri","description":"The callback URL for the webhook notifications."},"isActive":{"type":"boolean","description":"Indicates if the subscription is currently active."},"phone":{"type":"string","description":"The phone number associated with the subscription."},"cid":{"type":"string","description":"Unique user identifier"},"eventTypes":{"type":"array","description":"The list of event types the subscription is interested in.","items":{"type":"string"}},"sendWarnings":{"type":"boolean","description":"Indicates whether email warnings are sent for incorrect endpoint operations."},"warningEmail":{"type":"string","format":"email","description":"The email address used for sending warnings."},"sendFullHistoryForMultiParcel":{"type":"boolean","description":"Defines how webhook notifications are sent for multi-parcel shipments.\n\n🔹If `true`, a separate webhook notification is sent for each parcel in the shipment. The request body structure remains unchanged.\n","default":false},"contentType":{"type":"string","description":"Specifies the content type used for webhook request payloads. The default value is `application/json`."},"companyTins":{"type":"array","description":"The list of company tax identification numbers of a legal entity associated with the subscription.","items":{"type":"string"}},"secretToken":{"type":"string","description":"Webhook authorization token used to validate incoming webhook requests.\n\n🔸The token is optional and, if provided, must consist only of alphanumeric characters.\n","minLength":0,"maxLength":600,"pattern":"^[A-Za-z0-9]+$"},"secretTokenHeaderName":{"type":"string","description":"Header name used to transmit the `secretToken` in webhook requests.\n\nIf `secret_token_header_name` is provided and is not null, its value is used as the header name for transmitting the `secretToken`.</br>\nIf `secret_token_header_name` is not provided or is set to null, the default header name `X-NP-Key` is used.\n\n🔸If provided, the header name must consist only of Latin letters, digits, and hyphens, must not start or end with a hyphen, and must not contain spaces or other special characters.\n"},"updatedAt":{"type":"string","format":"datetime","description":"The timestamp when the subscription was last updated."},"createdAt":{"type":"string","format":"datetime","description":"The timestamp when the subscription was created."},"numbers":{"type":"array","description":"The list of tracking numbers associated with the subscription.","items":{"type":"string"}}}}}}}}}},"401":{"$ref":"#/components/responses/Unauthorized"},"404":{"$ref":"#/components/responses/NotFound"},"422":{"$ref":"#/components/responses/Validation"},"503":{"$ref":"#/components/responses/Time-out"}},"summary":"Retrieve all subscriptions"}}}}
```

### Deprecated parameters

Some parameters are duplicated in `snake_case` notation. These parameters are kept solely for backward compatibility — use the `camelCase` variants for new integrations.

<table data-search="false"><thead><tr><th>Deprecated parameter</th><th>Use instead</th></tr></thead><tbody><tr><td><code>is_active</code></td><td><code>isActive</code></td></tr><tr><td><code>event_types</code></td><td><code>eventTypes</code></td></tr><tr><td><code>send_warnings</code></td><td><code>sendWarnings</code></td></tr><tr><td><code>warning_email</code></td><td><code>warningEmail</code></td></tr><tr><td><code>company_tins</code></td><td><code>companyTins</code></td></tr><tr><td><code>secret_token</code></td><td><code>secretToken</code></td></tr><tr><td><code>secret_token_header_name</code></td><td><code>secretTokenHeaderName</code></td></tr><tr><td><code>created_at</code></td><td><code>createdAt</code></td></tr><tr><td><code>updated_at</code></td><td><code>updatedAt</code></td></tr></tbody></table>

The same deprecated parameters are present in the responses to subscription creation and update. They are not repeated further in this article.

<br>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/webhooks/subscription-list.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
