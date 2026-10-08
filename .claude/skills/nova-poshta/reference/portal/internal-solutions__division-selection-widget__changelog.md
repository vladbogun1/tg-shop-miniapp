> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/internal-solutions/division-selection-widget/changelog.md).

# Changelog

Release history — newest at the top.

#### v0.3.0&#xD; (2026-09-02)

**Added**

* Dark theme support, including theme updates while Google Maps is loading
* Selection cancellation from the division popup and confirmed branch row
* `onClear` SDK callback for cleared division selections
* Shipment role support
* Division category restrictions for widget tabs and filters

**Fixed**

* Popup overlay not receiving pointer events
* Incorrect rounding of meter distances

#### v0.2.1 (2026-08-07)

**Changed**

* translations for Czech locale

#### v0.2.0 (2026-07-06)

**Added**

* `senderCountry` configuration parameter
* UPS division selection for delivery from Poland and Ukraine
* Display of divisions nearest to the selected division

#### v0.1.1 (2026-06-17)

**Added**

* Configurable error and empty state messages in the divisions list

#### v0.1.0 (2026-06-04)

**Added**

* Map and Widget views as separate configurable entry points
* Popup view mode with customizable trigger button
* Division popup with category labels and weight limits
* WidgetTabs and WidgetViewSwitch for navigation between views
* Loading state during settlement and division search
* Error overlay with retry on failed API requests
* PUDO division category support
* `show()` with automatic map centering
* Ukrainian, Czech, and German localization
* Disable selection hint for UPS-source divisions
* Division detail view with schedule and address information
* Server proxy API with JWT authentication

**Fixed**

* Division popup closing not working correctly
* Duplicate divisions appearing in the confirmed list
* Proxy error reporting returning incorrect error format


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/internal-solutions/division-selection-widget/changelog.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
