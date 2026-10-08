> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/internal-solutions/division-selection-widget.md).

# Division selection widget

Add a branch/postomat picker to any web page in minutes — with Google Maps, filters, and TypeScript support.

<p align="center"><a href="https://integration-widget.novapost.com/" class="button primary">Open Playground</a><a href="https://api-portal.novapost.com/internal-solutions/nova-post-division-selection-widget#quick-start-umd-via-less-than-script-greater-than" class="button secondary">Quick Start</a><a href="https://api-portal.novapost.com/internal-solutions/nova-post-division-selection-widget#configuration-widgetconfig" class="button secondary">API Reference</a><a href="https://api-portal.novapost.com/internal-solutions/nova-post-division-selection-widget/changelog" class="button secondary">Changelog</a></p>

<table data-view="cards"><thead><tr><th></th></tr></thead><tbody><tr><td><h4>Two variants</h4><p>Map view (Google Maps) or Widget view (list with search and filters). Both support the same params and events.</p></td></tr><tr><td><h4>Lazy iframe init</h4><p>The <code>&#x3C;iframe></code> is created only on the first <code>show()</code> call — zero cost before that.</p></td></tr><tr><td><h4>No API key needed</h4><p>All Nova Post API calls go through the proxy server.</p></td></tr></tbody></table>

### Quick Start — UMD via \<script>

Works in any HTML page without a build step.

```
<!-- 1. Container — must have an explicit height -->
<div id="nova-post-widget" style="width:100%;height:600px"></div>

<!-- 2. Load the SDK -->
<script src="https://integration-widget.novapost.com/sdk.min.js"></script>

<script>
  const widget = new NovaPostWidget.NovaPostWidget({
    container: '#nova-post-widget',
    locale:    'en',
    variant:   'widget',   // 'map' | 'widget'
    viewMode:  'container', // 'container' | 'popup'
    country:   'UA',
    city:      'Київ',
    shipmentRole: 'recipient', // 'recipient' | 'sender'
    theme: 'light', // 'light' | 'dark'

    onReady: () => console.log('Widget ready'),

    onSelect: (division) => {
      console.log(division.name, division.displayAddress)
      widget.hide()
    },
    
    onClear: () => {
      console.log('Selection cleared')
    },

    onError: (err) => console.error(err.message),
  })

  widget.show()
</script>
```

### Configuration — WidgetConfig

<table data-search="false"><thead><tr><th width="182">PARAM</th><th width="150">TYPE</th><th width="118">REQUIRED</th><th width="123">DEFAULT</th><th>DESCRIPTION</th></tr></thead><tbody><tr><td><code>container</code></td><td><code>string</code> | <code>HTMLElement</code></td><td><code>Yes</code></td><td>—</td><td>CSS selector or DOM element to mount into</td></tr><tr><td><code>locale</code></td><td><code>'uk'</code> | <code>'en'</code> | <code>'de'</code> | <code>'cs'</code></td><td>—</td><td><code>'en'</code></td><td>UI language</td></tr><tr><td><code>variant</code></td><td><code>'map'</code> | <code>'widget'</code></td><td>—</td><td><code>'map'</code></td><td><p>Display mode:</p><ul><li><code>map</code> — map.</li><li><code>widget</code> — search, division list, and map.</li></ul></td></tr><tr><td><code>viewMode</code></td><td><code>'container'</code> | <code>'popup'</code></td><td>—</td><td><code>'container'</code></td><td>Inline embed or modal popup</td></tr><tr><td><code>shipmentRole</code></td><td><code>'recipient'</code> | <code>'sender'</code></td><td>—</td><td><code>'recipient'</code></td><td>Init-only. Whether divisions are picked for handing a parcel in (<code>sender</code>) or collecting it (<code>recipient</code>); fixed as an iframe URL param, ignored by <code>updateParams()</code></td></tr><tr><td><code>country</code></td><td><code>string</code> | <code>null</code></td><td>—</td><td>—</td><td>ISO country code, e.g. <code>'UA'</code></td></tr><tr><td><code>city</code></td><td><code>string</code> | <code>null</code></td><td>—</td><td>—</td><td>City name to pre-select</td></tr><tr><td><code>senderCountry</code></td><td><code>string</code> | <code>null</code></td><td>—</td><td>—</td><td>Sender ISO country code, e.g. <code>'UA'</code>; unlocks partner PUDO (UPS) selection for allowed countries [PL, UA]</td></tr><tr><td><code>divisionId</code></td><td><code>number</code> | <code>null</code></td><td>—</td><td>—</td><td>Pre-select a specific division</td></tr><tr><td><code>divisionCategories</code></td><td><code>DivisionType[]</code></td><td>—</td><td>—</td><td>Filter by type; all shown if omitted</td></tr><tr><td><code>autoShow</code></td><td><code>boolean</code></td><td>—</td><td><code>false</code></td><td>Call <strong>show()</strong> automatically after init; works only when <code>'viewMode'</code> = <code>'container'</code></td></tr><tr><td><code>mobileBreakpointPx</code></td><td><code>number</code></td><td>—</td><td><code>768</code></td><td>Fullscreen popup below this viewport width</td></tr><tr><td><code>theme</code></td><td><code>'light'</code> | <code>'dark'</code></td><td>—</td><td><code>'light'</code></td><td>UI theme</td></tr><tr><td><code>onSelect</code></td><td><code>(division: DivisionItem) => void</code></td><td>—</td><td>—</td><td>Fires when user confirms a division</td></tr><tr><td><code>onClear</code></td><td><code>() => void</code></td><td>—</td><td>—</td><td>Fires when the confirmed division is cleared</td></tr><tr><td><code>onReady</code></td><td><code>() => void</code></td><td>—</td><td>—</td><td>Fires when iframe is loaded and ready</td></tr><tr><td><code>onError</code></td><td><code>(error: Error) => void</code></td><td>—</td><td>—</td><td>Fires on runtime error inside iframe</td></tr><tr><td><code>onClose</code></td><td><code>(reason?) => void</code></td><td>—</td><td>—</td><td>Fires when popup is closed</td></tr></tbody></table>

