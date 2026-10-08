> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/novaposhta-docs/integration-guide/using-tokens.md).

# Using Tokens

The JWT token is a key component of secure interaction with the Nova Post API.

### Purpose of the Token

* **Request Authorization**\
  Every API request must include a valid token in the header to confirm access rights.
* **Client Verification**\
  The token verifies that the request originates from an authorized party.
* **Data Protection**\
  The token helps prevent unauthorized access to sensitive information.

#### Token Characteristics

Format:

* The token is implemented in the JWT (JSON Web Token) format and consists of three parts: header, payload, signature.
* A JWT has a standard structure that looks like the following: `eyJhbGciOiJIU5cCI6IkpXVCJ9.eyJpc3MiOiJDkyfQ.SflKxwRJSMeKKF`

Security:

* The token must be kept secure and must not be shared with third parties, as it grants access to the API.
* HTTPS is used to ensure secure transmission of tokens.

#### Request Entry Points

Tokens are required for the following Nova Post API endpoints:

* [https://api.novaposhta.ua/v.1.0/  ](<https://api.novaposhta.ua/v.1.0/&#xD;&#xA;https://api.novapost.com/v.1.0/>)
* [https://api.novapost.com/v.1.0/](<https://api.novaposhta.ua/v.1.0/&#xD;&#xA;https://api.novapost.com/v.1.0/>)

<p align="right"><a href="/novaposhta-docs/integration-guide/how-to-choose-the-appropriate-endpoint.md">More information about Nova Post API endpoints</a></p>

#### Token Limitations

* Each token is valid only for the specific API key used to generate it.
* The token is valid for one hour. After expiration, a new token must be obtained to continue interacting with the API.
* The maximum number of active sessions (tokens) per account may be limited by the system for security purposes.

> ### Usage Recommendations
>
> **Refresh tokens regularly.**\
> Monitor the token expiration time and always obtain a new token before sending requests if the previous one has expired.
>
> **Protect your API key and token.**\
> Do not share your API key or token. Always use HTTPS for all requests to prevent data interception.
>
> **Monitor token usage.**\
> Track token usage to prevent system overload and mitigate potential security threats.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/novaposhta-docs/integration-guide/using-tokens.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
