> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/novaposhta-docs/integration-guide/api-key-generation.md).

# API Key Generation

> API keys are issued exclusively to individuals (natural persons).
>
> To use the API for business purposes, you must designate an authorized company representative and generate API keys in their name, or assign as the authorized representative a person who already has an existing API key.
>
> The authorized representative’s details must be specified in the contract with Nova Post.

### How to create a key for a European client

1. **Create an account** [in the My Nova Post cabinet](https://my.novapost.com/)

Register at my.novapost.com. [Step-by-step registration instructions](https://novapost.com/en-pl/my-nova-post-instructions#registration)[ ](https://api-portal-stage.novapost.com/en/my-nova-post-instructions#registration)

2. **Affiliate an individual to the organization**

   1. Write an email to the NovaPost sales manager.
   2. In the letter, provide the tax code and the name of the organization, details of the individual: full name, phone number, email.

   The details of the individual must match those for which the account in the My Nova Post cabinet was or will be registered.

{% hint style="warning" %}
When registering, use the phone number and email address of the authorized representative specified in the contract.\
If an account has already been created, re-registration is not required.
{% endhint %}

3. Create an API key in your My Nova Post account. Go to the “Integrations → API Keys” section at my.novapost.com and create a key for the production environment.

When creating a key, the system will automatically display all organizations assigned to your account. You can:

* select one or more organizations to which access is granted through this key;
* or create separate keys for each organization if you need to divide access between teams or projects.

<figure><img src="https://872020812-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Ff1DWWiZ1zhxgn1IO9vhO%2Fuploads%2FXTXhDuymijUGO9siLfDj%2Fimage.png?alt=media&amp;token=467600e9-a9fb-40a8-a8a9-0e7e388deb1a" alt=""><figcaption></figcaption></figure>

#### The key immediately appears in the list of information about:

* creation date
* name
* status (active/deactivated)
* organization
* validity period

#### How to Create a Test API Key - method 1

On the test key generation page in the Nova Post portal:

* Enter the phone number registered in your My Nova Post account (**my.novapost.com**) and submit a request to generate the key.
* After a successful request, a test API key for the sandbox (Stage environment) will be generated.\
  The key will be linked to an individual (natural person) and will not be associated with any organization. [Generate a test key](https://api-portal-stage.novapost.com/en/test-api-keys)

Method 2

## Create or renew a test API key (Sandbox only)

> Public endpoint available only in non-production environments (Sandbox) \
> to create or renew a test API key for a client identified by phone.\
> \
> Requirements:\
> \- The phone number must be registered in the Client Portal (EBC): <https://my.novapost.com/\\>
> \- UA key generation is currently not supported\
> \
> Behavior:\
> \- If a key already exists and is Active, a repeated call within the same day \
> &#x20; will return the same key\
> \- If expired, the key will be reactivated with a new expiration date\
> \- If deleted by cleanup, a new key will be created\
> \- Only one active key is allowed per phone, limited to one request per day\
> \
> Next step:\
> After receiving the apiKey, you must generate a temporary JWT by calling \
> \[GET /clients/authorization]\(<https://api-portal.novapost.com/novaposhta-docs/integration-guide/how-to-generate-a-jwt-token>). The JWT is required for all authorized requests. \
> Paste the jwt into the \*\*\[Authorize]\(<https://api.novapost.com/developers/index.html#auth)\\*\\>\* dialog under the \`JWT\` scheme \
> in this documentation to enable Try-it-out.\</br>\
> \
> 🔹\*\*Description of control elements:\*\*\
> \
> \*\*SCHEMA\*\*\</br>\
> Displays the full technical structure of the request or response, including field names, data types, required fields, allowed values, and validation rules.\
> \- \*\*Single line description\*\*\</br>\
> &#x20; A description that fits into a single line; any text that does not fit remains hidden.\
> \- \*\*Multiline description\*\*\</br>\
> &#x20; An expanded description that displays more than one line of text.\
> \
> \*\*EXAMPLE\*\*\</br>\
> Shows a ready-made sample JSON with correctly formatted values to demonstrate how a valid request or response should look.<br>

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"Authorization"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.pl/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"security":[],"paths":{"/test-api-keys":{"post":{"tags":["Authorization"],"summary":"Create or renew a test API key (Sandbox only)","description":"Public endpoint available only in non-production environments (Sandbox) \nto create or renew a test API key for a client identified by phone.\n\nRequirements:\n- The phone number must be registered in the Client Portal (EBC): https://my.novapost.com/\n- UA key generation is currently not supported\n\nBehavior:\n- If a key already exists and is Active, a repeated call within the same day \n  will return the same key\n- If expired, the key will be reactivated with a new expiration date\n- If deleted by cleanup, a new key will be created\n- Only one active key is allowed per phone, limited to one request per day\n\nNext step:\nAfter receiving the apiKey, you must generate a temporary JWT by calling \n[GET /clients/authorization](https://api-portal.novapost.com/novaposhta-docs/integration-guide/how-to-generate-a-jwt-token). The JWT is required for all authorized requests. \nPaste the jwt into the **[Authorize](https://api.novapost.com/developers/index.html#auth)** dialog under the `JWT` scheme \nin this documentation to enable Try-it-out.</br>\n\n🔹**Description of control elements:**\n\n**SCHEMA**</br>\nDisplays the full technical structure of the request or response, including field names, data types, required fields, allowed values, and validation rules.\n- **Single line description**</br>\n  A description that fits into a single line; any text that does not fit remains hidden.\n- **Multiline description**</br>\n  An expanded description that displays more than one line of text.\n\n**EXAMPLE**</br>\nShows a ready-made sample JSON with correctly formatted values to demonstrate how a valid request or response should look.\n","requestBody":{"required":true,"content":{"application/json":{"schema":{"type":"object","additionalProperties":false,"required":["phone"],"properties":{"phone":{"type":"string","description":"Phone number registered in EBC. Format like 49XXXXXXXXX (no '+'). UA keys generation is currently not supported."}}}}}},"responses":{"200":{"description":"Test API key created or returned","content":{"application/json":{"schema":{"$ref":"#/components/schemas/TestApiKeyResponse"}}}},"400":{"description":"Validation error","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ErrorResponse"}}}},"404":{"description":"Client not found in EBC","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ErrorResponse"}}}},"409":{"description":"Multiple matching clients found in EBC","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ErrorResponse"}}}},"429":{"description":"Daily limit exceeded for this user (one request per day)","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ErrorResponse"}}}},"503":{"$ref":"#/components/responses/Time-out"}}}}},"components":{"schemas":{"TestApiKeyResponse":{"type":"object","additionalProperties":false,"required":["apiKey","createdAt","expDate","status"],"properties":{"apiKey":{"type":"string","description":"Test API key for Stage usage only."},"createdAt":{"type":"string","format":"date-time"},"expDate":{"type":"string","format":"date-time"},"status":{"type":"string","enum":["Active","Expired"]}}},"ErrorResponse":{"type":"object","additionalProperties":false,"required":["success","errors"],"properties":{"success":{"type":"boolean"},"errors":{"type":"array","items":{"type":"string"}}}},"Error":{"type":"object","properties":{"errors":{"type":"object","properties":{"":{"type":"string"}}}}}},"responses":{"Time-out":{"description":"Connection time-out","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Error"}}}}}}}
```

#### How to create a key for a client from Ukraine

Generate keys in the Business account in Ukraine under the "Settings - Security" section. [Direct link to the section](https://new.novaposhta.ua/dashboard/settings/developers).&#x20;

1. Log in to the business cabinet at new\.novaposhta.ua as a legal entity.

<figure><img src="https://872020812-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Ff1DWWiZ1zhxgn1IO9vhO%2Fuploads%2FeY1OaEoLM9sUAM39pmeY%2Fimage.png?alt=media&amp;token=75e0cb19-ead0-4330-b038-d2007517e5d7" alt=""><figcaption></figcaption></figure>

2. Go to the "Settings" section.

<figure><img src="https://872020812-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Ff1DWWiZ1zhxgn1IO9vhO%2Fuploads%2Fh92eNs9UTNV0sXlSHXjI%2Fimage.png?alt=media&amp;token=9079fbf3-96f7-4656-b0a5-aede22ebeead" alt=""><figcaption></figcaption></figure>

3. Select the "Security" section.

<figure><img src="https://872020812-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Ff1DWWiZ1zhxgn1IO9vhO%2Fuploads%2F9w72JIFB8d6M3f0GknhJ%2Fimage.png?alt=media&amp;token=c4c86fe2-ef26-42f6-81b4-03dec823379f" alt=""><figcaption></figcaption></figure>

4. Click "Create key"

<figure><img src="https://872020812-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Ff1DWWiZ1zhxgn1IO9vhO%2Fuploads%2F5heVuVkB3tsROfuydbXY%2Fimage.png?alt=media&amp;token=7a171b0b-4c81-43d4-997e-1894fc32d6ca" alt=""><figcaption></figcaption></figure>

5\. **The key has been created.** Copy the code for using the Nova Post API.

<figure><img src="https://872020812-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Ff1DWWiZ1zhxgn1IO9vhO%2Fuploads%2F6hcyRhgcdRFuIfXBzERN%2Fimage.png?alt=media&amp;token=ad223e56-ad35-4b4a-bcf8-b9c67b12d531" alt=""><figcaption></figcaption></figure>

#### Additional Recommendations

**Security:** Store your API keys securely and do not share them with third parties.

**Testing:** Use the sandbox environment to validate your integration before moving to production.

**Access Control:** Regularly review the list of users who have access to your account and API keys.Additional Recommendations


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/novaposhta-docs/integration-guide/api-key-generation.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