### API Methods

**widget.show()** Show the widget. First call creates the iframe (lazy init).

In `container` mode — sets `display: block` on the iframe.\
In `popup` mode — opens the overlay.\
On every call (both modes), once the widget is ready, the map automatically recenters on the previously selected division.

**widget.hide()** Hide the widget without destroying the iframe.

In `container` mode — sets `display: none`.\
In `popup` mode — closes the overlay.\
Calling `hide()` directly does not fire `onClose`; that callback only fires when the widget itself requests closing (Escape key, overlay backdrop click, or after a selection), which then triggers `hide()` internally.

**widget.updateParams(params)** Update config without recreating the iframe.

Updates `city`, `country`, `senderCountry`, `divisionId`, `divisionCategories`, `theme`, `locale`.\
Calls before `onReady` are queued and flushed automatically.

**widget.destroy()** Remove iframe, popup elements, and all event listeners.

Call on route change in SPAs or on component unmount (Vue `onUnmounted`, React `useEffect` cleanup).

### Variants & View Modes

<table><thead><tr><th width="124">VARIANT</th><th width="144">VIEWMODE</th><th>RESULT</th></tr></thead><tbody><tr><td><code>map</code></td><td><code>container</code></td><td>Google Maps embedded inline in your page</td></tr><tr><td><code>map</code></td><td><code>popup</code></td><td>Trigger button → click opens popup with Google Maps</td></tr><tr><td><code>widget</code></td><td><code>container</code></td><td>Division search with list and map views embedded inline</td></tr><tr><td><code>widget</code></td><td><code>popup</code></td><td>Trigger button → click opens popup with division search, list, and map views</td></tr></tbody></table>

### Selection callbacks

Full object passed to your handler when user confirms a division:

* `onSelect` receives a division;
* `onClear` clears host state.

```
let selectedDivision = null

onSelect: (division) => {
  selectedDivision = division
  division.id               // number  — unique ID
  division.name             // string  — full name
  division.shortName        // string  — short name
  division.displayAddress   // string  — formatted address
  division.divisionCategory // 'PostBranch' | 'CargoBranch' | 'Postomat' | 'PUDO'
  division.source           // 'NPAX' | 'NPUA' | 'InPost' | 'UPS' | ...
  division.latitude         // number | null
  division.longitude        // number | null
  division.maxWeightPlaceRecipient  // number (kg)
  division.maxLengthPlaceRecipient  // number (cm)
  division.addressParts?.region
  division.addressParts?.city
  division.addressParts?.street
  division.addressParts?.postCode
},

onClear: () => {
  selectedDivision = null // also clear the corresponding host form fields
}
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/internal-solutions/division-selection-widget.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
