> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/changelog-1/documentation-eng/customs-fees-settings-response-update.md).

# Customs Fees Settings Response Update

The response structure of the [method that returns recipient country settings](https://api-portal.novapost.com/metodi-1/methods/dictionaries#get-dictionary-customs-fees-code) used to determine whether customs duties can be paid by the sender has been updated.

**Before**

```json
{
  "customFeeActive": true,
  "declaredCost": 100
}
```

**After**

```json
{
  "customsFeesActive": true,
  "maxDeclaredCost": 500,
  "minDeclaredCost": 10
}
```

**What has changed**

Previously, the method returned only a single declared parcel value threshold.

The method now returns separately:

* the minimum declared value threshold (`minDeclaredCost`);
* the maximum declared value threshold (`maxDeclaredCost`).

This allows a more precise determination of the declared parcel value range within which the option for customs-duty payment by the sender is available. If the declared parcel value is lower than `minDeclaredCost`, customs duties are not applied to the parcel.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/changelog-1/documentation-eng/customs-fees-settings-response-update.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
