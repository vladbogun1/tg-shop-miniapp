> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/webhooks/adding-numbers-to-a-subscription.md).

# Adding numbers to a subscription

## Add numbers to an existing subscription

> This endpoint allows adding shipment numbers to a subscription of type \`numbers\`.\
> \
> Only numbers that already exist in the Nova Post system are added. A number that does not yet exist in the system is not added to the subscription — it has to be added again after the shipment has been created.\
> A \`200\` code means that \*\*at least one\*\* number was added, not necessarily all of the numbers passed. Always check the contents of \`missedNumbers\`.\
> \
> There is no limit on the number of shipment numbers that can be added to a subscription of type \`numbers\`.\
> \
> Once a shipment reaches a final status, its number does not need to be removed from the subscription. However, we recommend removing completed shipments to keep the list of shipment numbers in the subscription up to date.<br>

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Webhooks"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"security":[{"JWT":[]}],"components":{"securitySchemes":{"JWT":{"type":"apiKey","in":"header","name":"Authorization","description":"Authorization JWT-token with a lifetime of 1 hour in header"}},"responses":{"Unauthorized":{"description":"Unauthorized","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"NotFound":{"description":"The specified resource was not found","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Validation":{"description":"Validation error","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Time-out":{"description":"Connection time-out","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}}},"schemas":{"Error":{"type":"object","properties":{"errors":{"type":"object","properties":{"":{"type":"string"}}}}}}},"paths":{"/tracking-push/subscribers/{id}/numbers":{"post":{"summary":"Add numbers to an existing subscription","description":"This endpoint allows adding shipment numbers to a subscription of type `numbers`.\n\nOnly numbers that already exist in the Nova Post system are added. A number that does not yet exist in the system is not added to the subscription — it has to be added again after the shipment has been created.\nA `200` code means that **at least one** number was added, not necessarily all of the numbers passed. Always check the contents of `missedNumbers`.\n\nThere is no limit on the number of shipment numbers that can be added to a subscription of type `numbers`.\n\nOnce a shipment reaches a final status, its number does not need to be removed from the subscription. However, we recommend removing completed shipments to keep the list of shipment numbers in the subscription up to date.\n","operationId":"addNumbersToSubscriber","tags":["Webhooks"],"parameters":[{"name":"id","in":"path","description":"The unique identifier of the subscription to which shipment numbers will be added. This is a required path parameter.","required":true,"schema":{"type":"string"}}],"requestBody":{"description":"The payload containing the list of shipment numbers to be added to the subscription. The subscription type must be `numbers` for this operation to be valid.","required":true,"content":{"application/json":{"schema":{"type":"object","additionalProperties":false,"properties":{"numbers":{"type":"array","description":"A list of shipment numbers to be added to the subscription.","items":{"type":"string"}}}}}}},"responses":{"200":{"description":"All or some of the numbers were successfully added to the subscription.","content":{"application/json":{"schema":{"type":"object","properties":{"message":{"type":"string","description":"A text description of the operation result."},"addedNumbers":{"type":"array","description":"The list of numbers that were successfully added to the subscription.","items":{"type":"string"}},"missedNumbers":{"type":"array","description":"The list of numbers that could not be added. These numbers were not found in the system or are already linked to this subscription.","items":{"type":"string"}}}}}}},"400":{"description":"None of the numbers were added to the subscription.","content":{"application/json":{"schema":{"type":"object","properties":{"message":{"type":"string","description":"A text description of the operation result."},"addedNumbers":{"type":"array","description":"The list of numbers that were successfully added to the subscription.","items":{"type":"string"}},"missedNumbers":{"type":"array","description":"The list of numbers that could not be added. These numbers were not found in the system or are already linked to this subscription.","items":{"type":"string"}}}}}}},"401":{"$ref":"#/components/responses/Unauthorized"},"404":{"$ref":"#/components/responses/NotFound"},"422":{"$ref":"#/components/responses/Validation"},"503":{"$ref":"#/components/responses/Time-out"}}}}}}
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/webhooks/adding-numbers-to-a-subscription.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
