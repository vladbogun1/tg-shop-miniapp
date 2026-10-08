> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/webhooks/test-webhook.md).

# Test webhook

## Checking the test webhook

> This endpoint allows you to test the webhook functionality. At least one active subscription is required for a successful response.\
> \
> Webhook requests are sent using the \`application/json\` Content-Type by default.\
> \
> 🔹\*\*Test webhook behavior:\*\*\</br>\
> The method returns a confirmation response indicating that a test webhook request was sent.\
> A webhook event with tracking data is delivered to the subscriber endpoint.\
> \
> This confirmation \*\*does not guarantee\*\* that your server received the request. \
> Perform the final check in the logs of your own server: an incoming POST request with the correct secret header must appear there.\
> \
> The test webhook contains a synthetic tracking history. It does not verify the match with a real shipment or the \`eventTypes\` settings.\
> \
> 🔹\*\*Webhook payload parameters:\*\*\</br>\
> The webhook request body looks as follows:\
> \`\`\`json\
> {\
> &#x20; "number": "SHPL0000000001",\
> &#x20; "scheduled\_delivery\_date": "2024-11-20T20:03:00.000000Z",\
> &#x20; "history\_tracking": \[\
> &#x20;   {\
> &#x20;     "code": "4",\
> &#x20;     "code\_name": "On the way",\
> &#x20;     "country\_code": "UA",\
> &#x20;     "settlement": "Kyiv",\
> &#x20;     "date": "2024-11-19T09:32:05.000000Z"\
> &#x20;   },\
> &#x20;   {\
> &#x20;     "code": "112",\
> &#x20;     "code\_name": "Change of delivery date",\
> &#x20;     "country\_code": "",\
> &#x20;     "settlement": "",\
> &#x20;     "date": "2024-11-19T09:33:56.000000Z"\
> &#x20;   }\
> &#x20; ]\
> }\
> \`\`\`\
> with the following parameters:\
> \- \`number\` — shipment number.\
> \- \`scheduled\_delivery\_date\` — scheduled delivery date and time in ISO 8601 format.\
> \- \`history\_tracking\` — array of tracking status objects.\
> &#x20; \- \`code\` — tracking status code.\</br>For more details about tracking status codes, see the description of the \`currentStatus.statusCode\` parameter in the response of the \<a href="<https://api-portal.novapost.com/methods/methods/shipments/tracking-shipment#get-shipments-tracking>" target="\_new">\<b>FullTracking\</b>\</a> method.\
> &#x20; \- \`code\_name\` — tracking status name.\
> &#x20; \- \`country\_code\` — country code where the status was recorded.\
> &#x20; \- \`settlement\` — settlement name.\
> &#x20; \- \`date\` — timestamp of the status event.\
> \
> The payload contains at least one tracking status.\</br>\
> Each subsequent webhook delivery includes the newly added status and all previously delivered statuses.<br>

````json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Webhooks"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"security":[{"JWT":[]}],"components":{"securitySchemes":{"JWT":{"type":"apiKey","in":"header","name":"Authorization","description":"Authorization JWT-token with a lifetime of 1 hour in header"}},"responses":{"Unauthorized":{"description":"Unauthorized","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"NotFound":{"description":"The specified resource was not found","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Validation":{"description":"Validation error","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}},"Time-out":{"description":"Connection time-out","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}}},"schemas":{"Error":{"type":"object","properties":{"errors":{"type":"object","properties":{"":{"type":"string"}}}}}}},"paths":{"/tracking-push/subscribers/test-webhook":{"post":{"summary":"Checking the test webhook","description":"This endpoint allows you to test the webhook functionality. At least one active subscription is required for a successful response.\n\nWebhook requests are sent using the `application/json` Content-Type by default.\n\n🔹**Test webhook behavior:**</br>\nThe method returns a confirmation response indicating that a test webhook request was sent.\nA webhook event with tracking data is delivered to the subscriber endpoint.\n\nThis confirmation **does not guarantee** that your server received the request. \nPerform the final check in the logs of your own server: an incoming POST request with the correct secret header must appear there.\n\nThe test webhook contains a synthetic tracking history. It does not verify the match with a real shipment or the `eventTypes` settings.\n\n🔹**Webhook payload parameters:**</br>\nThe webhook request body looks as follows:\n```json\n{\n  \"number\": \"SHPL0000000001\",\n  \"scheduled_delivery_date\": \"2024-11-20T20:03:00.000000Z\",\n  \"history_tracking\": [\n    {\n      \"code\": \"4\",\n      \"code_name\": \"On the way\",\n      \"country_code\": \"UA\",\n      \"settlement\": \"Kyiv\",\n      \"date\": \"2024-11-19T09:32:05.000000Z\"\n    },\n    {\n      \"code\": \"112\",\n      \"code_name\": \"Change of delivery date\",\n      \"country_code\": \"\",\n      \"settlement\": \"\",\n      \"date\": \"2024-11-19T09:33:56.000000Z\"\n    }\n  ]\n}\n```\nwith the following parameters:\n- `number` — shipment number.\n- `scheduled_delivery_date` — scheduled delivery date and time in ISO 8601 format.\n- `history_tracking` — array of tracking status objects.\n  - `code` — tracking status code.</br>For more details about tracking status codes, see the description of the `currentStatus.statusCode` parameter in the response of the <a href=\"https://api-portal.novapost.com/methods/methods/shipments/tracking-shipment#get-shipments-tracking\" target=\"_new\"><b>FullTracking</b></a> method.\n  - `code_name` — tracking status name.\n  - `country_code` — country code where the status was recorded.\n  - `settlement` — settlement name.\n  - `date` — timestamp of the status event.\n\nThe payload contains at least one tracking status.</br>\nEach subsequent webhook delivery includes the newly added status and all previously delivered statuses.\n","operationId":"testWebhook","tags":["Webhooks"],"requestBody":{"content":{"application/json":{"schema":{"type":"object","additionalProperties":false,"properties":{"numbers":{"type":"array","description":"The test shipment number. Always `SHPL0000000001`.","items":{"type":"string"}},"id":{"type":"string","description":"The unique identifier of the subscription you are checking."},"cid":{"type":"string","description":"Unique user identifier. This is the only method where it has to be passed explicitly."}},"required":["id","cid","numbers"]}}}},"responses":{"200":{"description":"Test webhook was sent successfully.","content":{"application/json":{"schema":{"type":"object","properties":{"success":{"type":"string","description":"Confirmation message about successful test."}}}}}},"401":{"$ref":"#/components/responses/Unauthorized"},"404":{"$ref":"#/components/responses/NotFound"},"422":{"$ref":"#/components/responses/Validation"},"503":{"$ref":"#/components/responses/Time-out"}}}}}}
````


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/webhooks/test-webhook.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
