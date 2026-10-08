> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/webhooks.md).

# Webhooks

A webhook is a way to receive shipment status changes without polling the API from your side. You specify a callback URL once, and Nova Post sends a webhook notification to it every time the status of a shipment changes.

Setting up this connection is called a **subscription**. This article describes how to create a subscription, manage it, and what exactly arrives at your server.

### How it works

1. You create a subscription and specify the callback URL and the type of shipments you are interested in.
2. Nova Post tracks status changes of the shipments covered by this subscription.
3. After the shipment status changes, the system generates a webhook notification and sends a POST request to the callback URL containing the shipment number and its status history.
4. Your server responds with a 2xx code — this confirms that the notification has been received.

#### When a webhook notification is sent

{% hint style="info" %}
A webhook notification is sent when the status of a shipment **changes to a new one**.

Notifications are not sent for events that occurred before the subscription was created. Notifications are only sent while an active subscription exists.
{% endhint %}

In the tracking history, the same status code may repeat several times in a row. In this case a webhook notification is sent only once — when this status is set for the first time. The next notification arrives when the status changes to a different one.

The comparison is made against the **previous** status, not against the entire history. Therefore, if the status returns to a previous value after a different one, this counts as a new change and a webhook notification is sent again.

<table><thead><tr><th width="200">Sequence of statuses</th><th width="267">Number of webhook notifications</th><th>For which statuses</th></tr></thead><tbody><tr><td>4 → 4 → 4 → 5</td><td>2</td><td>4, 5</td></tr><tr><td>4 → 5 → 5 → 9</td><td>3</td><td>4, 5, 9</td></tr><tr><td>4 → 5 → 4</td><td>3</td><td>4, 5, 4 again</td></tr></tbody></table>

{% hint style="info" %}
If a shipment is covered by several of your subscriptions at once, the webhook notification is sent **once** — the system prevents duplication. There is no need to create several subscriptions for the same shipments.
{% endhint %}

#### Subscription Limits and Validity

There is no limit on the number of subscriptions that can be created for a single client. A client may create multiple subscriptions of the same type.  Subscriptions do not expire and remain active until they are deactivated or deleted.

For subscriptions of the `numbers` type, there is no limit on the number of shipment numbers that can be added. Once a shipment reaches a final status, its number does not need to be removed from the subscription. However, removing completed shipments is recommended to keep the list of tracked shipments up to date.

#### Your server's response

Your server must respond with a code in the 2xx range — this means that the notification has been accepted. Any other response, as well as no response at all, is treated as a failed delivery.

Do not perform long processing before you respond: accept the notification, put it into your own queue and return 2xx immediately, then handle the business logic separately.

#### Retry attempts

If your server is unavailable, does not respond in time or returns an error code, the system performs **up to 6 retry attempts** with increasing intervals:

<table data-search="false"><thead><tr><th>Attempt</th><th>Interval after the previous one</th></tr></thead><tbody><tr><td>1st retry</td><td>5 seconds</td></tr><tr><td>2nd retry</td><td>10 seconds</td></tr><tr><td>3rd retry</td><td>20 seconds</td></tr><tr><td>4th retry</td><td>40 seconds</td></tr><tr><td>5th retry</td><td>80 seconds</td></tr><tr><td>6th retry</td><td>160 seconds</td></tr></tbody></table>

If `sendWarnings` is enabled for the subscription, a warning email is sent to the address specified in `warningEmail` after the **third failed delivery attempt of one message**.

After the sixth failed attempt, resending of this message stops. The subscription itself is not changed and remains active: when the shipment status changes next time, a new webhook notification is generated and its delivery starts from the beginning.

#### Protection against duplicate processing

Because of retry attempts, your server may receive the same notification several times. To prevent double processing, use the `x-np-attempt` header.

The header has the format `{message UUID}.{attempt number}`:

```
x-np-attempt: 8f14e45f-ceea-467e-9a3a-0e1a1b1e2b1c.1
x-np-attempt: 8f14e45f-ceea-467e-9a3a-0e1a1b1e2b1c.2
```

Both lines are the same notification sent twice. The UUID before the dot does not change across all delivery attempts of one event and is unique for different events, which makes it the key for duplicate checks. The number after the dot shows which attempt it is.

### Before you start

#### What to prepare

