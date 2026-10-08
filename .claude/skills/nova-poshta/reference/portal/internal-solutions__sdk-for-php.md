> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/internal-solutions/sdk-for-php.md).

# SDK for PHP

The Novapost API SDK is the official PHP SDK (Software Development Kit) for integration with the Nova Post API. With this package, you can quickly and conveniently connect such Nova Post features to your PHP application as shipment creation, parcel tracking, and other services.

**Features/Advantages:**

* **Official Nova Post support** — guaranteed relevance, stability, and developer assistance.
* **Compliance with modern PHP standards** — compatibility with modern frameworks and libraries.
* **Flexibility and extensibility** — replace logger, HTTP client, token storage.
* **Easy integration** — installation via Composer, example usage included.

**Useful Links:**

* [Packagist — Official Package](https://packagist.org/packages/novadigital/novapost-api-sdk)
* [GitHub Repository](https://github.com/NovaDigitalHub/novapost-api-sdk)
* [Issue Tracker (Support & Feedback)](https://github.com/NovaDigitalHub/novapost-api-sdk/issues)

### Requirements

* **Requires** — Runtime dependencies (required for production use):
  * `php >= 8.0` — the package requires PHP 8.0+.
  * `guzzlehttp/guzzle ^7.0` — HTTP client for making requests.
  * `psr/container ^2.0` — compatibility with PSR dependency containers.
  * `psr/log ^3.0` — PSR-compliant logging interfaces.
* **Requires (Dev)** — Dev dependencies (needed only for development/CI):
  * `phpstan/phpstan ^2.1` — static analysis.
  * `phpunit/phpunit ^9.6` — unit tests.
  * `squizlabs/php_codesniffer ^3.13` — code style/linting.
  * `vlucas/phpdotenv ^5.6` — loading environment variables from `.env`.
* **Suggests:** None
* **Provides:** None
* **Conflicts:** None
* **Replaces:** None

### Installation

To get started, install the SDK via [Composer](https://getcomposer.org/) by running the following command:

```
composer require novadigital/novapost-api-sdk
```

### Working with the SDK

#### Client Initialization

After installing the SDK, initialize the client using `NovaPostApiFactory`.\
This allows you to quickly create a client for interacting with the Nova Post API.\
Add the following example to your code:

```
 use NovaDigital\NovaPost\NovaPostApiFactory; use NovaDigital\NovaPost\Exception\ApiException; use NovaDigital\NovaPost\Resources\Division;
$apiKey = 'YOUR_API_KEY';
try {
  $novaPostApi = (new NovaPostApiFactory())($apiKey);
  $searchParams = [
    'textSearch' => 'berlin',
    'divisionCategories' => [Division::DIVISION_CATEGORY_POSTOMAT]
  ];
  $divisions = $novaPostApi->divisions()->get($searchParams);
} catch (ApiException $e) {
    echo "API Error: " . $e->getMessage();
} 
```

#### SDK Method Example

SDK methods have the same names and parameters as the corresponding client API methods.\
To calculate shipment cost, use this example:

```
 try {
  $shipmentData = [
    // shipment calculation data
]; $calculationResult = $novaPostApi->shipments()->calculate($shipmentData); } catch (ApiException $e) {
  echo "API Error: " . $e->getMessage();
} 
```

### Advanced Features

The SDK allows you to replace standard services (logger, HTTP client, token storage, etc.) with your own implementations using the `ContainerBuilder` dependency container.

This is useful if you need to:

* Integrate the SDK with your framework’s logging system.
* Configure an HTTP client with custom parameters or middleware.
* Use your own storage mechanism for JWT tokens.

To do this, pass your custom services to the client factory through `ContainerBuilder`.

#### Using ContainerBuilder

For more flexible configuration, you can use `NovaDigital\NovaPost\DI\ContainerBuilder` to customize different aspects of the client.

```
 use NovaDigital\NovaPost\DI\ContainerBuilder; use NovaDigital\NovaPost\Exception\ApiException; use NovaDigital\NovaPost\NovaPostApiFactory; use NovaDigital\NovaPost\Storage\JwtTokenStorageInterface; use Psr\Log\LoggerInterface; use My\Awesome\MyLogger; use My\Awesome\DbJwtTokenStorageProvider;
$apiKey = 'YOUR_API_KEY';
try {
  $containerBuilder = (new ContainerBuilder())
    ->bind(LoggerInterface::class, MyLogger::class)
    ->bind(JwtTokenStorageInterface::class, DbJwtTokenStorageProvider::class);
$novaPostApi = (new NovaPostApiFactory())(
apiKey: $apiKey,
containerBuilder: $containerBuilder
);
$payload = [
// calculation parameters
];
$response = $novaPostApi->shipments()->calculate($payload);
} catch (ApiException $e) {
echo 'API Error => ' . $e->getMessage() . ' (Code => ' . $e->getCode() . ')';
} 
```

#### Available Service Overrides

With `ContainerBuilder`, you can override the following services:

<table><thead><tr><th width="469">Service</th><th>Purpose</th></tr></thead><tbody><tr><td>Psr\Log\LoggerInterface</td><td>Custom logging</td></tr><tr><td>Psr\Http\Client\ClientInterface</td><td>Custom HTTP client configuration</td></tr><tr><td>NovaDigital\NovaPost\Storage\JwtTokenStorageInterface</td><td>Custom JWT token storage</td></tr><tr><td>NovaDigital\NovaPost\Http\ResponseHandlerInterface</td><td>Custom response processing</td></tr><tr><td>NovaDigital\NovaPost\Http\RetryHandlerInterface</td><td>Custom retry logic</td></tr></tbody></table>

#### PSR Compliance

The **NovaPost API SDK** complies with the following PSR standards, ensuring compatibility, modern design, and high code quality:

<table data-search="false"><thead><tr><th width="362">Standard</th><th>Purpose</th></tr></thead><tbody><tr><td><strong>PSR-4: Autoloader</strong></td><td>For class autoloading</td></tr><tr><td><strong>PSR-11: Container Interface</strong></td><td>For a flexible dependency container</td></tr><tr><td><strong>PSR-3: Logger Interface</strong></td><td>Allows using any compatible logger</td></tr><tr><td><strong>PSR-7: HTTP Message Interface</strong></td><td>Used for all API requests and responses</td></tr><tr><td><strong>PSR-18: HTTP Client</strong></td><td>For sending HTTP requests</td></tr><tr><td><strong>PSR-17: HTTP Factories</strong></td><td>For creating PSR-7 messages</td></tr><tr><td><strong>PSR-12: Extended Coding Standard</strong></td><td>For coding style</td></tr></tbody></table>

Following these standards makes the SDK reliable, predictable, and easy to integrate into any modern PHP application.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/internal-solutions/sdk-for-php.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
