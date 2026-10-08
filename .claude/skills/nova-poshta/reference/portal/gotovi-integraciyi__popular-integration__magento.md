> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/gotovi-integraciyi/popular-integration/magento.md).

# Magento

[**\[Before Integration\]**](https://commercemarketplace.adobe.com/novapost-nova-post-shipping.html)

The **Nova Post Shipping module for Magento 2 / Adobe Commerce** is an official professional solution for automating international and local delivery to over 16 European countries and Ukraine.

The module integrates an interactive map widget into Magento checkout, allows automatic or manual generation of express waybills (EWs), calculates real-time or flat-rate shipping fees, and prints a complete set of accompanying and customs documents directly from the Order Grid or Order View.

#### [Key Module Features and Available Delivery Destinations](https://docs.google.com/document/d/1av3aDiN5LRVbQOnuxLE4G1b2MW2fBXYFSoHZvFX2Fhw/edit?tab=t.f2peaq2ttwwe)

### Requirements for Correct Module Operation

* **Service agreement with Nova Post**. A business client agreement with Nova Post is required for the plugin to work correctly. To sign an agreement, contact the sales department email in your country.
* **API key**. Register in the My Nova Post business account and generate a key: [detailed instructions](https://api-portal.novapost.com/uk/api-nova-post/start/api-keys). If testing is required, generate a test API key using this link.

{% hint style="info" %}
During module setup, you will need to specify:

* Logistics service agreement number
* API key

Agreement numbers are not displayed in the business account. If you need to find out your agreement number, contact [the sales department email in your country](https://api-portal.novapost.com/help-center).&#x20;
{% endhint %}

### Installing the Nova Post Module in Magento

[Download from Adobe Commerce Marketplace](https://commercemarketplace.adobe.com/novapost-nova-post-shipping.html)

{% hint style="warning" %}
**Important!** Use only the official Nova Post module from Adobe Commerce Marketplace or install it via Composer to guarantee stable performance, data security, and timely updates.
{% endhint %}

The module can be installed in two official ways:

1. **Download from Adobe Commerce Marketplace**: Go[ to the Nova Post module page](https://commercemarketplace.adobe.com/novapost-nova-post-shipping.html), add it to your account, and install it via the Web Setup Wizard or Component Manager.
2. **Installation via Composer (recommended)**: Run the following command lines in your server terminal in the Magento root directory:

```
composer require novapost/module-shipping
php bin/magento module:enable NovaPost_Shipping
php bin/magento setup:upgrade
php bin/magento setup:di:compile
php bin/magento setup:static-content:deploy -f
php bin/magento cache:clean
```

### Module Configuration

#### Configuration in Nova Post Base Section

Go to: **Stores** → **Configuration** → **Nova Post** → **Nova Post Base**

**Departure Countries**: Select the countries from which you will ship orders (countries where your business/warehouses are registered). The selected countries will then appear in the list of available sender countries in the basic settings: **Nova Post Settings** → **Shipment Departure Method** → **Country**.

![](https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FTR9lqjwYQDgjMuyUYicz%2Funknown.png?alt=media\&token=0ea7a250-b7fd-459d-bfea-fb2e922dbdfa)

#### Configuration in Nova Post Settings Section

Go to: **Stores** → **Configuration** → **Nova Post** → **Nova Post Settings**

**API Configuration Section**

* Production environment settings. Paste [the production API key generated in your business account](https://api-portal.novapost.com/uk/api-nova-post/start/api-keys).
* Test environment settings. Set Testing API to Yes if you are testing. [Paste the test API key](https://api-portal-stage.novapost.com/en/test-api-keys/) into the Stage API Key field. This allows you to test shipment creation without generating real waybills or charging service fees.

<details>

<summary><strong>Example of filling in the API Configuration section</strong></summary>

![](https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2Fk5p7jkfUx0Dx0JVFz4tQ%2Funknown.png?alt=media\&token=b3928264-0cec-49cb-9ef3-3333fd040b92)

</details>

**Contract Numbers Section**

* **Domestic Contract Number**: Specify the agreement number for domestic delivery.
* **International Contract Number**: Specify the agreement number for international delivery to other countries.

<details>

<summary><strong>Example of filling in the Contract Numbers section</strong></summary>

![](https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FtuHHG5XahnkpGkwyx4KP%2Funknown.png?alt=media\&token=e8736aec-d9f4-4984-b6e5-0da3aeff9074)

</details>

**Sender Data Section**

Fill in the fields:

* **First Name / Last Name**: Sender's first name and last name.
* **Email / Phone**: Contact email and phone number.
* **Company TIN**: Company tax ID (EDRPOU / TIN / NIP / VAT ID).
* **Company Name**: Official company name.

{% hint style="warning" %}
**Important!** Company details must match the information specified in your agreement with Nova Post.
{% endhint %}

* **EORI Code**: EORI code (Economic Operators Registration and Identification). Mandatory for international shipments undergoing customs clearance (between EU and non-EU countries).
* **IOSS**: Import One-Stop Shop number. Used for simplified VAT payment when selling goods valued up to €150 to EU buyers from outside the EU.

<details>

<summary><strong>Example of filling in the Sender Data section</strong></summary>

![](https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FbR2fp0KVNKPL75pfPmFq%2Funknown.png?alt=media\&token=b6c26d95-a9b8-4c82-90e4-dd82b34a6cd5)

</details>

**Shipment Departure Method Section**

Set up the method for handing over parcels to the carrier:

* **Division**: You will personally drop off parcels at the selected Nova Post branch, drop-off point, or parcel locker.
* **Address**: Calling a Nova Post courier to your warehouse or office.

{% hint style="info" %}
**Rule for filling in the "City" field**: Enter only the city or settlement name (e.g., `Riga`, `Warsaw`), without specifying region, district, or commas. Note that `Riga` and `Rīga` are treated by the system as two different entries.
{% endhint %}

<details>

<summary><strong>Example of filling in the Departure Method section</strong></summary>

![](https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FK1l4Msvq0tqDBSZU5fVV%2Funknown.png?alt=media\&token=2f4953f6-4aed-4a9a-99ad-7811bd73ce6d)

</details>

**Product Information Section**

Default data is used to calculate shipping fees if individual parameters are not filled in on the product page:

* **Default Product Weight (kg)**: Default product weight.
* **Length / Width / Height (cm)**: Default product dimensions.
* **Default HS Code**: Default universal code for classifying goods at customs.

<details>

<summary><strong>Example of filling in the Product Information section</strong></summary>

![](https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FOfHUs7EB4ZWE5rOjA8vI%2Funknown.png?alt=media\&token=e2ae8154-7f09-4197-96f2-44c78fa6967f)

</details>

**Shipment Automation Section**

Automatic Shipment Creation determines how shipments are created:

* Yes = automatically after the buyer places an order. The buyer will immediately receive an email with the parcel tracking number.
* No = shipments are created manually by a manager via the admin panel

**Carrier Shipping Calculation Section**

Configure shipping fee calculations for each delivery type: Nova Post to Division (to a branch/parcel locker) and Nova Post to Address (by courier to an address).

For each type, specify Calculation Mode:

* **Carrier Calculation**: Real-time calculation via Nova Post API based on weight, dimensions, declared or invoice value, and delivery destination.
* **Flat Rate**: Fixed shipping fee set by the seller.
* **Free Delivery (Optional)**: Enable the option and set the order threshold: **Free Delivery Threshold**. Once this cart amount is reached, shipping becomes free for the customer.

<details>

<summary><strong>Example of filling in the Carrier Shipping Calculation section</strong></summary>

![](https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2Fuc5VTL7Omk9R2aaLzEdY%2Funknown.png?alt=media\&token=94f52c36-0648-44f3-bc73-382f6cb86797)

</details>

#### Configuring Delivery Methods

Go to: **Stores** → **Configuration** → **Sales** → **Delivery Methods** → **Nova Post**

In this section, you activate delivery services visible to the buyer on the **Checkout** page by setting **Enabled for Checkout** to **Yes**.

**Carrier Title, Method Title for Division, Method Title for Address**: fields that define the carrier name and delivery method name. Filled in automatically.

**Show Method If Not Applicable**: specify whether to show the delivery method to the buyer if it is unavailable for their region.

**Sort Order**:

**Nova Post to Division and Nova Post to Address Sections**

**Applicable countries** determines which countries delivery is available to. Configure availability for each delivery method separately.

* **All Allowed Countries** – all allowed countries.
* **Sell to specific countries** – select countries where Nova Post delivery will be available. Specify only countries where Nova Post operates.

**List of countries where Nova Post delivery is available**: Ukraine, Moldova, Poland, Lithuania, Czechia, Romania, Germany, Slovakia, Estonia, Latvia, Hungary, Italy, Great Britain, Spain, France, Austria, Netherlands, USA.

<details>

<summary><strong>Example of filling in the Delivery Methods section</strong></summary>

![](https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FfqGjXTZcUocjoBFWlDvb%2Funknown.png?alt=media\&token=b1165658-0254-4f68-8a07-9789ce8ad415)

</details>

#### Currency Setup

Go to: **Stores** → **Configuration** → **General** → **Currency Setup**

**Base Currency**: specify the settlement currency. Nova Post performs internal settlements in the **store's Base Currency**, which must match the currency of your agreement with Nova Post. For example, if shipping from Poland, enter PLN in Base Currency; if from Romania — RON.

**Default Display Currency**: currency displayed to the customer.

**Allowed Currencies**:

If you also use a display currency different from the base currency, Magento will convert the shipping fee according to your store's exchange rates (Stores → Currency Rates). This is standard Magento behavior for all delivery methods.

{% hint style="info" %}
Recommendation: keep the Base Currency and Display Currency identical, or update exchange rates in time under Stores → Currency Rates.
{% endhint %}

<details>

<summary><strong>Example of filling in the Currency Options section</strong></summary>

![](https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2F4eaPK5SMgsIz7Tsbr7u6%2Funknown.png?alt=media\&token=2dd19b14-397c-4bb1-8636-30c04eb13d65)

</details>

#### Product Settings

The module adds a dedicated **Nova Post Product Settings** block to each product page: **Catalog** → **Products** → **edit product**.

Since Magento natively supports only weight, the module adds missing fields required for accurate fee calculation and customs clearance:

* **Length (cm) / Width (cm) / Height (cm)**: Individual product dimensions. If left blank, default values from module settings will be used.
* **Product Title in English**: Product title in English (mandatory for international declarations and invoices). If left blank, the system uses the default product title from Magento.
* **HS Code**: Commodity classification code.

{% hint style="warning" %}
**HS Code Requirements**:

* The code must consist of **8–10 digits**.
* If the code is shorter than 8 digits, add trailing zeros (e.g., `6109100000`).
* If the code is longer than 10 digits, remove extra trailing digits.
* For shipments to **Moldova**, **USA**, **and** **Canada**, HS Code must contain **exactly 10 digits**.
  {% endhint %}

Please note: Nova Post delivery is available for physical items (`Simple Products`) only. If the cart contains virtual products only, the delivery selection step in Magento is skipped. To configure `Configurable Products`, make sure all child `Simple Products` have weight and dimensions specified.

<details>

<summary><strong>Example of filling in the Nova Post Product Settings section</strong></summary>

![](https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FUodN6i1LEKmgGYbx8TvU%2Funknown.png?alt=media\&token=d14fc5b7-0d91-4595-85ae-672c4be4d56c)

</details>

### Order Management and Waybill Creation

#### How to Create an Express Waybill

Available in two modes: **Order View** or **Order Grid**.

<table data-header-hidden><thead><tr><th valign="top"></th><th valign="top"></th></tr></thead><tbody><tr><td valign="top"><strong>Order View</strong> – creating a shipment from the order details page</td><td valign="top"><strong>Order Grid</strong> – creating a shipment from the order list</td></tr><tr><td valign="top"><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FylgGp3ZFD5oYDruDDUO4%2Funknown.png?alt=media&amp;token=e25f732c-ad80-4a25-989a-9618f7b13bf3" alt="" data-size="original"></td><td valign="top"><p></p><p><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FkFC5KAVLklrV1dBnZ4a5%2Funknown.png?alt=media&amp;token=3f736f81-3814-4037-90f8-3246df4afa85" alt="" data-size="original"></p></td></tr><tr><td valign="top"><ol><li>Go to <strong>Sales</strong> → <strong>Orders</strong> and open the desired order.</li><li>In the <strong>Nova Post</strong> block, click the <strong>Create Shipment</strong> button.</li><li><p>In the <strong>Create Shipment</strong> - <strong>Preview</strong> modal window, review the details:</p><ul><li><strong>Sender</strong>: Sender details (from module settings).</li><li><strong>Recipient</strong>: Recipient contacts and address/branch.</li><li><strong>Parcels &#x26; Items</strong>: Dimensions, weight, parcel contents, HS codes, and item values.</li><li><strong>Note</strong>: Additional shipment note (optional).</li></ul></li><li>Click <strong>Create Shipment</strong> in the corner of the modal window.</li></ol></td><td valign="top"><ol><li>Go to <strong>Sales</strong> → <strong>Orders</strong>.</li><li>In the <strong>Nova Post Shipment</strong> column, click <strong>Create Shipment</strong> in the corresponding order row.</li><li>Verify details in the preview window and confirm creation.</li></ol><p></p></td></tr></tbody></table>

After successful waybill generation, its number will appear in the **Nova Post Shipment** column as an active hyperlink for quick tracking.

#### How to Generate Accompanying Documents

Depending on the shipping route, the module automatically generates the required document package:

* **Domestic or intra-EU shipping**: standard barcode shipping label in 100x100 mm format.
* **Shipping on** non-EU → EU and EU → non-EU routes:
  * **Label**: Standard shipping label 100x100 mm.
  * **International Label**: International consignment note with extended details.
  * **Invoice**: Commercial invoice for customs.

#### How to Print Accompanying Documents

<table data-header-hidden><thead><tr><th valign="top"></th><th valign="top"></th></tr></thead><tbody><tr><td valign="top"><strong>Order View</strong></td><td valign="top"><strong>Order Grid</strong></td></tr><tr><td valign="top"><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2Fl3YJeLMhPP90WV7yQ4t3%2Funknown.png?alt=media&amp;token=b5cfa094-6314-4d7c-a221-a324ce9bd4db" alt="" data-size="original"></td><td valign="top"><p><img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FhGmX0SCU2TNR3U5Y8xAW%2Funknown.png?alt=media&amp;token=24cc6c79-183c-4bd9-be87-6f05557859ae" alt="" data-size="original"></p><p><br></p></td></tr><tr><td valign="top"><p>Click the icon of the required document directly in the Nova Post Shipment column.</p><p><br></p></td><td valign="top">In the Nova Post block or via the Actions menu in the top bar, click the icon of the corresponding document. A PDF preview with download or print buttons will open in a modal window.</td></tr></tbody></table>

#### How to Find the Shipment Number and Track the Parcel

| **Order View**                                                                                                                                                                                                                                              | **Order Grid**                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2Fb8wIOgUqqlk6pYLNBQXO%2Funknown.png?alt=media&amp;token=c6e3c86a-71ce-4b86-a9ba-639e1c6afe6b" alt="" data-size="original"> | <img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FRgAoWLA5pFFhxo9M9uli%2Funknown.png?alt=media&amp;token=a8914c6f-765a-4a66-af81-54503817843b" alt="" data-size="original"> |

The shipment number is an active link. Click it to navigate to the Nova Post tracking page with full route details. The language of the tracking page is determined automatically based on current store view language settings.

#### How to Modify Details in an Express Waybill

If you need to change weight, address, or item list in an order after an EW has been created, delete the current EW and generate a new one with updated details:

1. In the Nova Post Shipment column in the order list or in the Nova Post block within the order, click the Trash Can icon.
2. Confirm action in the prompt window ("Are you sure you want to delete shipment...").
3. After deleting the previous tracking number, the system will show the Create Shipment button again, allowing you to generate a new waybill with updated parameters.

#### How to Grant Access to a Manager

The module is integrated with Magento role-based access control. In **System** → **Permissions** → **User Roles**, you can flexibly grant permissions to different managers:

* **Create Shipment** — permission to create waybills.
* **Delete Shipment** — permission to delete/cancel EWs.
* **Print Documents** — permission to download and print accompanying documents.

### API Logs

All API requests and responses during interaction with Nova Post are written to a dedicated log file, separate from general Magento logs. Logs include:

* **Successful operations** — order ID, response status, express waybill number
* **Failed operations** — order ID, error details
* Network failures and timeouts.

The module records Nova Post logs in separate files:

1. `var/log/novapost/debug.log`
2. `var/log/novapost/error.log`

Authorization tokens and confidential data are automatically purged from all log entries.

### Customer Checkout Journey

When placing an order with Nova Post delivery, the customer needs to:

1. **Enter contact details**: Email, first name, last name, phone number, country, city, street, building, and postal code.
2. **Select Nova Post delivery method**:
   * **Delivery to a branch / parcel locker**: The customer clicks the interactive map widget, selects a convenient location on the map or via address search, chooses type (branch or parcel locker), and confirms selection.
   * **Courier delivery**: Delivery is made to the address specified in contact details.
3. **Specify payment method**: Online payment or cash on delivery (COD).
4. **Confirm order**.

<details>

<summary><strong>Example of customer order placement</strong></summary>

<p align="center"><strong>Step 1</strong></p>

<img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FYRvSTLP7t6ZX4KVDNpA0%2Funknown.png?alt=media&amp;token=9d263fde-ba4d-4220-a88a-07cf88317f44" alt="" height="651" width="645">

<p align="center"><strong>Step 2</strong></p>

<img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FxgEPVehH9d2hCeEtqkt9%2Funknown.png?alt=media&amp;token=f589c679-ab86-440b-9758-27dfca0f462e" alt="" height="650" width="603">

<p align="center"><strong>Step 3</strong></p>

<img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FXtDjrpvrzFpOZUOxdq7I%2Funknown.png?alt=media&amp;token=febf4cd7-aa68-423c-8773-f0a3da321489" alt="" height="669" width="618">

<p align="center"><strong>Step 4</strong></p>

<img src="https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2F8unmt7GGjFpKI93vEbJU%2Funknown.png?alt=media&amp;token=cc642808-fb00-46f4-b47a-8b7606aaddf7" alt="" height="324" width="704">

</details>

After waybill generation, a branded email is automatically sent to the buyer with order details, EW number, and a direct link to the parcel tracking page.

<details>

<summary><strong>Example of confirmation email</strong></summary>

![](https://1791510004-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F8PyH025eHU6hMJ8NWqQZ%2Fuploads%2FruNC3KWRZoox1piVmSi1%2Funknown.png?alt=media\&token=e21d191d-878c-4dca-9d0c-8d10a2362ff6)

</details>

<br>


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/gotovi-integraciyi/popular-integration/magento.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
