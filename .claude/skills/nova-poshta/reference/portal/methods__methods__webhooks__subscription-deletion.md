> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/webhooks/subscription-deletion.md).

# Subscription deletion

## Delete a subscription

> This endpoint deletes a subscription specified by its unique identifier. Once deleted, the subscription will no longer receive webhook notifications.\
> The deletion is irreversible and should be used with caution.\
> \
> If you only need to stop sending webhook notifications temporarily, do not delete the subscription — disable it with the \[\*\*Update an existing subscription\*\*]\(<https://api-portal.novapost.com/methods/methods/webhooks/subscription-update>) method by setting \`isActive: false\`. \
> \*\*Please note\*\*: events that occur while the subscription is disabled \*\*are not delivered\*\* after it is enabled again.<br>

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Webhooks"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"security":[{"JWT":[]}],"components":{"securitySchemes":{"JWT":{"type":"apiKey","in":"header","name":"Authorization","description":"Authorization JWT-token with a lifetime of 1 hour in header"}},"responses":{"Unauthorized":{"description":"Unauthorized","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"NotFound":{"description":"The specified resource was not found","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Validation":{"description":"Validation error","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Time-out":{"description":"Connection time-out","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}}},"schemas":{"Error":{"type":"object","properties":{"errors":{"type":"object","properties":{"":{"type":"string"}}}}}}},"paths":{"/tracking-push/subscribers/{id}":{"delete":{"tags":["Webhooks"],"description":"This endpoint deletes a subscription specified by its unique identifier. Once deleted, the subscription will no longer receive webhook notifications.\nThe deletion is irreversible and should be used with caution.\n\nIf you only need to stop sending webhook notifications temporarily, do not delete the subscription — disable it with the [**Update an existing subscription**](https://api-portal.novapost.com/methods/methods/webhooks/subscription-update) method by setting `isActive: false`. \n**Please note**: events that occur while the subscription is disabled **are not delivered** after it is enabled again.\n","operationId":"deleteSubscriber","parameters":[{"name":"id","in":"path","description":"The unique identifier of the subscription to be deleted. This is a required path parameter that identifies the specific subscription you wish to remove.","required":true,"schema":{"type":"string"}}],"responses":{"204":{"description":"Subscription successfully deleted.","content":{"application/json":{"schema":{"type":"object","properties":{"message":{"type":"string","description":"A confirmation message indicating successful deletion of the subscription."}}}}}},"401":{"$ref":"#/components/responses/Unauthorized"},"404":{"$ref":"#/components/responses/NotFound"},"422":{"$ref":"#/components/responses/Validation"},"503":{"$ref":"#/components/responses/Time-out"}},"summary":"Delete a subscription"}}}}
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/webhooks/subscription-deletion.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
