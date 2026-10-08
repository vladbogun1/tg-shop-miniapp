> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/webhooks/deleting-numbers-from-a-subscription.md).

# Deleting numbers from a subscription

Removing a shipment number from the subscription after the shipment reaches a final status is not required. It is recommended to periodically remove completed shipments to keep the list of shipment numbers in the subscription up to date.

## Delete numbers from an existing subscription

> This endpoint allows deleting shipment numbers from a subscription of type numbers.\
> \
> \*\*This endpoint returns a\*\* \`200\` \*\*code in any case, including when no numbers were deleted.\*\* The result of the operation is determined by the \`status\` parameter in the response body, not by the HTTP code.<br>

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Webhooks"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"security":[{"JWT":[]}],"components":{"securitySchemes":{"JWT":{"type":"apiKey","in":"header","name":"Authorization","description":"Authorization JWT-token with a lifetime of 1 hour in header"}},"responses":{"Unauthorized":{"description":"Unauthorized","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"NotFound":{"description":"The specified resource was not found","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Validation":{"description":"Validation error","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Time-out":{"description":"Connection time-out","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}}},"schemas":{"Error":{"type":"object","properties":{"errors":{"type":"object","properties":{"":{"type":"string"}}}}}}},"paths":{"/tracking-push/subscribers/{id}/numbers":{"delete":{"summary":"Delete numbers from an existing subscription","description":"This endpoint allows deleting shipment numbers from a subscription of type numbers.\n\n**This endpoint returns a** `200` **code in any case, including when no numbers were deleted.** The result of the operation is determined by the `status` parameter in the response body, not by the HTTP code.\n","operationId":"deleteNumbersToSubscriber","tags":["Webhooks"],"parameters":[{"name":"id","in":"path","description":"The unique identifier of the subscription to which shipment numbers will be deleted. This is a required path parameter.","required":true,"schema":{"type":"string"}}],"requestBody":{"description":"The payload containing the list of shipment numbers to be deleted from the subscription. The subscription type must be `numbers` for this operation to be valid.","required":true,"content":{"application/json":{"schema":{"type":"object","additionalProperties":false,"properties":{"numbers":{"type":"array","description":"A list of shipment numbers to be deleted to the subscription.","items":{"type":"string"}}}}}}},"responses":{"200":{"description":"Numbers processed successfully.","content":{"application/json":{"schema":{"type":"object","properties":{"status":{"type":"string","description":"The result of the operation:\n- `success` — all numbers were deleted;\n- `partial_success` — some of the numbers were deleted;\n- `error` — none of the numbers were deleted.\n","enum":["success","partial_success","error"]},"successful":{"type":"object","description":"Contains information about the successful part of the operation.\n\n🔹This block is absent if `status` is `error`.\n","properties":{"message":{"type":"string","description":"A text description of the successful part of the operation."},"deletedNumbers":{"type":"array","description":"The list of numbers that were successfully deleted from the subscription.","items":{"type":"string"}},"deletedCount":{"type":"integer","description":"The number of deleted numbers."}}},"errors":{"type":"object","description":"Contains information about the failed part of the operation.\n\n🔹This block is absent if `status` is `success`.\n","properties":{"message":{"type":"string","description":"A text description of the failed part of the operation."},"notFoundNumbers":{"type":"array","description":"The list of numbers that were not found in the subscription.","items":{"type":"string"}},"errorCount":{"type":"integer","description":"The number of numbers that were not deleted."}}}}}}}},"401":{"$ref":"#/components/responses/Unauthorized"},"404":{"$ref":"#/components/responses/NotFound"},"422":{"$ref":"#/components/responses/Validation"},"503":{"$ref":"#/components/responses/Time-out"}}}}}}
```

### Deprecated parameters

Some parameters are duplicated in `snake_case` notation. These parameters are kept solely for backward compatibility — use the `camelCase` variants for new integrations.

<table data-search="false"><thead><tr><th>Deprecated parameter</th><th>Use instead</th></tr></thead><tbody><tr><td><code>deleted_numbers</code></td><td><code>deletedNumbers</code></td></tr><tr><td><code>deleted_count</code></td><td><code>deletedCount</code></td></tr><tr><td><code>not_found_numbers</code></td><td><code>notFoundNumbers</code></td></tr><tr><td><code>error_count</code></td><td><code>errorCount</code></td></tr></tbody></table>

The same deprecated parameters are present in the responses to subscription creation and update. They are not repeated further in this article.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/webhooks/deleting-numbers-from-a-subscription.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