<table><thead><tr><th width="59">#</th><th width="241">What is required</th><th>Description</th></tr></thead><tbody><tr><td>1</td><td>A public HTTPS endpoint</td><td>An address on your server that accepts POST requests. It must be reachable from the internet and must not perform redirects.</td></tr><tr><td>2</td><td>A JWT-token</td><td>Required to authorize requests to the Nova Post API.</td></tr><tr><td>3</td><td>Your own secret token</td><td>A string that you generate yourself. Nova Post adds it to every webhook request so that your server can verify that the request really came from Nova Post.</td></tr><tr><td>4</td><td>A list of shipments or a rule for selecting them</td><td>Depends on the subscription type — see the <a href="/methods/methods/webhooks/subscription-types.md"><strong>Subscription types</strong></a> section.</td></tr><tr><td>5</td><td>A list of event types</td><td>Optional. If no filter is required, all supported events are sent. For the allowed values, see the <a href="/methods/methods/webhooks/event-types-and-tracking-status-codes.md#event-types-for-the-eventtypes-parameter"><strong>Event types for the eventTypes parameter</strong> </a>section.</td></tr></tbody></table>

{% hint style="warning" %}
**The JWT-token and your own secret token are different credentials with different purposes**. \
The JWT-token is required for Nova Post to authorize your requests. The secret token is required for you to validate incoming webhook requests. Do not use one instead of the other and do not pass the JWT-token in the callback URL.
{% endhint %}

#### Environments

<table><thead><tr><th width="133">Environment</th><th width="341">Base URL</th><th>Purpose</th></tr></thead><tbody><tr><td><strong>Sandbox</strong></td><td><code>https://api-stage.novapost.com/v.1.0/</code></td><td>Integration testing. In Sandbox <strong>only the test webhook can be</strong> <strong>sent</strong> — real shipment status changes do not generate webhook notifications.</td></tr><tr><td><strong>PROD</strong></td><td><code>https://api.novapost.com/v.1.0/</code></td><td>Production environment.</td></tr></tbody></table>

### Webhook request structure

#### Headers

<table><thead><tr><th width="200">Header</th><th>Description</th></tr></thead><tbody><tr><td><code>Content-Type</code></td><td>The <strong>Content-Type</strong> specified in the <code>contentType</code> parameter of the subscription. The default value is <code>text/plain</code>.</td></tr><tr><td><code>X-NP-Key</code> <strong>or a custom name</strong></td><td>The secret token of the subscription. The header name is taken from the <code>secretTokenHeaderName</code> parameter; if it is not set, <code>X-NP-Key</code> is used.</td></tr><tr><td><code>x-np-attempt</code></td><td>The delivery attempt identifier in the format <code>{message UUID}.{attempt number}</code>. Used to protect against duplicate processing.</td></tr></tbody></table>

#### Request body

```
{
  "number": "SHPL0000000001",
  "scheduled_delivery_date": "2024-11-20T20:03:00.000000Z",
  "history_tracking": [
    {
      "code": "4",
      "code_name": "On the way",
      "country_code": "UA",
      "settlement": "Kyiv",
      "date": "2024-11-19T09:32:05.000000Z"
    },
    {
      "code": "112",
      "code_name": "Change of delivery date",
      "country_code": "",
      "settlement": "",
      "date": "2024-11-19T09:33:56.000000Z"
    }
  ]
}
```

<table data-search="false"><thead><tr><th width="290">Parameter</th><th>Type</th><th>Description</th></tr></thead><tbody><tr><td><code>number</code></td><td>string</td><td>Shipment number.</td></tr><tr><td><code>scheduled_delivery_date</code></td><td>string</td><td>Scheduled delivery date and time in ISO 8601 format. May be empty.</td></tr><tr><td><code>history_tracking</code></td><td>string[]</td><td>Array of tracking status objects.</td></tr><tr><td><code>history_tracking[].code</code></td><td>string</td><td>Tracking status code. <br><strong>Build your business logic on</strong> <strong>this parameter</strong> — it is stable. For the allowed values, see the <a href="/methods/methods/webhooks/event-types-and-tracking-status-codes.md#tracking-status-codes"><strong>Tracking status codes</strong></a> section.</td></tr><tr><td><code>history_tracking[].code_name</code></td><td>string</td><td>Tracking status name. It may change and is provided for readability only — do not use it for comparisons in your code.</td></tr><tr><td><code>history_tracking[].country_code</code></td><td>string</td><td>Country code where the status was recorded. May be empty.</td></tr><tr><td><code>history_tracking[].settlement</code></td><td>string</td><td>Settlement name. May be empty.</td></tr><tr><td><code>history_tracking[].date</code></td><td>string</td><td>Timestamp of the status event.</td></tr></tbody></table>

The webhook request body contains at least one tracking status. Each subsequent webhook notification contains the newly added status and all previously delivered statuses. The current status is the one with the latest `date` value.

#### Authorization

Every request to the API must contain the Authorization header with a JWT-token:

```
Authorization: {jwt}
```

The token is valid for approximately 1 hour, after which a new one must be requested. The procedure for obtaining a token is described in the [Authorization](/methods/methods/authorization.md) article.

### List of methods

<table data-search="false"><thead><tr><th width="238">Name</th><th>Description</th></tr></thead><tbody><tr><td><a href="/methods/methods/webhooks/subscription-list.md"><strong>Retrieve all subscriptions</strong></a></td><td>Retrieve a list of all subscriptions associated with the client.</td></tr><tr><td><a href="/methods/methods/webhooks/new-subscription.md"><strong>Create a new subscription</strong></a></td><td>This endpoint is used to create a new subscription for receiving tracking notifications via webhooks. The subscription can be of various types, such as for a single number or for a company, and is essential for clients who want to receive real-time updates about shipment statuses.</td></tr><tr><td><a href="/methods/methods/webhooks/subscription-update.md"><strong>Update an existing subscription</strong></a></td><td><p>This endpoint updates an existing subscription's details such as the callback URL, activation status, event types, and more.</p><p>It is used for modifying subscription settings by clients who wish to manage how they receive tracking notifications.</p><p><strong>This endpoint performs a full replacement of the settings, not a</strong> <strong>partial update</strong>. Parameters that you do not pass are reset. For example, if you change only url, the subscription loses its <code>eventTypes</code> filter and starts receiving webhook notifications for all events. Always pass the full set of parameters, even if you change only one of them.</p><p><strong>The subscription type cannot be changed</strong>. If you pass the type parameter with a different value in the request, the change is not applied. To switch to another type, create a new subscription and delete the old one.</p><p><strong>Please note:</strong> events that occur while the subscription is disabled are not delivered after it is enabled again.</p></td></tr><tr><td><a href="/methods/methods/webhooks/subscription-deletion.md"><strong>Delete a subscription</strong></a></td><td><p>This endpoint deletes a subscription specified by its unique identifier. Once deleted, the subscription no longer receives webhook notifications. The deletion is irreversible and should be used with caution.</p><p>If you only need to stop sending webhook notifications temporarily, do not delete the subscription — disable it with the <a href="/methods/methods/webhooks/subscription-update.md"><strong>Update an existing subscription</strong></a> method by setting <code>isActive: false</code>. <br><strong>Please note:</strong> events that occur while the subscription is disabled are not delivered after it is enabled again.</p></td></tr><tr><td><a href="/methods/methods/webhooks/adding-numbers-to-a-subscription.md"><strong>Add numbers to an existing subscription</strong></a></td><td><p>This endpoint allows adding shipment numbers to a subscription of type <code>numbers</code>.</p><p>Only numbers that already exist in the Nova Post system are added. A number that does not yet exist in the system is not added to the subscription — it has to be added again after the shipment has been created.</p><p>A <code>200</code> code means <strong>that at least one</strong> number was added, not necessarily all of the numbers passed. Always check the contents of <code>missedNumbers</code>.</p></td></tr><tr><td><a href="/methods/methods/webhooks/deleting-numbers-from-a-subscription.md"><strong>Delete numbers from an existing subscription</strong></a></td><td><p>This endpoint allows deleting shipment numbers from a subscription of type <code>numbers</code>.</p><p><strong>This endpoint returns a</strong> <code>200</code> <strong>code in any case, including when</strong> <strong>no numbers were deleted</strong>. The result of the operation is determined by the <code>status</code> parameter in the response body, not by the HTTP code.</p></td></tr><tr><td><a href="/methods/methods/webhooks/test-webhook.md"><strong>Checking the test webhook</strong></a></td><td>This endpoint allows you to test the webhook functionality. At least one active subscription is required for a successful response.</td></tr></tbody></table>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/webhooks.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
